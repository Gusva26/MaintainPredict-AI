import { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { predictions, equipment, maintenanceOrders, users } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { ok, fail, handleError } from '@/lib/http/response';

/**
 * GET /api/predictions/:id
 *
 * Detalle de una predicción: equipo, contribución de cada señal (`features`),
 * explicación del agente y órdenes de mantenimiento derivadas.
 */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission('predictions:read');

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, 'ID de predicción inválido');

    const [row] = await db.select().from(predictions).where(eq(predictions.predictionId, id)).limit(1);
    if (!row) return fail(404, 'Predicción no encontrada');

    const [eq_] = await db.select().from(equipment).where(eq(equipment.equipmentId, row.equipmentId)).limit(1);

    const orders = await db.select({
      order: maintenanceOrders,
      technician: { userId: users.userId, fullName: users.fullName },
    })
      .from(maintenanceOrders)
      .leftJoin(users, eq(users.userId, maintenanceOrders.technicianId))
      .where(eq(maintenanceOrders.predictionId, id))
      .orderBy(desc(maintenanceOrders.createdAt));

    const probability = Number(row.failureProbability);

    /**
     * `hasOrder` bloquea el botón «Generar orden (auto-plan)» del detalle. Una orden
     * `cancelled` (rechazo HITL) **no** debe bloquear una replanificación: si cuenta
     * como «ya existe», la predicción queda muerta para siempre (hallazgo H-K4).
     * La lista completa sí se devuelve, para que el rechazo siga siendo visible.
     */
    const activeOrders = orders.filter((o) => o.order.status !== 'cancelled');

    return ok(
      {
        prediction: { ...row, failureProbability: probability, alert: probability > 0.7 },
        equipment: eq_ ?? null,
        orders: orders.map((o) => ({ ...o.order, technician: o.technician })),
        hasOrder: activeOrders.length > 0,
      },
      {
        what: 'Predicción de falla con su equipo, las señales que la explican y las órdenes generadas.',
        how: '`features` pesa cada señal (vibración, temperatura…). `failureProbability > 0.70` activa alerta (regla 23.1) y `hasOrder` indica si ya se planificó una intervención **no cancelada**.',
        decision: 'Si alert=true y hasOrder=false, lanzar POST /api/orders/auto-plan con este prediction_id.',
      },
    );
  } catch (e) {
    return handleError(e);
  }
}
