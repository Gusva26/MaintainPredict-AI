import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { predictions, equipment } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { PaginationQuery, offsetOf, paginated } from '@/lib/http/pagination';
import { ok, handleError } from '@/lib/http/response';

const Filters = z.object({
  equipment_id: z.coerce.number().int().positive().optional(),
  min_prob: z.coerce.number().min(0).max(1).optional(),
  since: z.string().datetime().optional(),
  component: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requirePermission('predictions:read');
    const url = new URL(req.url);
    const p = PaginationQuery.parse(Object.fromEntries(url.searchParams));
    const f = Filters.parse(Object.fromEntries(url.searchParams));

    const where = and(
      f.equipment_id ? eq(predictions.equipmentId, f.equipment_id) : undefined,
      f.min_prob != null ? gte(predictions.failureProbability, String(f.min_prob)) : undefined,
      f.since ? gte(predictions.createdAt, new Date(f.since)) : undefined,
      f.component ? eq(predictions.component, f.component) : undefined,
    );

    const [rows, [{ count }]] = await Promise.all([
      db.select({
        prediction: predictions,
        equipment: {
          equipmentId: equipment.equipmentId,
          name: equipment.name,
          criticality: equipment.criticality,
          location: equipment.location,
        },
      })
        .from(predictions)
        .leftJoin(equipment, eq(equipment.equipmentId, predictions.equipmentId))
        .where(where)
        .orderBy(desc(predictions.failureProbability), desc(predictions.createdAt))
        .limit(p.pageSize).offset(offsetOf(p)),
      db.select({ count: sql<number>`count(*)::int` }).from(predictions).where(where),
    ]);

    const items = rows.map((r) => ({
      ...r.prediction,
      failureProbability: Number(r.prediction.failureProbability),
      equipment: r.equipment,
      alert: Number(r.prediction.failureProbability) > 0.7,   // regla 23.1
    }));

    return ok(paginated(items, count, p), {
      what: 'Predicciones de falla ordenadas por probabilidad descendente.',
      how: 'failure_probability > 0.70 activa alerta (regla 23.1) y dispara la creación automática de orden (regla 23.2).',
      decision: 'Revisar primero los equipos con criticality="critical" y probabilidad alta.',
    });
  } catch (e) {
    return handleError(e);
  }
}
