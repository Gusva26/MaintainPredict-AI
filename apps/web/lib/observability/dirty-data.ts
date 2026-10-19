import { and, eq, gte, lt, sql, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { readings, sensors, auditLog } from '@/lib/db/schema';

export type DirtyDataReport = {
  scanned: number;
  flaggedByRange: number;
  flaggedByOutlier: number;
  /** Nuevos: valores fuera del rango intercuartílico (H.6). */
  flaggedByIqr: number;
  /**
   * Lecturas que **ya** venían marcadas por el clasificador de ingesta (`fn_classify_reading`:
   * `suspect`/`bad`) dentro de la ventana, es decir, sucias antes de este escaneo. Es una
   * medida del ruido de entrada, no del escaneo.
   */
  flaggedByQuality: number;
  flaggedTotal: number;
  windowStart: string;
  windowEnd: string;
  details: { sensorId: number; readingId: number; reason: string; value: number }[];
};

/**
 * Estrategia de datos sucios (riesgo 28):
 *   1. Fuera de rango: value < min_threshold o > max_threshold → 'suspect'
 *   2. Outlier por z-score: |z| > zThreshold (3) sobre la ventana del mismo sensor.
 *   3. Outlier por IQR (H.6): fuera de [Q1 − 1,5·IQR, Q3 + 1,5·IQR]. Detecta colas que el
 *      z-score no ve cuando la desviación estándar sale inflada por los propios outliers.
 *   4. Las lecturas que ya venían `suspect`/`bad` se cuentan aparte (`flaggedByQuality`) y no
 *      se vuelven a marcar.
 *
 * Los 'suspect' se excluyen del entrenamiento (ya filtrados en /api/predict y en el ML service).
 * Se registra auditoría y se puede lanzar manualmente o vía WF-04.
 */
export async function scanDirtyData(
  windowHours = 24,
  zThreshold = 3,
  iqrMultiplier = 1.5,
): Promise<DirtyDataReport> {
  const end = new Date();
  const start = new Date(end.getTime() - windowHours * 3600_000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // 1. Filas candidatas (quality = 'good') con su motivo, si lo hay.
  const scan = await db.execute(sql`
    WITH win AS (
      SELECT reading_id, sensor_id, value, quality
      FROM readings
      WHERE recorded_at >= ${startIso} AND recorded_at < ${endIso}
    ),
    stats AS (
      SELECT sensor_id,
             avg(value) AS avg_v,
             stddev_pop(value) AS std_v,
             percentile_cont(0.25) WITHIN GROUP (ORDER BY value) AS q1,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS q3
      FROM win
      WHERE quality = 'good'
      GROUP BY sensor_id
      HAVING count(*) >= 5
    )
    SELECT w.reading_id, w.sensor_id, w.value, w.quality,
           st.avg_v, st.std_v, st.q1, st.q3,
           CASE
             WHEN s.max_threshold IS NOT NULL AND w.value > s.max_threshold THEN 'range_high'
             WHEN s.min_threshold IS NOT NULL AND w.value < s.min_threshold THEN 'range_low'
             WHEN st.std_v IS NOT NULL AND st.std_v > 0
                  AND abs((w.value - st.avg_v) / st.std_v) > ${zThreshold} THEN 'outlier_z'
             WHEN st.q1 IS NOT NULL AND st.q3 IS NOT NULL
                  AND (w.value < st.q1 - ${iqrMultiplier} * (st.q3 - st.q1)
                       OR w.value > st.q3 + ${iqrMultiplier} * (st.q3 - st.q1)) THEN 'outlier_iqr'
             ELSE NULL
           END AS reason
    FROM win w
    JOIN sensors s ON s.sensor_id = w.sensor_id
    LEFT JOIN stats st ON st.sensor_id = w.sensor_id
    WHERE w.quality = 'good'
  `) as unknown as {
    reading_id: number; sensor_id: number; value: string; quality: string;
    avg_v: string | null; std_v: string | null; q1: string | null; q3: string | null;
    reason: string | null;
  }[];

  // 2. Lecturas que ya venían sucias por el clasificador de ingesta (antes de este escaneo).
  const [alreadyDirty] = await db.select({ n: sql<number>`count(*)::int` })
    .from(readings)
    .where(and(
      gte(readings.recordedAt, start),
      lt(readings.recordedAt, end),
      inArray(readings.quality, ['suspect', 'bad']),
    ));

  const flagged = scan.filter((r) => r.reason !== null);
  const flagIds = flagged.map((r) => r.reading_id);

  if (flagIds.length > 0) {
    await db.update(readings)
      .set({ quality: 'suspect' })
      .where(inArray(readings.readingId, flagIds));
  }

  // Auditoría
  if (flagIds.length > 0) {
    await db.insert(auditLog).values({
      userId: null,
      action: 'ingest_sensor',
      module: 'sensors',
      entityType: 'dirty_data_scan',
      payload: { flagged: flagIds.length, windowHours, zThreshold, iqrMultiplier },
    });
  }

  const byReason = flagged.reduce((acc, r) => {
    acc[r.reason!] = (acc[r.reason!] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    scanned: scan.length,
    flaggedByRange: (byReason.range_high ?? 0) + (byReason.range_low ?? 0),
    flaggedByOutlier: byReason.outlier_z ?? 0,
    flaggedByIqr: byReason.outlier_iqr ?? 0,
    flaggedByQuality: alreadyDirty?.n ?? 0,
    flaggedTotal: flagged.length,
    windowStart: startIso,
    windowEnd: endIso,
    details: flagged.slice(0, 50).map((r) => ({
      sensorId: r.sensor_id,
      readingId: r.reading_id,
      reason: r.reason!,
      value: Number(r.value),
    })),
  };
}
