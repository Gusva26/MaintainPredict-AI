import { and, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { modelMetrics, predictions } from '@/lib/db/schema';
import { env } from '@/lib/env';

export type ModelMetricsSnapshot = {
  modelVersion: string;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
  falsePositiveRate: number;
  evaluatedAt: string;
  windowDays: number;
};

/**
 * Ancla una fecha a la hora en curso (H.5).
 *
 * El snapshot se identifica por `(model_version, metric_name, window_start)`. Si la ventana
 * empezara en el instante exacto de cada llamada, dos sincronizaciones seguidas crearían 10
 * filas distintas (dos series casi idénticas) y el panel mostraría duplicados. Anclando a la
 * hora, repetir el sync dentro de la misma hora **actualiza** el mismo registro y solo se crea
 * una fila nueva por hora y ventana (que es, además, una serie temporal legible).
 */
export function anchorToHour(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * Llama al ML service /ml/metrics y persiste el snapshot en model_metrics
 * (idempotente por hora y ventana: `ON CONFLICT ... DO UPDATE`).
 * Además calcula la tasa de falsos positivos sobre la ventana a partir de
 * predicciones de alta probabilidad sin orden completada con falla real.
 *
 * `threshold` es el umbral de "alta probabilidad" y sale de `FALSE_POSITIVE_THRESHOLD`
 * (por defecto 0,70). Se puede pasar explícito para simular otro umbral (H.7).
 */
export async function syncModelMetrics(windowDays = 7, threshold = env.FALSE_POSITIVE_THRESHOLD): Promise<ModelMetricsSnapshot> {
  const now = new Date();
  const windowEnd = anchorToHour(now);
  const windowStart = new Date(windowEnd.getTime() - windowDays * 86400_000);
  const minProb = String(threshold);

  // 1. Métricas del ML service (o fallback si no responde)
  let ml: { model_version: string; precision: number; recall: number; f1: number; auc: number } = {
    model_version: 'unavailable',
    precision: 0, recall: 0, f1: 0, auc: 0,
  };
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}/ml/metrics`, { cache: 'no-store' });
    if (res.ok) ml = await res.json();
  } catch { /* ML service caído: seguimos con fallback */ }

  // 2. Falsos positivos reales observados en la ventana
  //    = predicciones >= umbral cuyo equipo NO tuvo orden completada con falla reportada
  //    Lo calculamos con SQL para eficiencia.
  const [fpRow] = await db.select({
    n: sql<number>`count(*)::int`,
  }).from(predictions)
    .where(and(
      gte(predictions.createdAt, windowStart),
      gte(predictions.failureProbability, minProb),
    ));

  const [tpRow] = await db.select({
    n: sql<number>`count(*)::int`,
  }).from(predictions)
    .where(and(
      gte(predictions.createdAt, windowStart),
      gte(predictions.failureProbability, minProb),
      sql`EXISTS (
        SELECT 1 FROM maintenance_orders mo
        WHERE mo.prediction_id = ${predictions.predictionId}
          AND mo.status = 'completed'
          AND mo.completed_at IS NOT NULL
      )`,
    ));

  const totalHighRisk = fpRow?.n ?? 0;
  const truePositives = tpRow?.n ?? 0;
  const falsePositiveRate = totalHighRisk > 0
    ? Math.max(0, (totalHighRisk - truePositives) / totalHighRisk)
    : 0;

  // 3. Persistir en model_metrics (idempotente)
  const rows = [
    { modelVersion: ml.model_version, metricName: 'precision', metricValue: String(ml.precision) },
    { modelVersion: ml.model_version, metricName: 'recall', metricValue: String(ml.recall) },
    { modelVersion: ml.model_version, metricName: 'f1', metricValue: String(ml.f1) },
    { modelVersion: ml.model_version, metricName: 'auc', metricValue: String(ml.auc) },
    { modelVersion: ml.model_version, metricName: 'false_positives', metricValue: String(falsePositiveRate) },
  ];
  await db.insert(modelMetrics)
    .values(rows.map((r) => ({
      modelVersion: r.modelVersion,
      metricName: r.metricName,
      metricValue: r.metricValue,
      windowStart,
      windowEnd,
    })))
    .onConflictDoUpdate({
      target: [modelMetrics.modelVersion, modelMetrics.metricName, modelMetrics.windowStart],
      set: {
        metricValue: sql`excluded.metric_value`,
        windowEnd: sql`excluded.window_end`,
        createdAt: sql`now()`,
      },
    });

  return {
    modelVersion: ml.model_version,
    precision: ml.precision,
    recall: ml.recall,
    f1: ml.f1,
    auc: ml.auc,
    falsePositiveRate,
    evaluatedAt: now.toISOString(),
    windowDays,
  };
}

/** Devuelve el último snapshot por métrica. */
export async function getLatestMetrics() {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (metric_name)
      metric_name, metric_value, model_version, window_start, window_end
    FROM model_metrics
    ORDER BY metric_name, created_at DESC
  `) as unknown as {
    metric_name: string; metric_value: string; model_version: string;
    window_start: string; window_end: string;
  }[];
  return rows.map((r) => ({
    metric: r.metric_name,
    value: Number(r.metric_value),
    modelVersion: r.model_version,
    windowStart: r.window_start,
    windowEnd: r.window_end,
  }));
}
