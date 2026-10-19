import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sensors, readings } from '@/lib/db/schema';
import { assertSensorAuth } from '@/lib/http/sensor-auth';
import { logAudit } from '@/lib/audit/log';
import { created, handleError, fail } from '@/lib/http/response';

const Body = z.object({
  sensor_id: z.coerce.number().int().positive(),
  value: z.coerce.number().finite(),
  recorded_at: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  try {
    assertSensorAuth(req);
    const body = Body.parse(await req.json());

    const [sensor] = await db.select().from(sensors).where(eq(sensors.sensorId, body.sensor_id)).limit(1);
    if (!sensor) return fail(404, 'Sensor no encontrado');
    if (sensor.status === 'faulty') return fail(409, 'Sensor marcado como faulty');

    // Detección de datos sucios: fuera de rango operativo → quality='suspect'
    const min = sensor.minThreshold != null ? Number(sensor.minThreshold) : -Infinity;
    const max = sensor.maxThreshold != null ? Number(sensor.maxThreshold) : Infinity;
    const quality = body.value < min || body.value > max ? 'suspect' : 'good';

    const [row] = await db.insert(readings).values({
      sensorId: sensor.sensorId,
      value: String(body.value),
      quality,
      recordedAt: body.recorded_at ? new Date(body.recorded_at) : new Date(),
    }).returning();

    await logAudit({
      action: 'ingest_sensor',
      module: 'sensors',
      entityType: 'reading',
      entityId: row.readingId,
      payload: { sensorId: sensor.sensorId, value: body.value, quality },
    });

    return created(row, {
      what: 'Lectura de sensor almacenada.',
      how: quality === 'good'
        ? 'El valor está dentro del rango operativo del sensor.'
        : 'El valor está fuera de rango: se marca quality="suspect" y se excluirá del entrenamiento.',
      decision: quality === 'good'
        ? 'Disponible para el pipeline de predicción (WF-01).'
        : 'Revisar calibración del sensor y validar manualmente antes de usarlo.',
    });
  } catch (e) {
    return handleError(e);
  }
}
