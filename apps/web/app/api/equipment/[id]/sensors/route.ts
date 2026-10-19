import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { equipment, sensors } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { created, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';
import { SensorFields, sensorRow, thresholdsError } from '@/lib/validation/sensors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/equipment/:id/sensors
 *
 * Alta de un sensor colgado de este equipo. Es la variante "anidada" de
 * `POST /api/sensors`: el `equipment_id` viene en la ruta, no en el cuerpo.
 *
 * Nota: la ruta debe vivir en su propio fichero (`[id]/sensors/route.ts`); un
 * segmento dinámico de Next solo cubre un nivel, así que declarar `POST` en
 * `[id]/route.ts` no atendería `/api/equipment/7/sensors`.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requirePermission('equipment:write');

    const equipmentId = Number(params.id);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) return fail(400, 'ID de equipo inválido');

    const body = SensorFields.parse(await req.json());

    const [eq_] = await db.select({ id: equipment.equipmentId }).from(equipment)
      .where(eq(equipment.equipmentId, equipmentId)).limit(1);
    if (!eq_) return fail(404, 'Equipo no encontrado');

    const badThresholds = thresholdsError(body.min_threshold, body.max_threshold);
    if (badThresholds) return fail(422, badThresholds);

    const [row] = await db.insert(sensors).values({ equipmentId, ...sensorRow(body) }).returning();

    await logAudit({
      userId: Number(session.sub),
      action: 'create_sensor',
      module: 'equipment',
      entityType: 'sensor',
      entityId: row.sensorId,
      payload: { equipmentId, type: body.type },
    });

    return created(row, {
      what: 'Sensor añadido al equipo.',
      how: `Umbrales: ${row.minThreshold ?? '—'} … ${row.maxThreshold ?? '—'} ${row.unit ?? ''}.`,
      decision: 'Verificar que llegan lecturas por POST /api/sensors/data antes de confiar en la predicción.',
    });
  } catch (e) {
    return handleError(e);
  }
}
