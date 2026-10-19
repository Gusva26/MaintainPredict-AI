import { NextRequest } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sensors, readings } from '@/lib/db/schema';
import { requirePermissionOrInternal } from '@/lib/http/internal-auth';
import { ok, fail, handleError } from '@/lib/http/response';

/**
 * GET /api/sensors/:id
 *
 * Detalle de un sensor con su equipo asociado (equipmentId) y sus últimas lecturas.
 * Lo consume WF-01 ("Resolver equipment_id") para traducir sensor_id -> equipment_id
 * cuando el payload del webhook solo trae `{ sensor_id, value }`.
 * Admite sesión de usuario (permiso equipment:read) o llamada interna de n8n (x-internal-token).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermissionOrInternal(req, 'equipment:read');

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, 'ID de sensor inválido');

    const [sensor] = await db.select().from(sensors).where(eq(sensors.sensorId, id)).limit(1);
    if (!sensor) return fail(404, 'Sensor no encontrado');

    const lastReadings = await db.select().from(readings)
      .where(eq(readings.sensorId, id))
      .orderBy(desc(readings.recordedAt))
      .limit(50);

    return ok(
      { sensor, lastReadings },
      {
        what: 'Sensor con su equipo asociado y las últimas 50 lecturas.',
        how: 'sensor.equipmentId resuelve el equipamiento a partir del sensor_id (lo usa WF-01).',
        decision: 'Si predominan lecturas con quality="suspect", revisar la calibración antes de confiar en la predicción.',
      }
    );
  } catch (e) {
    return handleError(e);
  }
}
