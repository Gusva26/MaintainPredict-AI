import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { maintenanceOrders } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { ok, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

const Body = z.object({
  notes: z.string().max(2000).optional(),
  photos: z.array(z.string().url()).max(20).optional(),
  false_positive: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requirePermission('orders:complete');
    const id = Number(params.id);
    const body = Body.parse(await req.json().catch(() => ({})));

    const [order] = await db.select().from(maintenanceOrders).where(eq(maintenanceOrders.orderId, id)).limit(1);
    if (!order) return fail(404, 'Orden no encontrada');
    if (['completed', 'cancelled'].includes(order.status!)) {
      return fail(409, 'La orden ya se encuentra cerrada');
    }

    // Técnico solo puede cerrar sus propias órdenes
    if (s.role === 'technician' && order.technicianId && Number(s.sub) !== order.technicianId) {
      return fail(403, 'No puedes cerrar órdenes asignadas a otro técnico');
    }

    const mergedNotes = [order.notes, body.notes, body.photos ? `fotos: ${body.photos.join(',')}` : null]
      .filter(Boolean)
      .join('\n— ');

    const [row] = await db.update(maintenanceOrders).set({
      status: 'completed',
      completedAt: new Date(),
      notes: mergedNotes || null,
    }).where(eq(maintenanceOrders.orderId, id)).returning();

    await logAudit({
      userId: Number(s.sub),
      action: 'complete_order',
      module: 'orders',
      entityType: 'order',
      entityId: id,
      payload: { photosCount: body.photos?.length ?? 0 },
    });

    if (body.false_positive) {
      const { markOrderAsFalsePositive } = await import('@/lib/observability/false-positives');
      await markOrderAsFalsePositive(id, Number(s.sub));
    }

    return ok(row, {
      what: 'Intervención técnica completada y registrada.',
      how: 'El activo vuelve a estado operacional y la telemetría se usará para reentrenamiento del modelo.',
      decision: 'Si la probabilidad de falla previa era alta y el componente no presentó daño, registrar como posible falso positivo.',
    });
  } catch (e) {
    return handleError(e);
  }
}
