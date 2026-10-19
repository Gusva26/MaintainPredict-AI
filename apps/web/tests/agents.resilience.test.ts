import { describe, it, expect } from 'vitest';
import { withTimeout, withRetry, TimeoutError } from '../lib/agents/resilience';
import { buildFallbackExplanation } from '../lib/agents/predictor';
import { sealDraftOrder, sealPlannerOutput, HITL_THRESHOLD_H } from '../lib/agents/planner';

/**
 * Fase E: resiliencia de los agentes y reglas que NO se delegan al LLM.
 * Todo es determinista y sin red, así que estos tests son rápidos y estables.
 */

describe('withTimeout (corte por tiempo)', () => {
  it('deja pasar un resultado rápido', async () => {
    await expect(withTimeout(Promise.resolve(42), 100, 'prueba')).resolves.toBe(42);
  });

  it('corta una promesa que nunca responde', async () => {
    const colgada = new Promise<never>(() => {});
    await expect(withTimeout(colgada, 20, 'ML')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('con un plazo no positivo no corta nada', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 0)).resolves.toBe('ok');
  });
});

describe('withRetry (reintentos con backoff)', () => {
  it('reintenta y acaba devolviendo el resultado', async () => {
    let intentos = 0;
    const out = await withRetry(
      async (n) => {
        intentos += 1;
        if (n < 2) throw new Error('fallo transitorio');
        return 'ok';
      },
      { retries: 3, timeoutMs: 200, baseDelayMs: 1, label: 'prueba' },
    );

    expect(out).toBe('ok');
    expect(intentos).toBe(3);
  });

  it('relanza el último error al agotar los intentos', async () => {
    let intentos = 0;
    await expect(
      withRetry(
        async () => {
          intentos += 1;
          throw new Error(`boom-${intentos}`);
        },
        { retries: 2, timeoutMs: 100, baseDelayMs: 1, label: 'prueba' },
      ),
    ).rejects.toThrow('boom-3');
    expect(intentos).toBe(3);
  });

  it('corta por tiempo los intentos que no responden', async () => {
    let intentos = 0;
    await expect(
      withRetry(
        async () => {
          intentos += 1;
          return new Promise<never>(() => {});
        },
        { retries: 1, timeoutMs: 20, baseDelayMs: 1, label: 'ML' },
      ),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(intentos).toBe(2);
  });
});

const inputPrediccion = {
  equipmentId: 7,
  equipmentName: 'EQ-00007-Pump',
  equipmentType: 'Pump',
  criticality: 'high',
  signals: [{ type: 'vibration', value: 8.5, min: 0, max: 11, unit: 'mm/s' }],
};

describe('Relato de respaldo del PredictorAgent (sin LLM)', () => {
  it('cita las fuentes RAG recuperadas con su similitud', () => {
    const texto = buildFallbackExplanation(
      inputPrediccion,
      { failure_probability: 0.82, component: 'bearing', window: '7d' },
      [
        { title: 'ISO 10816 — Vibración', similarity: 0.91 },
        { title: 'Manual de bombas centrífugas', similarity: 0.8 },
      ],
    );

    expect(texto).toContain('82.0%');
    expect(texto).toContain('bearing');
    expect(texto).toContain('ISO 10816 — Vibración');
    expect(texto).toContain('0.91');
    expect(texto).toContain('Manual de bombas centrífugas');
  });

  it('si no hay documentación recuperada, lo dice explícitamente', () => {
    const texto = buildFallbackExplanation(
      inputPrediccion,
      { failure_probability: 0.5, component: 'motor', window: '7d' },
      [],
    );

    expect(texto).toMatch(/sin LLM/i);
    expect(texto).toContain('motor');
  });
});

const ctx = {
  input: {
    predictionId: 1,
    equipmentId: 7,
    component: 'bearing',
    failureProbability: 0.92,
    window: '7d',
    criticality: 'critical',
    downtimeCostEurH: 1200,
  },
  techs: [
    { userId: 5, fullName: 'Marta Técnica', openOrders: 1 },
    { userId: 6, fullName: 'Ana Técnica', openOrders: 4 },
  ],
  parts: [{ sku: 'BRG-6205', qty: 2, lead_days: 3 }],
  windows: [
    { date: '2026-10-19T02:00:00.000Z', criticality_ok: false },
    { date: '2026-10-20T02:00:00.000Z', criticality_ok: true },
    { date: '2026-10-22T02:00:00.000Z', criticality_ok: true },
  ],
};

describe('schedule_order: las reglas las decide el código, no el LLM', () => {
  it('aplica la regla HITL por encima del umbral y deriva el estado', () => {
    const borrador = sealDraftOrder({ estimated_downtime_h: 6 }, ctx);

    expect(HITL_THRESHOLD_H).toBe(4);
    expect(borrador.requires_hitl).toBe(true);
    expect(borrador.status).toBe('pending_approval');
  });

  it('no exige HITL por debajo del umbral', () => {
    const borrador = sealDraftOrder({ estimated_downtime_h: 2.5 }, ctx);

    expect(borrador.requires_hitl).toBe(false);
    expect(borrador.status).toBe('planned');
  });

  it('ignora una parada absurda y usa 3 h por defecto', () => {
    const borrador = sealDraftOrder({ estimated_downtime_h: -5 }, ctx);

    expect(borrador.estimated_downtime_h).toBe(3);
    expect(borrador.status).toBe('planned');
  });

  it('asigna el técnico de menor carga si el id propuesto no existe', () => {
    const borrador = sealDraftOrder({ technician_id: 999, estimated_downtime_h: 2 }, ctx);

    expect(borrador.technician_id).toBe(5);
    expect(borrador.technician_name).toBe('Marta Técnica');
  });

  it('rechaza una ventana de parada no permitida para la criticidad', () => {
    // El 19 no es válido para un equipo crítico (producción crítica): se reprograma.
    const borrador = sealDraftOrder(
      { scheduled_date: '2026-10-19T02:00:00.000Z', estimated_downtime_h: 2 },
      ctx,
    );

    expect(borrador.scheduled_date).toBe('2026-10-20T02:00:00.000Z');
  });

  it('respeta una ventana propuesta que sí es válida', () => {
    const borrador = sealDraftOrder(
      { scheduled_date: '2026-10-22T02:00:00.000Z', estimated_downtime_h: 2 },
      ctx,
    );

    expect(borrador.scheduled_date).toBe('2026-10-22T02:00:00.000Z');
  });

  it('normaliza los repuestos y cae al ERP si no hay ninguno utilizable', () => {
    const conBasura = sealDraftOrder(
      { parts: [{ sku: '  X-1 ', qty: 0 }, { sku: '', qty: 3 }], estimated_downtime_h: 2 },
      ctx,
    );
    expect(conBasura.parts).toEqual([{ sku: 'X-1', qty: 1 }]);

    const sinRepuestos = sealDraftOrder({ parts: [], estimated_downtime_h: 2 }, ctx);
    expect(sinRepuestos.parts).toEqual([{ sku: 'BRG-6205', qty: 2 }]);
  });

  it('deriva la prioridad de la probabilidad si el LLM propone una inválida', () => {
    expect(sealDraftOrder({ priority: 'urgentísimo', estimated_downtime_h: 2 }, ctx).priority).toBe('critical');
    expect(sealDraftOrder({ priority: 'low', estimated_downtime_h: 2 }, ctx).priority).toBe('low');
  });
});

describe('sealPlannerOutput', () => {
  it('rellena order_id con el id real una vez persistida la orden', () => {
    const borrador = sealDraftOrder({ estimated_downtime_h: 5 }, ctx);
    const plan = {
      order_id: null,
      ...borrador,
      reasoning: 'Justificación.',
      technician: borrador.technician_name,
      rag_sources: [],
    };

    const sellado = sealPlannerOutput(plan, 128);

    expect(sellado.order_id).toBe(128);
    expect(sellado.technician).toBe('Marta Técnica');
    expect(sellado.status).toBe('pending_approval');
  });
});
