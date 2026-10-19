import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { PredictionDetail } from '@/components/predictions/PredictionDetail';

// El detalle usa SWR, next/link y RoleGuard; se sustituyen por versiones simples.
const state = vi.hoisted(() => ({ payload: {} as any }));

vi.mock('swr', () => ({ default: () => state.payload }));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

vi.mock('@/lib/hooks/useRbac', () => ({
  useRbac: () => ({
    session: { id: 1, email: 'admin@mp.ai', name: 'Admin', role: 'admin' as const },
    can: () => true,
  }),
}));

afterEach(() => vi.restoreAllMocks());

// Forma EXACTA de `predictions.features` (jsonb) y de la respuesta de la API real.
const prediccionCompleta = {
  prediction: {
    predictionId: 173, equipmentId: 11, component: 'bearing', failureProbability: 0.907,
    windowDays: 7, modelVersion: 'rf-v1.0.0',
    explanation: 'El rodamiento muestra una vibración en zona C según la ISO 10816.',
    createdAt: '2026-10-18T23:20:41.512Z', alert: true,
    features: {
      inputs: [
        { type: 'vibration', value: 10.7, min: 0, max: 11, unit: 'mm/s' },
        { type: 'temperature', value: 9.4, min: 0, max: 95, unit: '°C' },
      ],
      top_features: [
        { feature: 'vibration.ratio', value: 0.973 },
        { feature: 'pressure.ratio', value: 0.907 },
      ],
      rag_sources: [{ doc_id: 3, title: 'Norma ISO 10816 — vibración mecánica', similarity: 0.68 }],
    },
  },
  equipment: {
    equipmentId: 11, name: 'EQ-00003-Pump', type: 'Pump', location: 'Planta-1/Linea-2',
    criticality: 'critical', status: 'operational', downtimeCostEurH: '1800.00', installationDate: null,
  },
  orders: [
    {
      orderId: 136, equipmentId: 11, predictionId: 173, scheduledDate: '2026-10-20T02:00:00.000Z',
      technicianId: 5, parts: [{ sku: 'BRG-6205', qty: 2 }], estimatedDowntimeH: '5.00',
      status: 'pending_approval', priority: 'critical', notes: 'Parada larga', requiresHitl: true,
      createdAt: '2026-10-18T23:25:00.000Z',
      technician: { userId: 5, fullName: 'Marta Técnica', email: 'tec2@mp.ai' },
    },
  ],
  hasOrder: true,
};

const prediccionSinDatos = {
  prediction: {
    predictionId: 183, equipmentId: 2500, component: 'unknown', failureProbability: 0.077,
    windowDays: 7, modelVersion: 'rf-v1.0.0', explanation: null,
    createdAt: '2026-10-18T23:40:00.000Z', alert: false,
    features: { inputs: [], top_features: [], rag_sources: [] },
  },
  equipment: null,
  orders: [],
  hasOrder: false,
};

describe('PredictionDetail', () => {
  it('muestra probabilidad, pesos por señal, lecturas, RAG y órdenes derivadas', () => {
    state.payload = { data: { data: prediccionCompleta }, isLoading: false };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<PredictionDetail id={173} />);
    const texto = container.textContent ?? '';

    expect(texto).toContain('#173');
    expect(texto).toContain('EQ-00003-Pump');
    expect(texto).toContain('91%');                 // ProbabilityGauge
    expect(texto).toContain('bearing');
    expect(texto).toContain('vibration.ratio');     // peso de la señal
    expect(texto).toContain('0.973');
    expect(texto).toContain('10.7');                // lectura y su umbral
    expect(texto).toContain('mm/s');
    expect(texto).toContain('Norma ISO 10816');     // RAG
    expect(texto).toContain('similitud 0.68');
    expect(texto).toContain('#136');                // orden derivada
    expect(texto).toContain('Marta Técnica');
    expect(texto).toContain('pending_approval');
    expect(texto).toContain('sí');                  // requiere HITL

    // Con orden ya creada no se ofrece volver a planificar.
    expect(texto).not.toContain('Generar orden');

    expect(texto).not.toContain('undefined');
    expect(error.mock.calls.map((c) => c.map(String).join(' ')).join('\n')).not.toMatch(/unique "key"/i);
  });

  it('degrada con elegancia cuando la predicción no trae features ni órdenes', () => {
    state.payload = { data: { data: prediccionSinDatos }, isLoading: false };
    const { container } = render(<PredictionDetail id={183} />);
    const texto = container.textContent ?? '';

    expect(texto).toContain('no devolvió pesos por señal');
    expect(texto).toContain('No se registraron lecturas');
    expect(texto).toContain('No se recuperó documentación');
    expect(texto).toContain('Todavía no hay ninguna orden');
    // Sin orden y con permiso de creación, sí se ofrece planificar.
    expect(texto).toContain('Generar orden (auto-plan)');
    expect(texto).toContain('Sin explicación registrada');

    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('NaN');
  });

  it('avisa en lugar de romper si la predicción no existe', () => {
    state.payload = {
      data: undefined,
      isLoading: false,
      error: Object.assign(new Error('Predicción no encontrada'), { status: 404 }),
    };
    const { container } = render(<PredictionDetail id={999} />);

    expect(container.textContent).toContain('No se ha podido cargar la predicción #999');
    expect(container.textContent).toContain('Predicción no encontrada');
  });
});
