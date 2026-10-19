import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { maintenanceOrders, equipment, users } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { PaginationQuery, offsetOf, paginated } from '@/lib/http/pagination';
import { ok, created, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

const HITL_THRESHOLD_H = 4; // regla 23.3: parada estimada > 4h requiere HITL

const Filters = z.object({
  status: z.enum(['planned', 'pending_approval', 'approved', 'in_progress', 'completed', 'cancelled']).optional(),
  equipment_id: z.coerce.number().int().positive().optional(),
  technician_id: z.coerce.number().int().positive().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requirePermission('orders:read');
    const url = new URL(req.url);
    const p = PaginationQuery.parse(Object.fromEntries(url.searchParams));
    const f = Filters.parse(Object.fromEntries(url.searchParams));

    const where = and(
      f.status ? eq(maintenanceOrders.status, f.status) : undefined,
      f.equipment_id ? eq(maintenanceOrders.equipmentId, f.equipment_id) : undefined,
      f.technician_id ? eq(maintenanceOrders.technicianId, f.technician_id) : undefined,
      f.priority ? eq(maintenanceOrders.priority, f.priority) : undefined,
    );

    const [rows, [{ count }]] = await Promise.all([
      db.select({
        order: maintenanceOrders,
        equipment: {
          equipmentId: equipment.equipmentId,
          name: equipment.name,
          criticality: equipment.criticality,
          location: equipment.location
        },
        technician: {
          userId: users.userId,
          fullName: users.fullName,
          email: users.email
        },
      })
        .from(maintenanceOrders)
        .leftJoin(equipment, eq(equipment.equipmentId, maintenanceOrders.equipmentId))
        .leftJoin(users, eq(users.userId, maintenanceOrders.technicianId))
        .where(where)
        .orderBy(desc(maintenanceOrders.createdAt))
        .limit(p.pageSize).offset(offsetOf(p)),
      db.select({ count: sql<number>`count(*)::int` }).from(maintenanceOrders).where(where),
    ]);

    // El cliente espera órdenes PLANAS (orderId, status, priority… en la raíz),
    // igual que /api/predictions y /api/equipment. `rows` viene anidado por el
    // join ({ order, equipment, technician }): lo aplanamos aquí.
    const items = rows.map((r) => ({
      ...r.order,
      equipment: r.equipment,
      technician: r.technician,
    }));

    return ok(paginated(items, count, p), {
      what: 'Órdenes de mantenimiento con equipo y técnico asignado.',
      how: 'status="pending_approval" indica que requiere HITL (parada > 4h). Solo supervisor/planner/admin pueden aprobarlas.',
      decision: 'Aprobar primero las órdenes que bloqueen equipos con criticidad alta o crítica.',
    });
  } catch (e) {
    return handleError(e);
  }
}

const CreateBody = z.object({
  equipment_id: z.coerce.number().int().positive(),
  prediction_id: z.coerce.number().int().positive().optional(),
  scheduled_date: z.string().datetime().optional(),
  technician_id: z.coerce.number().int().positive().optional(),
  parts: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).default([]),
  estimated_downtime_h: z.coerce.number().min(0).default(0),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const s = await requirePermission('orders:create');
    const body = CreateBody.parse(await req.json());

    const [eq_] = await db.select().from(equipment).where(eq(equipment.equipmentId, body.equipment_id)).limit(1);
    if (!eq_) return fail(404, 'Equipo no encontrado');

    if (body.technician_id) {
      const [t] = await db.select().from(users).where(eq(users.userId, body.technician_id)).limit(1);
      if (!t || t.role !== 'technician') {
        return fail(422, 'technician_id debe ser un usuario con rol technician');
      }
    }

    const requiresHitl = body.estimated_downtime_h > HITL_THRESHOLD_H;
    const status = requiresHitl ? 'pending_approval' : 'planned';

    const [row] = await db.insert(maintenanceOrders).values({
      equipmentId: body.equipment_id,
      predictionId: body.prediction_id,
      scheduledDate: body.scheduled_date ? new Date(body.scheduled_date) : null,
      technicianId: body.technician_id ?? null,
      parts: body.parts,
      estimatedDowntimeH: String(body.estimated_downtime_h),
      status,
      priority: body.priority,
      notes: body.notes,
      requiresHitl,
    }).returning();

    await logAudit({
      userId: Number(s.sub),
      action: 'create_order',
      module: 'orders',
      entityType: 'order',
      entityId: row.orderId,
      payload: { equipmentId: body.equipment_id, requiresHitl, status },
    });

    return created(row, {
      what: requiresHitl
        ? 'Orden creada en estado pending_approval (requiere HITL).'
        : 'Orden creada en estado planned.',
      how: `Regla 23.3: parada estimada > ${HITL_THRESHOLD_H}h exige aprobación humana.`,
      decision: requiresHitl
        ? 'Supervisor/planner debe aprobar vía /api/orders/:id/approve antes de ejecutar.'
        : 'Notificar al técnico asignado y ejecutar en la ventana programada.',
    });
  } catch (e) {
    return handleError(e);
  }
}
