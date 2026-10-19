import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { equipment, sensors, readings, predictions } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { ok, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission('equipment:read');
    const id = Number(params.id);

    const [eq_] = await db.select().from(equipment).where(eq(equipment.equipmentId, id)).limit(1);
    if (!eq_) return fail(404, 'Equipo no encontrado');

    const s = await db.select().from(sensors).where(eq(sensors.equipmentId, id));
    const sensorIds = s.map((x) => x.sensorId);

    const lastReadings = sensorIds.length
      ? await db.select().from(readings)
          .where(inArray(readings.sensorId, sensorIds))
          .orderBy(desc(readings.recordedAt)).limit(200)
      : [];

    const lastPreds = await db.select().from(predictions)
      .where(eq(predictions.equipmentId, id))
      .orderBy(desc(predictions.createdAt)).limit(5);

    return ok(
      {
        equipment: eq_,
        sensors: s,
        lastReadings,
        lastPredictions: lastPreds
      },
      {
        what: 'Detalle del equipo con sensores, últimas 200 lecturas y 5 predicciones recientes.',
        how: 'Comparar las lecturas con min/max_threshold por sensor para detectar anomalías.',
        decision: 'Si la última predicción tiene failure_probability > 0.7, revisar la orden asociada.',
      }
    );
  } catch (e) {
    return handleError(e);
  }
}

const UpdateBody = z.object({
  name: z.string().min(2).max(200).optional(),
  type: z.string().min(2).max(100).optional(),
  location: z.string().max(200).nullable().optional(),
  criticality: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  installation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['operational', 'maintenance', 'down', 'retired']).optional(),
  downtime_cost_eur_h: z.coerce.number().min(0).optional(),
});

/** PUT /api/equipment/:id — actualización parcial del activo. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requirePermission('equipment:write');

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, 'ID de equipo inválido');

    const body = UpdateBody.parse(await req.json());

    const values: Record<string, unknown> = {};
    if (body.name !== undefined) values.name = body.name;
    if (body.type !== undefined) values.type = body.type;
    if (body.location !== undefined) values.location = body.location;
    if (body.criticality !== undefined) values.criticality = body.criticality;
    if (body.installation_date !== undefined) values.installationDate = body.installation_date;
    if (body.status !== undefined) values.status = body.status;
    if (body.downtime_cost_eur_h !== undefined) values.downtimeCostEurH = String(body.downtime_cost_eur_h);

    if (Object.keys(values).length === 0) return fail(422, 'No hay campos que actualizar');
    values.updatedAt = new Date();

    const [row] = await db.update(equipment).set(values).where(eq(equipment.equipmentId, id)).returning();
    if (!row) return fail(404, 'Equipo no encontrado');

    await logAudit({
      userId: Number(session.sub),
      action: 'update_equipment',
      module: 'equipment',
      entityType: 'equipment',
      entityId: id,
      payload: body as Record<string, unknown>,
    });

    return ok(row, {
      what: 'Activo actualizado.',
      how: 'La criticidad y el coste de parada (EUR/h) alimentan el cálculo de prioridad de las órdenes (regla 23.x).',
      decision: row.criticality === 'critical'
        ? 'Asegurar que el equipo tiene sensores activos para anticipar fallos.'
        : 'Sin acciones inmediatas.',
    });
  } catch (e) {
    return handleError(e);
  }
}
