import 'dotenv/config';
import { desc, eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { equipment, readings, sensors } from '../lib/db/schema';
import { runPredictorAgent } from '../lib/agents/predictor';
import { runPlannerAgent, HITL_THRESHOLD_H } from '../lib/agents/planner';

/**
 * Diagnóstico de los agentes (PredictorAgent y PlannerAgent).
 *
 * Ejercita las dos rutas de verdad: el servicio ML/LLM si están disponibles y,
 * si no, los respaldos. Sirve para validar la fase E a mano:
 *
 *   # Normal (usa ML + LLM reales si están configurados)
 *   docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsx scripts/check-agents.ts'
 *
 *   # Forzando el fallback del ML (URL inalcanzable + timeout corto)
 *   docker compose exec -T -e ML_SERVICE_URL=http://10.255.255.1:8000 \
 *     -e AGENT_TIMEOUT_MS=500 -e AGENT_RETRIES=1 web \
 *     sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsx scripts/check-agents.ts'
 *
 *   # Forzando el fallback del LLM (clave inválida)
 *   docker compose exec -T -e OPENAI_API_KEY=sk-invalida web \
 *     sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsx scripts/check-agents.ts'
 */
async function main() {
  const [eq_] = await db.select().from(equipment).orderBy(desc(equipment.equipmentId)).limit(1);
  if (!eq_) {
    console.error('No hay equipos en la base de datos. Ejecuta antes los seeds.');
    process.exitCode = 1;
    return;
  }

  const sensores = await db.select().from(sensors).where(eq(sensors.equipmentId, eq_.equipmentId));
  const signals: { type: string; value: number; min: number; max: number; unit?: string }[] = [];

  for (const s of sensores.slice(0, 3)) {
    const [ultima] = await db
      .select()
      .from(readings)
      .where(eq(readings.sensorId, s.sensorId))
      .orderBy(desc(readings.recordedAt))
      .limit(1);
    signals.push({
      type: s.type,
      value: Number(ultima?.value ?? 8.5),
      min: Number(s.minThreshold ?? 0),
      max: Number(s.maxThreshold ?? 100),
      unit: s.unit ?? undefined,
    });
  }

  console.log(`Equipo: ${eq_.equipmentId} — ${eq_.name} (${eq_.type}, criticidad ${eq_.criticality})`);
  console.log(`Señales: ${signals.map((s) => `${s.type}=${s.value}${s.unit ?? ''}`).join(', ')}\n`);

  // ── PredictorAgent ───────────────────────────────────────────────
  const t0 = Date.now();
  const pred = await runPredictorAgent({
    equipmentId: eq_.equipmentId,
    equipmentName: eq_.name,
    equipmentType: eq_.type ?? 'unknown',
    criticality: eq_.criticality ?? 'medium',
    signals,
  });
  const msPred = Date.now() - t0;

  console.log('[PredictorAgent]');
  console.log(`  probabilidad .......... ${(pred.failure_probability * 100).toFixed(1)} %`);
  console.log(`  componente ............ ${pred.component}`);
  console.log(`  ventana ............... ${pred.window}`);
  console.log(`  versión del modelo .... ${pred.model_version}`);
  console.log(`  fuentes RAG ........... ${pred.rag_sources.length}`);
  console.log(`  explicación ........... ${pred.explanation}`);
  console.log(`  duración .............. ${msPred} ms`);

  // La explicación de respaldo cita el RAG; si el LLM ha respondido, también.
  const cita = pred.rag_sources.length === 0 || /RAG|consultad|manual|ISO|documentaci/i.test(pred.explanation);
  console.log(`  ${cita ? '✓' : '✗'} la explicación menciona la documentación consultada`);
  if (!cita) process.exitCode = 1;

  // ── PlannerAgent ─────────────────────────────────────────────────
  const t1 = Date.now();
  const plan = await runPlannerAgent({
    predictionId: 1,
    equipmentId: eq_.equipmentId,
    component: pred.component,
    failureProbability: pred.failure_probability,
    window: pred.window,
    criticality: eq_.criticality ?? 'medium',
    downtimeCostEurH: Number(eq_.downtimeCostEurH ?? 0),
  });
  const msPlan = Date.now() - t1;

  console.log('\n[PlannerAgent]');
  console.log(`  fecha programada ...... ${plan.scheduled_date}`);
  console.log(`  técnico ............... ${plan.technician} (#${plan.technician_id})`);
  console.log(`  repuestos ............. ${plan.parts.map((p) => `${p.sku} x${p.qty}`).join(', ') || '—'}`);
  console.log(`  parada estimada ....... ${plan.estimated_downtime_h} h`);
  console.log(`  prioridad ............. ${plan.priority}`);
  console.log(`  requiere HITL ......... ${plan.requires_hitl}`);
  console.log(`  estado de la orden .... ${plan.status}`);
  console.log(`  order_id .............. ${plan.order_id} (lo rellena el endpoint al insertar)`);
  console.log(`  razonamiento .......... ${plan.reasoning}`);
  console.log(`  duración .............. ${msPlan} ms`);

  const checks: [string, boolean][] = [
    ['la regla HITL se aplica de verdad', plan.requires_hitl === (plan.estimated_downtime_h > HITL_THRESHOLD_H)],
    ['el estado deriva de la regla HITL', plan.status === (plan.requires_hitl ? 'pending_approval' : 'planned')],
    ['si hay técnico, viene también su nombre', plan.technician_id === null || (plan.technician ?? '').length > 0],
    ['la salida trae `technician` (forma de la spec)', 'technician' in plan],
    ['la fecha es válida', !Number.isNaN(new Date(plan.scheduled_date).getTime())],
  ];

  console.log();
  let fallos = 0;
  for (const [nombre, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${nombre}`);
    if (!ok) fallos += 1;
  }

  if (fallos > 0) {
    console.error(`\n${fallos} comprobación(es) de agentes han fallado.`);
    process.exitCode = 1;
  } else {
    console.log('\nAgentes OK.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
