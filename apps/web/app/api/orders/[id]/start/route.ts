import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { maintenanceOrders } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { ok, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

/**
 * PUT /api/orders/:id/start
 *
 * Marca una orden como `in_progress`: el técnico ha empezado la intervención.
 *
 * Cierra el hueco detectado al documentar (hallazgo H-K7): `in_progress` existía en el
 * `CHECK` de la tabla y en la máquina de estados, pero **ninguna ruta lo asignaba**, así
 * que el paso de «aprobada» a «en ejecución» no se podía distinguir.
 *
 * Solo se inicia desde `planned` (no necesita aprobación) o `approved` (HITL resuelto).
 * Es idempotente: repetir la llamada sobre una orden ya en curso devuelve 200 sin tocar
 * la auditoría. Un técnico solo puede iniciar sus propias órdenes.
 */
const INICIABLES = ['planned', 'approved'];

export async function PUT(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requirePermission('orders:complete');

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, 'ID de orden inválido');

    const [order] = await db.select().from(maintenanceOrders).where(eq(maintenanceOrders.orderId, id)).limit(1);
    if (!order) return fail(404, 'Orden no encontrada');

    if (order.status === 'completed' || order.status === 'cancelled') {
      return fail(409, 'La orden ya se encuentra cerrada');
    }
    if (order.status === 'pending_approval') {
      return fail(409, 'La orden todavía no está aprobada');
    }
    if (order.status === 'in_progress') {
      // Idempotente: dos pulsaciones seguidas no son un error.
      return ok(order, {
        what: 'La orden ya estaba en curso.',
        how: 'Sin cambios: el estado ya era in_progress.',
        decision: 'Completar la orden con el checklist y las fotos al terminar.',
      });
    }
    if (!INICIABLES.includes(order.status ?? '')) {
      return fail(409, `El estado '${order.status}' no permite iniciar la intervención`);
    }

    // Un técnico solo puede iniciar sus propias órdenes.
    if (s.role === 'technician' && order.technicianId && Number(s.sub) !== order.technicianId) {
      return fail(403, 'No puedes iniciar órdenes asignadas a otro técnico');
    }

    const [row] = await db.update(maintenanceOrders)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(maintenanceOrders.orderId, id))
      .returning();

    await logAudit({
      userId: Number(s.sub),
      action: 'start_order',
      module: 'orders',
      entityType: 'order',
      entityId: id,
      payload: { previous_status: order.status },
    });

    return ok(row, {
      what: 'Intervención técnica iniciada.',
      how: `Transición de estado completada: ${order.status} → in_progress.`,
      decision: 'Al terminar el trabajo, completar la orden con el checklist y las fotos.',
    });
  } catch (e) {
    return handleError(e);
  }
}
