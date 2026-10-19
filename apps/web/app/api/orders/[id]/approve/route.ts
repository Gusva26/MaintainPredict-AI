import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { maintenanceOrders } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { ok, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

/**
 * POST /api/orders/:id/approve?decision=approve|reject
 *
 * Resuelve el HITL de una orden en espera de aprobación humana (parada estimada > 4 h).
 *
 * El email que envía WF-02 trae **dos** enlaces (aprobar y rechazar) que apuntan aquí
 * indirectamente: llevan a la ficha `/orders/:id?resume=…&decision=…`, y es la UI quien
 * llama a este endpoint tras confirmar con su sesión. Nunca se actúa desde el enlace del
 * email: quien decide tiene que estar autenticado y tener `orders:approve`.
 *
 * `decision` se acepta por *query string* y por cuerpo JSON (gana el cuerpo si viene);
 * sin ninguno de los dos se asume `approve`, que es el comportamiento histórico.
 *
 * El rechazo deja la orden en `cancelled` —estado que ya existía en el dominio— y **no**
 * rellena `approved_by`/`approved_at`: quien rechaza no es quien aprueba. Su identidad
 * queda en la auditoría (`reject_order`) y en las notas de la propia orden.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requirePermission('orders:approve');

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, 'ID de orden inválido');

    const body = await req.json().catch(() => ({})) as { decision?: unknown };
    const raw = body?.decision ?? req.nextUrl.searchParams.get('decision') ?? 'approve';
    if (raw !== 'approve' && raw !== 'reject') {
      return fail(422, "decision debe ser 'approve' o 'reject'");
    }
    const decision = raw as 'approve' | 'reject';
    const approved = decision === 'approve';

    const [order] = await db.select().from(maintenanceOrders).where(eq(maintenanceOrders.orderId, id)).limit(1);
    if (!order) return fail(404, 'Orden no encontrada');
    if (order.status !== 'pending_approval') {
      return fail(409, `Estado actual '${order.status}' no permite ${approved ? 'aprobación' : 'rechazo'}`);
    }

    const decididoPor = `${s.name} (#${s.sub})`;
    const values: Record<string, unknown> = approved
      ? { status: 'approved', approvedBy: Number(s.sub), approvedAt: new Date() }
      : {
          status: 'cancelled',
          // Traza legible en la propia orden; quien no aprueba no firma como aprobador.
          notes: [order.notes, `Rechazada por ${decididoPor} el ${new Date().toISOString()}`]
            .filter(Boolean)
            .join('\n'),
        };

    const [row] = await db.update(maintenanceOrders).set(values)
      .where(eq(maintenanceOrders.orderId, id)).returning();

    await logAudit({
      userId: Number(s.sub),
      action: approved ? 'approve_order' : 'reject_order',
      module: 'orders',
      entityType: 'order',
      entityId: id,
      payload: { decision, previous_status: 'pending_approval' },
    });

    // Reanudar la espera (Wait) de WF-02. Sin esto, el workflow se quedaría hasta el
    // timeout de 30 min y avisaría de un "HITL expirado" que nunca ocurrió.
    const resumeUrl = req.nextUrl.searchParams.get('resume');
    const allowed = process.env.N8N_WEBHOOK_BASE_URL ?? 'http://n8n:5678';
    if (resumeUrl && (resumeUrl.startsWith(allowed) || resumeUrl.startsWith('http://localhost:5678'))) {
      try {
        await fetch(resumeUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ approved, decision, order_id: id, decided_by: Number(s.sub) }),
        });
      } catch (err) {
        console.error('[approve] n8n resume failed', err);
      }
    }

    return ok(row, approved
      ? {
          what: 'Orden de mantenimiento aprobada por supervisor (HITL resuelto).',
          how: 'Transición de estado completada: pending_approval → approved.',
          decision: 'Notificar al técnico asignado y autorizar la parada en el calendario de producción.',
        }
      : {
          what: 'Orden de mantenimiento rechazada: no se autoriza la parada (HITL resuelto en negativo).',
          how: 'Transición de estado completada: pending_approval → cancelled. La orden no se borra: conserva el histórico, la predicción de origen y el motivo en las notas.',
          decision: 'Revisar la predicción de origen antes de volver a planificar: si el rechazo fue por falta de repuestos o de ventana, el siguiente auto-plan necesita ese dato corregido.',
        });
  } catch (e) {
    return handleError(e);
  }
}
