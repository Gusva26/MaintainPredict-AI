import { NextRequest } from 'next/server';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sensors, equipment } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { PaginationQuery, offsetOf, paginated } from '@/lib/http/pagination';
import { ok, created, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';
import { SensorCreateBody, SensorFilters, sensorRow, thresholdsError } from '@/lib/validation/sensors';

const Filters = SensorFilters;

/** GET /api/sensors — listado paginado de sensores con su equipo. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission('equipment:read');
    const url = new URL(req.url);
    const p = PaginationQuery.parse(Object.fromEntries(url.searchParams));
    const f = Filters.parse(Object.fromEntries(url.searchParams));

    const where = and(
      f.equipment_id ? eq(sensors.equipmentId, f.equipment_id) : undefined,
      f.type ? eq(sensors.type, f.type) : undefined,
      f.status ? eq(sensors.status, f.status) : undefined,
      f.q ? ilike(sensors.type, `%${f.q}%`) : undefined,
    );

    const [rows, [{ count }]] = await Promise.all([
      db.select({
        sensor: sensors,
        equipment: { equipmentId: equipment.equipmentId, name: equipment.name, criticality: equipment.criticality },
      })
        .from(sensors)
        .leftJoin(equipment, eq(equipment.equipmentId, sensors.equipmentId))
        .where(where)
        .orderBy(p.order === 'asc' ? asc(sensors.sensorId) : desc(sensors.sensorId))
        .limit(p.pageSize).offset(offsetOf(p)),
      db.select({ count: sql<number>`count(*)::int` }).from(sensors).where(where),
    ]);

    const items = rows.map((r) => ({ ...r.sensor, equipment: r.equipment }));

    return ok(paginated(items, count, p), {
      what: 'Sensores de telemetría con el equipo al que pertenecen y sus umbrales.',
      how: 'Cada sensor declara min/max_threshold; las lecturas fuera de rango se marcan con quality distinto de "good".',
      decision: 'Revisar sensores en status="inactive" o "maintenance": sus lecturas no alimentan al predictor.',
    });
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/sensors — alta de un sensor asociado a un equipo. */
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('equipment:write');
    const body = SensorCreateBody.parse(await req.json());

    const [eq_] = await db.select().from(equipment).where(eq(equipment.equipmentId, body.equipment_id)).limit(1);
    if (!eq_) return fail(404, 'Equipo no encontrado');

    const badThresholds = thresholdsError(body.min_threshold, body.max_threshold);
    if (badThresholds) return fail(422, badThresholds);

    const [row] = await db.insert(sensors).values({
      equipmentId: body.equipment_id,
      ...sensorRow(body),
    }).returning();

    await logAudit({
      userId: Number(session.sub),
      action: 'create_sensor',
      module: 'sensors',
      entityType: 'sensor',
      entityId: row.sensorId,
      payload: { equipmentId: body.equipment_id, type: body.type },
    });

    return created(row, {
      what: 'Sensor registrado y vinculado al equipo.',
      how: `Umbrales: ${row.minThreshold ?? '—'} … ${row.maxThreshold ?? '—'} ${row.unit ?? ''}.`,
      decision: 'Configurar el envío de lecturas a POST /api/sensors/data con el sensor_id devuelto.',
    });
  } catch (e) {
    return handleError(e);
  }
}
