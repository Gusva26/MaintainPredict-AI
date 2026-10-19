import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog, users } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/session';
import { PaginationQuery, offsetOf, paginated } from '@/lib/http/pagination';
import { ok, handleError } from '@/lib/http/response';

const Filters = z.object({
  user_id: z.coerce.number().int().positive().optional(),
  action: z.string().optional(),
  module: z.string().optional(),
  since: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requirePermission('audit:read');
    const url = new URL(req.url);
    const p = PaginationQuery.parse(Object.fromEntries(url.searchParams));
    const f = Filters.parse(Object.fromEntries(url.searchParams));

    const where = and(
      f.user_id ? eq(auditLog.userId, f.user_id) : undefined,
      f.action ? eq(auditLog.action, f.action) : undefined,
      f.module ? eq(auditLog.module, f.module) : undefined,
      f.since ? gte(auditLog.createdAt, new Date(f.since)) : undefined,
    );

    const [rows, [{ count }]] = await Promise.all([
      db.select({
        log: auditLog,
        user: {
          userId: users.userId,
          email: users.email,
          fullName: users.fullName,
          role: users.role
        },
      })
        .from(auditLog)
        .leftJoin(users, eq(users.userId, auditLog.userId))
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(p.pageSize).offset(offsetOf(p)),
      db.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(where),
    ]);

    return ok(paginated(rows, count, p), {
      what: 'Bitácora inmutable de auditoría con usuario, acción, módulo y dirección IP.',
      how: 'Registra accesos, operaciones sobre órdenes y mutaciones críticas.',
      decision: 'Investigar anomalías: múltiples intentos fallidos de autenticación, aprobaciones o cierres masivos fuera de turno.',
    });
  } catch (e) {
    return handleError(e);
  }
}
