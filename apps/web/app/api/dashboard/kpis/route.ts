import { NextRequest } from 'next/server';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { businessKpis, modelMetrics, equipment, predictions, maintenanceOrders } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { KPI_TARGETS } from '@/lib/reports/targets';
import { ok, handleError } from '@/lib/http/response';

export const dynamic = 'force-dynamic';

/** Convierte filas {nombre, valor} ordenadas de más reciente a más antigua en un objeto con el último valor. */
function latestByName<T extends { name: string | null; value: unknown }>(rows: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.name && !(row.name in out)) out[row.name] = Number(row.value);
  }
  return out;
}

/**
 * GET /api/dashboard/kpis
 *
 * KPIs de negocio y métricas del modelo (último valor disponible de cada uno) más
 * los contadores operativos que necesita el Dashboard. Evita que la portada tenga
 * que descargar el reporte semanal completo solo para pintar 4 tarjetas.
 */
export async function GET(_: NextRequest) {
  try {
    await requirePermission('equipment:read');

    const since = new Date(Date.now() - 7 * 86400_000);

    const [kpiRows, metricRows, equipmentRows, alertRows, orderRows] = await Promise.all([
      db.select({ name: businessKpis.kpiName, value: businessKpis.kpiValue, at: businessKpis.periodEnd })
        .from(businessKpis)
        .orderBy(desc(businessKpis.periodEnd))
        .limit(2000),
      db.select({ name: modelMetrics.metricName, value: modelMetrics.metricValue, at: modelMetrics.windowEnd })
        .from(modelMetrics)
        .orderBy(desc(modelMetrics.windowEnd))
        .limit(2000),
      db.select({ status: equipment.status, total: sql<number>`count(*)::int` })
        .from(equipment)
        .groupBy(equipment.status),
      db.select({ total: sql<number>`count(*)::int` })
        .from(predictions)
        .where(and(gt(predictions.failureProbability, '0.7'), gt(predictions.createdAt, since))),
      db.select({ status: maintenanceOrders.status, total: sql<number>`count(*)::int` })
        .from(maintenanceOrders)
        .where(inArray(maintenanceOrders.status, ['planned', 'pending_approval', 'approved', 'in_progress']))
        .groupBy(maintenanceOrders.status),
    ]);

    const businessKpiValues = latestByName(kpiRows);
    const modelMetricValues = latestByName(metricRows);

    const equipmentByStatus = Object.fromEntries(equipmentRows.map((r) => [r.status ?? 'unknown', Number(r.total)]));
    const ordersByStatus = Object.fromEntries(orderRows.map((r) => [r.status ?? 'unknown', Number(r.total)]));
    const ordersOpen = orderRows.reduce((sum, r) => sum + Number(r.total), 0);

    return ok(
      {
        businessKpis: businessKpiValues,
        modelMetrics: modelMetricValues,
        counts: {
          equipment: equipmentRows.reduce((sum, r) => sum + Number(r.total), 0),
          equipmentDown: equipmentByStatus.down ?? 0,
          alertsLast7d: Number(alertRows[0]?.total ?? 0),
          ordersOpen,
          ordersPendingApproval: ordersByStatus.pending_approval ?? 0,
        },
        byStatus: { equipment: equipmentByStatus, orders: ordersByStatus },
        targets: KPI_TARGETS,
      },
      {
        what: 'KPIs de negocio, métricas del modelo y contadores operativos en una sola respuesta.',
        how: 'Se toma el último valor registrado de cada KPI/métrica (no se suman ventanas) y se comparan con los objetivos de `targets`.',
        decision: 'Si `modelMetrics.precision` baja de 0,85 o `ordersPendingApproval` crece, revisar falsos positivos y aprobar/descartar órdenes HITL.',
      },
    );
  } catch (e) {
    return handleError(e);
  }
}
