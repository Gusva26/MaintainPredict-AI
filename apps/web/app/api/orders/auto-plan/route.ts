import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { predictions, equipment, maintenanceOrders } from '@/lib/db/schema';
import { requirePermissionOrInternal } from '@/lib/http/internal-auth';
import { runPlannerAgent, sealPlannerOutput } from '@/lib/agents/planner';
import { logAudit } from '@/lib/audit/log';
import { created, fail, handleError } from '@/lib/http/response';

const Body = z.object({
  prediction_id: z.coerce.number().int().positive()
});

export async function POST(req: NextRequest) {
  try {
    const s = await requirePermissionOrInternal(req, 'orders:create');
    const { prediction_id } = Body.parse(await req.json());

    const [pred] = await db.select().from(predictions).where(eq(predictions.predictionId, prediction_id)).limit(1);
    if (!pred) return fail(404, 'Predicción no encontrada');

    const [eq_] = await db.select().from(equipment).where(eq(equipment.equipmentId, pred.equipmentId)).limit(1);
    if (!eq_) return fail(404, 'Equipo no encontrado');

    const plan = await runPlannerAgent({
      predictionId: pred.predictionId,
      equipmentId: pred.equipmentId,
      component: pred.component ?? 'unknown',
      failureProbability: Number(pred.failureProbability),
      window: `${pred.windowDays ?? 7}d`,
      criticality: eq_.criticality || 'medium',
      downtimeCostEurH: Number(eq_.downtimeCostEurH ?? 0),
    });

    const [order] = await db.insert(maintenanceOrders).values({
      equipmentId: pred.equipmentId,
      predictionId: pred.predictionId,
      scheduledDate: new Date(plan.scheduled_date),
      technicianId: plan.technician_id,
      parts: plan.parts,
      estimatedDowntimeH: String(plan.estimated_downtime_h),
      // El estado NO se recalcula aquí: el PlannerAgent ya aplicó la regla HITL
      // dentro de `schedule_order` (ver lib/agents/planner.ts). Así el agente, la
      // respuesta HTTP y la BD no pueden discrepar.
      status: plan.status,
      priority: plan.priority,
      notes: plan.reasoning,
      requiresHitl: plan.requires_hitl,
    }).returning();

    await logAudit({
      userId: Number(s.sub),
      action: 'create_order',
      module: 'orders',
      entityType: 'order',
      entityId: order.orderId,
      payload: { auto_planned: true, requiresHitl: plan.requires_hitl, predictionId: pred.predictionId },
    });

    // Se sella la salida del agente con el id real de la orden: la respuesta tiene
    // la forma de la spec §5 (`order_id` + `technician`) sin que el agente tenga
    // que adivinar un id que aún no existe.
    const result = sealPlannerOutput(plan, order.orderId);

    return created(result, {
      what: 'Orden de mantenimiento generada por PlannerAgent (auto-plan).',
      how: plan.reasoning,
      decision: plan.requires_hitl
        ? `Requiere aprobación humana (HITL) por parada de ${plan.estimated_downtime_h} h (> 4 h).`
        : 'Notificar al técnico y ejecutar en la ventana programada.',
    });
  } catch (e) {
    return handleError(e);
  }
}
