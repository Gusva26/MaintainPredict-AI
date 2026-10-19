import { and, eq, gte, lt, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { predictions, maintenanceOrders } from '@/lib/db/schema';
import { env } from '@/lib/env';

export type FalsePositiveReport = {
  windowDays: number;
  /** Umbral aplicado (H.7): por defecto `FALSE_POSITIVE_THRESHOLD` (0,70). */
  threshold: number;
  highRiskPredictions: number;
  truePositives: number;
  falsePositivesAuto: number;
  falsePositivesManual: number;
  falsePositiveRate: number;
  examples: { predictionId: number; equipmentId: number; probability: number; createdAt: string }[];
};

/**
 * Detección de falsos positivos (riesgo 28):
 *
 *   AUTO: predicción >= umbral sin orden completada en la ventana de la predicción (windowDays).
 *   MANUAL: órdenes completadas con nota marcada "[FALSO_POSITIVO]" por el técnico.
 *
 * El umbral sale de `FALSE_POSITIVE_THRESHOLD` (0,70 por defecto) y se puede pasar explícito
 * para **simular** otro valor desde el panel (H.7) sin cambiar la configuración del despliegue.
 */
export async function detectFalsePositives(
  windowDays = 7,
  threshold = env.FALSE_POSITIVE_THRESHOLD,
): Promise<FalsePositiveReport> {
  const end = new Date();
  const start = new Date(end.getTime() - windowDays * 86400_000);
  const minProb = String(threshold);

  const [highRisk] = await db.select({ n: sql<number>`count(*)::int` })
    .from(predictions)
    .where(and(
      gte(predictions.createdAt, start),
      lt(predictions.createdAt, end),
      gte(predictions.failureProbability, minProb),
    ));

  // TP: existen órdenes completadas para la predicción
  const [tp] = await db.select({ n: sql<number>`count(distinct ${predictions.predictionId})::int` })
    .from(predictions)
    .innerJoin(maintenanceOrders, eq(maintenanceOrders.predictionId, predictions.predictionId))
    .where(and(
      gte(predictions.createdAt, start),
      lt(predictions.createdAt, end),
      gte(predictions.failureProbability, minProb),
      eq(maintenanceOrders.status, 'completed'),
      isNotNull(maintenanceOrders.completedAt),
    ));

  // FP manual: órdenes completadas con nota marcada
  const [fpManual] = await db.select({ n: sql<number>`count(*)::int` })
    .from(maintenanceOrders)
    .where(and(
      gte(maintenanceOrders.createdAt, start),
      lt(maintenanceOrders.createdAt, end),
      eq(maintenanceOrders.status, 'completed'),
      sql`${maintenanceOrders.notes} ILIKE '%[FALSO_POSITIVO]%'`,
    ));

  // FP auto: highRisk - TP (mínimo 0)
  const hp = highRisk?.n ?? 0;
  const tpn = tp?.n ?? 0;
  const fpAuto = Math.max(0, hp - tpn - (fpManual?.n ?? 0));
  const fpRate = hp > 0 ? (fpAuto + (fpManual?.n ?? 0)) / hp : 0;

  // Ejemplos
  const examples = await db.select({
    predictionId: predictions.predictionId,
    equipmentId: predictions.equipmentId,
    probability: sql<number>`${predictions.failureProbability}::numeric`,
    createdAt: predictions.createdAt,
  })
    .from(predictions)
    .where(and(
      gte(predictions.createdAt, start),
      gte(predictions.failureProbability, minProb),
      sql`NOT EXISTS (
        SELECT 1 FROM maintenance_orders mo
        WHERE mo.prediction_id = ${predictions.predictionId}
          AND mo.status = 'completed'
      )`,
    ))
    .orderBy(sql`${predictions.failureProbability} desc`)
    .limit(20);

  return {
    windowDays,
    threshold,
    highRiskPredictions: hp,
    truePositives: tpn,
    falsePositivesAuto: fpAuto,
    falsePositivesManual: fpManual?.n ?? 0,
    falsePositiveRate: Number(fpRate.toFixed(4)),
    examples: examples.map((e) => ({
      predictionId: e.predictionId,
      equipmentId: e.equipmentId,
      probability: Number(e.probability),
      createdAt: e.createdAt?.toISOString() ?? '',
    })),
  };
}

/**
 * Marca una orden como falso positivo (manual, desde el técnico).
 * Se usa desde el endpoint de completar orden cuando el técnico indica
 * "no se encontró falla".
 */
export async function markOrderAsFalsePositive(orderId: number, userId: number) {
  const [order] = await db.select().from(maintenanceOrders).where(eq(maintenanceOrders.orderId, orderId)).limit(1);
  if (!order) throw Object.assign(new Error('Orden no encontrada'), { status: 404 });

  const currentNotes = order.notes ?? '';
  const marked = currentNotes.includes('[FALSO_POSITIVO]')
    ? currentNotes
    : `[FALSO_POSITIVO] ${currentNotes}`.trim();

  await db.update(maintenanceOrders)
    .set({ notes: marked })
    .where(eq(maintenanceOrders.orderId, orderId));
}
