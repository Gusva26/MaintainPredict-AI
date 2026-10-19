import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { maintenanceOrders, equipment, businessKpis, predictions } from '@/lib/db/schema';
import { env } from '@/lib/env';

export type BusinessKpiSnapshot = {
  downtimeAvoidedH: number;
  costSavingsEur: number;
  availability: number;
  totalEquipment: number;
  equipmentOperational: number;
  falsePositivesAuto: number;
  falsePositivesManual: number;
  periodStart: string;
  periodEnd: string;
};

/** Ancla al inicio de la hora en curso (ver `anchorToHour` en `metrics.ts`, H.5). */
function anchorToHour(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * Calcula los KPIs de negocio y los persiste en business_kpis.
 *
 * - Paradas evitadas: suma de estimated_downtime_h de órdenes generadas por predicción
 *   con probabilidad >= umbral y completadas con éxito en la ventana.
 * - Ahorro: paradas evitadas × downtime_cost_eur_h del equipo.
 * - Disponibilidad: ratio de equipos en estado operational.
 * - Falsos positivos: predicciones >= umbral sin orden completada.
 *
 * Idempotente (H.5): el periodo se ancla a la hora en curso y el `INSERT` usa
 * `ON CONFLICT (kpi_name, period_start) DO UPDATE`, así que dos sincronizaciones seguidas
 * actualizan la misma fila en lugar de duplicarla.
 *
 * `threshold` sale de `FALSE_POSITIVE_THRESHOLD` (0,70 por defecto) y es configurable (H.7).
 */
export async function syncBusinessKpis(windowDays = 30, threshold = env.FALSE_POSITIVE_THRESHOLD): Promise<BusinessKpiSnapshot> {
  const now = new Date();
  const periodEnd = anchorToHour(now);
  const start = new Date(periodEnd.getTime() - windowDays * 86400_000);
  const minProb = String(threshold);

  // 1. Paradas evitadas y ahorro
  const [savingRow] = await db.select({
    avoidedH: sql<number>`coalesce(sum(${maintenanceOrders.estimatedDowntimeH}), 0)::numeric`,
    savingsEur: sql<number>`coalesce(sum(${maintenanceOrders.estimatedDowntimeH} * ${equipment.downtimeCostEurH}), 0)::numeric`,
  })
    .from(maintenanceOrders)
    .innerJoin(equipment, eq(equipment.equipmentId, maintenanceOrders.equipmentId))
    .where(and(
      gte(maintenanceOrders.createdAt, start),
      eq(maintenanceOrders.status, 'completed'),
      sql`${maintenanceOrders.predictionId} IS NOT NULL`,
    ));

  // 2. Disponibilidad
  const [totalEq] = await db.select({ n: sql<number>`count(*)::int` }).from(equipment);
  const [opEq] = await db.select({ n: sql<number>`count(*)::int` }).from(equipment)
    .where(eq(equipment.status, 'operational'));
  const availability = totalEq.n > 0 ? opEq.n / totalEq.n : 0;

  // 3. Falsos positivos
  const [fpAuto] = await db.select({
    n: sql<number>`count(*)::int`,
  }).from(predictions)
    .where(and(
      gte(predictions.createdAt, start),
      gte(predictions.failureProbability, minProb),
      sql`NOT EXISTS (
        SELECT 1 FROM maintenance_orders mo
        WHERE mo.prediction_id = ${predictions.predictionId}
          AND mo.status = 'completed'
      )`,
    ));

  // Manuales: los que el técnico reportó como "no se encontró falla" (notas contienen marcador)
  const [fpManual] = await db.select({
    n: sql<number>`count(*)::int`,
  }).from(maintenanceOrders)
    .where(and(
      gte(maintenanceOrders.createdAt, start),
      eq(maintenanceOrders.status, 'completed'),
      sql`${maintenanceOrders.notes} ILIKE '%[FALSO_POSITIVO]%'`,
    ));

  const avoidedH = Number(savingRow?.avoidedH ?? 0);
  const savingsEur = Number(savingRow?.savingsEur ?? 0);

  // 4. Persistir (idempotente por hora y periodo)
  await db.insert(businessKpis)
    .values([
      { kpiName: 'downtime_avoided_h', kpiValue: String(avoidedH), periodStart: start, periodEnd },
      { kpiName: 'cost_savings_eur', kpiValue: String(savingsEur), periodStart: start, periodEnd },
      { kpiName: 'availability', kpiValue: String(availability), periodStart: start, periodEnd },
      { kpiName: 'false_positives_auto', kpiValue: String(fpAuto.n), periodStart: start, periodEnd },
      { kpiName: 'false_positives_manual', kpiValue: String(fpManual.n), periodStart: start, periodEnd },
    ])
    .onConflictDoUpdate({
      target: [businessKpis.kpiName, businessKpis.periodStart],
      set: {
        kpiValue: sql`excluded.kpi_value`,
        periodEnd: sql`excluded.period_end`,
        createdAt: sql`now()`,
      },
    });

  return {
    downtimeAvoidedH: avoidedH,
    costSavingsEur: savingsEur,
    availability,
    totalEquipment: totalEq.n,
    equipmentOperational: opEq.n,
    falsePositivesAuto: fpAuto.n,
    falsePositivesManual: fpManual.n,
    periodStart: start.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

/** Objetivo vs. real (targets del 26). */
export async function getKpiComparison(windowDays = 30) {
  const now = new Date();
  const start = new Date(now.getTime() - windowDays * 86400_000);

  const rows = await db.execute(sql`
    SELECT kpi_name, sum(kpi_value)::numeric AS total
    FROM business_kpis
    WHERE period_end >= ${start.toISOString()} AND period_end < ${now.toISOString()}
    GROUP BY kpi_name
  `) as unknown as { kpi_name: string; total: string }[];

  const map = Object.fromEntries(rows.map((r) => [r.kpi_name, Number(r.total)]));
  return {
    downtimeAvoidedH: map.downtime_avoided_h ?? 0,
    costSavingsEur: map.cost_savings_eur ?? 0,
    availability: map.availability ?? 0,
    falsePositivesAuto: map.false_positives_auto ?? 0,
    falsePositivesManual: map.false_positives_manual ?? 0,
    targets: {
      downtimeReductionPct: -0.6,
      costReductionPct: -0.3,
      modelPrecision: 0.85,
      falsePositiveRateMax: 0.10, // tolerancia riesgo 28
    },
  };
}
