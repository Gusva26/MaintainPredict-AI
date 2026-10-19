import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { maintenanceOrders, predictions, equipment, modelMetrics, businessKpis } from '@/lib/db/schema';

/** Filtros opcionales del reporte (H.1). Sólo afectan a órdenes y predicciones. */
export type ReportFilters = {
  equipmentId?: number;
  technicianId?: number;
};

export type WeeklyReportData = {
  window: { start: string; end: string };
  generatedAt: string;
  /** Filtros aplicados (`null` = sin filtrar). */
  filters: { equipmentId: number | null; technicianId: number | null };
  /** Qué se ha contado (H.3): totales de la ventana y filas incluidas en el detalle. */
  counts: {
    ordersTotal: number;
    ordersIncluded: number;
    predictionsTotal: number;
    predictionsIncluded: number;
  };
  ordersByStatus: { status: string; n: number }[];
  ordersDetail: {
    orderId: number; equipmentName: string | null; status: string; priority: string;
    scheduledDate: string | null; technicianName: string | null;
    estimatedDowntimeH: number | null; requiresHitl: boolean;
  }[];
  topPredictions: {
    equipmentId: number; name: string | null; criticality: string | null;
    avgProb: number; maxProb: number; n: number;
  }[];
  predictionsDetail: {
    predictionId: number; equipmentName: string | null; component: string | null;
    failureProbability: number; windowDays: number | null; modelVersion: string | null;
    createdAt: string;
  }[];
  modelMetrics: { metric: string; value: number }[];
  businessKpis: { name: string; value: number }[];
  kpiTargets: { downtimeReduction: number; costReduction: number; modelPrecision: number };
};

/** Filas de detalle incluidas en el informe (el resto se resume en los totales). */
const ORDERS_DETAIL_LIMIT = 200;
const PREDICTIONS_DETAIL_LIMIT = 100;

/**
 * Caché en memoria del agregado (H.1).
 *
 * El informe cuesta 8 consultas y lo piden la web y WF-03 (a veces a la vez), así que se
 * guarda el JSON ya construido durante `REPORT_CACHE_TTL_MS` (60 s por defecto). La clave
 * incluye rango y filtros, de modo que un informe filtrado nunca sirve el de otro equipo.
 * Como el resultado (incluido `generatedAt`) es el mismo dentro del TTL, el `ETag` de
 * `/api/reports/weekly` se mantiene estable y el 304 funciona de verdad.
 *
 * Es una caché por proceso: con varias réplicas cada una tendría la suya. Para este
 * despliegue (una sola instancia de `web`) es suficiente y no añade infraestructura.
 */
const REPORT_CACHE_TTL_MS = Number(process.env.REPORT_CACHE_TTL_MS ?? 60_000);
const REPORT_CACHE_MAX = 50;
const reportCache = new Map<string, { at: number; data: WeeklyReportData }>();

/** Vacía la caché (tests, o tras un cambio que deba verse al instante). */
export function clearReportCache(): void {
  reportCache.clear();
}

function cacheKey(start: Date, end: Date, f: ReportFilters): string {
  return `${start.toISOString()}|${end.toISOString()}|${f.equipmentId ?? ''}|${f.technicianId ?? ''}`;
}

export async function aggregateWeeklyReport(
  start: Date,
  end: Date,
  filters: ReportFilters = {},
): Promise<WeeklyReportData> {
  const key = cacheKey(start, end, filters);

  const cached = reportCache.get(key);
  if (cached && Date.now() - cached.at < REPORT_CACHE_TTL_MS) return cached.data;

  const data = await buildWeeklyReport(start, end, filters);

  reportCache.set(key, { at: Date.now(), data });
  if (reportCache.size > REPORT_CACHE_MAX) {
    // Descarta la entrada más antigua (la caché es un mapa pequeño, no hace falta un LRU).
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [k, v] of reportCache) if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
    if (oldestKey) reportCache.delete(oldestKey);
  }

  return data;
}

async function buildWeeklyReport(
  start: Date,
  end: Date,
  filters: ReportFilters,
): Promise<WeeklyReportData> {
  // Órdenes: ventana + (equipo y/o técnico)
  const orderConds = [gte(maintenanceOrders.createdAt, start), lt(maintenanceOrders.createdAt, end)];
  if (filters.equipmentId) orderConds.push(eq(maintenanceOrders.equipmentId, filters.equipmentId));
  if (filters.technicianId) orderConds.push(eq(maintenanceOrders.technicianId, filters.technicianId));
  const orderWhere = and(...orderConds);

  // Predicciones: ventana + (equipo)
  const predConds = [gte(predictions.createdAt, start), lt(predictions.createdAt, end)];
  if (filters.equipmentId) predConds.push(eq(predictions.equipmentId, filters.equipmentId));
  const predWhere = and(...predConds);

  const [
    ordersByStatus, ordersDetail, ordersCount,
    topPredictions, predictionsDetail, predictionsCount,
    modelAgg, kpiAgg,
  ] = await Promise.all([
    db.select({
      status: maintenanceOrders.status,
      n: sql<number>`count(*)::int`,
    }).from(maintenanceOrders)
      .where(orderWhere)
      .groupBy(maintenanceOrders.status),

    db.select({
      orderId: maintenanceOrders.orderId,
      equipmentName: equipment.name,
      status: maintenanceOrders.status,
      priority: maintenanceOrders.priority,
      scheduledDate: maintenanceOrders.scheduledDate,
      technicianName: sql<string | null>`(
        SELECT full_name FROM users WHERE user_id = ${maintenanceOrders.technicianId} LIMIT 1
      )`,
      estimatedDowntimeH: maintenanceOrders.estimatedDowntimeH,
      requiresHitl: maintenanceOrders.requiresHitl,
    }).from(maintenanceOrders)
      .leftJoin(equipment, eq(equipment.equipmentId, maintenanceOrders.equipmentId))
      .where(orderWhere)
      .orderBy(desc(maintenanceOrders.createdAt))
      .limit(ORDERS_DETAIL_LIMIT),

    db.select({ n: sql<number>`count(*)::int` }).from(maintenanceOrders).where(orderWhere),

    db.select({
      equipmentId: predictions.equipmentId,
      name: equipment.name,
      criticality: equipment.criticality,
      avgProb: sql<number>`round(avg(${predictions.failureProbability})::numeric,3)`,
      maxProb: sql<number>`max(${predictions.failureProbability})::numeric`,
      n: sql<number>`count(*)::int`,
    }).from(predictions)
      .leftJoin(equipment, eq(equipment.equipmentId, predictions.equipmentId))
      .where(predWhere)
      .groupBy(predictions.equipmentId, equipment.name, equipment.criticality)
      .orderBy(desc(sql`max(${predictions.failureProbability})`))
      .limit(10),

    db.select({
      predictionId: predictions.predictionId,
      equipmentName: equipment.name,
      component: predictions.component,
      failureProbability: sql<number>`${predictions.failureProbability}::numeric`,
      windowDays: predictions.windowDays,
      modelVersion: predictions.modelVersion,
      createdAt: predictions.createdAt,
    }).from(predictions)
      .leftJoin(equipment, eq(equipment.equipmentId, predictions.equipmentId))
      .where(predWhere)
      .orderBy(desc(predictions.failureProbability))
      .limit(PREDICTIONS_DETAIL_LIMIT),

    db.select({ n: sql<number>`count(*)::int` }).from(predictions).where(predWhere),

    // Métricas y KPIs son agregados (no se filtran por equipo ni técnico): se documenta.
    db.select({
      metric: modelMetrics.metricName,
      value: sql<number>`round(avg(${modelMetrics.metricValue})::numeric,4)`,
    }).from(modelMetrics)
      .where(and(gte(modelMetrics.windowEnd, start), lt(modelMetrics.windowEnd, end)))
      .groupBy(modelMetrics.metricName),

    db.select({
      name: businessKpis.kpiName,
      value: sql<number>`round(sum(${businessKpis.kpiValue})::numeric,4)`,
    }).from(businessKpis)
      .where(and(gte(businessKpis.periodEnd, start), lt(businessKpis.periodEnd, end)))
      .groupBy(businessKpis.kpiName),
  ]);

  return {
    window: { start: start.toISOString(), end: end.toISOString() },
    generatedAt: new Date().toISOString(),
    filters: {
      equipmentId: filters.equipmentId ?? null,
      technicianId: filters.technicianId ?? null,
    },
    counts: {
      ordersTotal: ordersCount[0]?.n ?? 0,
      ordersIncluded: ordersDetail.length,
      predictionsTotal: predictionsCount[0]?.n ?? 0,
      predictionsIncluded: predictionsDetail.length,
    },
    ordersByStatus: ordersByStatus.map((s) => ({ status: s.status ?? 'unknown', n: s.n })),
    ordersDetail: ordersDetail.map((o) => ({
      orderId: o.orderId,
      equipmentName: o.equipmentName,
      status: o.status ?? 'planned',
      priority: o.priority ?? 'medium',
      scheduledDate: o.scheduledDate?.toISOString() ?? null,
      technicianName: o.technicianName ?? null,
      estimatedDowntimeH: o.estimatedDowntimeH != null ? Number(o.estimatedDowntimeH) : null,
      requiresHitl: !!o.requiresHitl,
    })),
    topPredictions: topPredictions.map((p) => ({
      equipmentId: p.equipmentId,
      name: p.name,
      criticality: p.criticality,
      avgProb: Number(p.avgProb),
      maxProb: Number(p.maxProb),
      n: p.n,
    })),
    predictionsDetail: predictionsDetail.map((p) => ({
      predictionId: p.predictionId,
      equipmentName: p.equipmentName,
      component: p.component,
      failureProbability: Number(p.failureProbability),
      windowDays: p.windowDays,
      modelVersion: p.modelVersion,
      createdAt: p.createdAt?.toISOString() ?? '',
    })),
    modelMetrics: modelAgg.map((m) => ({ metric: m.metric ?? '', value: Number(m.value) })),
    businessKpis: kpiAgg.map((k) => ({ name: k.name ?? '', value: Number(k.value) })),
    kpiTargets: { downtimeReduction: -0.6, costReduction: -0.3, modelPrecision: 0.85 },
  };
}
