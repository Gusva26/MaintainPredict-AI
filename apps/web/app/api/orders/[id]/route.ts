import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { maintenanceOrders, equipment, users, predictions } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { ok, fail, handleError } from '@/lib/http/response';

/**
 * GET /api/orders/:id
 *
 * Detalle de una orden: equipo, técnico, predicción de origen, repuestos y quién la aprobó.
 */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission('orders:read');

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, 'ID de orden inválido');

    const [order] = await db.select().from(maintenanceOrders).where(eq(maintenanceOrders.orderId, id)).limit(1);
    if (!order) return fail(404, 'Orden no encontrada');

    const [eq_, technician, prediction, approver] = await Promise.all([
      db.select().from(equipment).where(eq(equipment.equipmentId, order.equipmentId)).limit(1).then((r) => r[0] ?? null),
      order.technicianId
        ? db.select({ userId: users.userId, fullName: users.fullName, email: users.email, phone: users.phone })
            .from(users).where(eq(users.userId, order.technicianId)).limit(1).then((r) => r[0] ?? null)
        : Promise.resolve(null),
      order.predictionId
        ? db.select({
            predictionId: predictions.predictionId,
            component: predictions.component,
            failureProbability: predictions.failureProbability,
            explanation: predictions.explanation,
            modelVersion: predictions.modelVersion,
          }).from(predictions).where(eq(predictions.predictionId, order.predictionId)).limit(1).then((r) => r[0] ?? null)
        : Promise.resolve(null),
      order.approvedBy
        ? db.select({ userId: users.userId, fullName: users.fullName })
            .from(users).where(eq(users.userId, order.approvedBy)).limit(1).then((r) => r[0] ?? null)
        : Promise.resolve(null),
    ]);

    return ok(
      {
        order,
        equipment: eq_,
        technician,
        prediction: prediction
          ? { ...prediction, failureProbability: Number(prediction.failureProbability) }
          : null,
        approvedBy: approver,
      },
      {
        what: 'Orden de mantenimiento con todo su contexto: activo, técnico, predicción de origen y aprobación HITL.',
        how: 'status="pending_approval" exige aprobación humana; `requiresHitl` se calcula con parada estimada > 4h (regla 23.3).',
        decision: order.status === 'pending_approval'
          ? 'Supervisor/planner: aprobar o rechazar con POST /api/orders/:id/approve.'
          : 'Técnico: completar con PUT /api/orders/:id/complete al finalizar la intervención.',
      },
    );
  } catch (e) {
    return handleError(e);
  }
}
