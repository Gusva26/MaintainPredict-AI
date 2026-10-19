import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { equipment } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { PaginationQuery, offsetOf, paginated } from '@/lib/http/pagination';
import { ok, created, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

const Filters = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
  criticality: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['operational', 'maintenance', 'down', 'retired']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requirePermission('equipment:read');
    const url = new URL(req.url);
    const p = PaginationQuery.parse(Object.fromEntries(url.searchParams));
    const f = Filters.parse(Object.fromEntries(url.searchParams));

    const where = and(
      f.q ? ilike(equipment.name, `%${f.q}%`) : undefined,
      f.type ? eq(equipment.type, f.type) : undefined,
      f.criticality ? eq(equipment.criticality, f.criticality) : undefined,
      f.status ? eq(equipment.status, f.status) : undefined,
    );

    // `criticality` se ordena por severidad, no alfabéticamente: como texto,
    // `desc` daría medium → low → high → critical, dejando los equipos críticos
    // al final (hallazgo H-K5). El CASE fija el rango real de cada nivel.
    const criticalityRank = sql`CASE ${equipment.criticality}
      WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;

    const orderCol = p.sort === 'name' ? equipment.name
      : p.sort === 'criticality' ? criticalityRank
      : equipment.equipmentId;

    const orderFn = p.order === 'asc' ? asc : desc;

    const [items, [{ count }]] = await Promise.all([
      db.select().from(equipment).where(where).orderBy(orderFn(orderCol)).limit(p.pageSize).offset(offsetOf(p)),
      db.select({ count: sql<number>`count(*)::int` }).from(equipment).where(where),
    ]);

    return ok(paginated(items, count, p), {
      what: 'Listado de equipos con filtros y paginación.',
      how: 'Cada equipo incluye criticidad y coste de parada (EUR/h) que determinan la prioridad de las órdenes.',
      decision: 'Priorizar equipos con criticality="critical" y status="down".',
    });
  } catch (e) {
    return handleError(e);
  }
}

const CreateBody = z.object({
  name: z.string().min(2).max(200),
  type: z.string().min(2).max(100),
  location: z.string().max(200).optional(),
  criticality: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  installationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  downtimeCostEurH: z.coerce.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  try {
    const s = await requirePermission('equipment:write');
    const body = CreateBody.parse(await req.json());

    const [row] = await db.insert(equipment).values({
      name: body.name,
      type: body.type,
      location: body.location,
      criticality: body.criticality,
      installationDate: body.installationDate,
      downtimeCostEurH: String(body.downtimeCostEurH),
    }).returning();

    await logAudit({
      userId: Number(s.sub),
      action: 'update_equipment',
      module: 'equipment',
      entityType: 'equipment',
      entityId: row.equipmentId,
      payload: body,
    });

    return created(row, {
      what: 'Nuevo activo registrado en el catálogo de planta.',
      how: 'Equipo listo para asignación de sensores de telemetría y reglas de mantenimiento.',
      decision: 'Instalar y calibrar sensores para habilitar inferencia predictiva.',
    });
  } catch (e) {
    return handleError(e);
  }
}
