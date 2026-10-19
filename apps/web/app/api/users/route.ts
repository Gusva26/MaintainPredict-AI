import { NextRequest } from 'next/server';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { userPublicColumns } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { UserCreateBody, UserFilters } from '@/lib/validation/users';
import { PaginationQuery, offsetOf, paginated } from '@/lib/http/pagination';
import { ok, created, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

/** GET /api/users — listado de usuarios (solo administración). */
export async function GET(req: NextRequest) {
  try {
    await requirePermission('users:manage');
    const url = new URL(req.url);
    const p = PaginationQuery.parse(Object.fromEntries(url.searchParams));
    const f = UserFilters.parse(Object.fromEntries(url.searchParams));

    const where = and(
      f.role ? eq(users.role, f.role) : undefined,
      f.is_active !== undefined ? eq(users.isActive, f.is_active) : undefined,
      f.q
        ? sql`(${ilike(users.fullName, `%${f.q}%`)} OR ${ilike(users.email, `%${f.q}%`)})`
        : undefined,
    );

    const [items, [{ count }]] = await Promise.all([
      db.select(userPublicColumns).from(users).where(where)
        .orderBy(p.order === 'asc' ? asc(users.userId) : desc(users.userId))
        .limit(p.pageSize).offset(offsetOf(p)),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
    ]);

    return ok(paginated(items, count, p), {
      what: 'Usuarios del sistema con su rol y estado (sin datos de contraseña).',
      how: 'El rol determina la matriz de permisos (RBAC): technician, supervisor, planner y admin.',
      decision: 'Desactivar en lugar de borrar: las órdenes históricas y la auditoría mantienen la referencia al técnico.',
    });
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/users — alta de usuario con política de contraseña. */
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('users:manage');
    const body = UserCreateBody.parse(await req.json());

    const email = body.email.toLowerCase().trim();
    const [existing] = await db.select({ userId: users.userId }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return fail(409, 'Ya existe un usuario con ese email');

    const [row] = await db.insert(users).values({
      email,
      fullName: body.full_name,
      role: body.role,
      phone: body.phone,
      passwordHash: await hashPassword(body.password),
    }).returning(userPublicColumns);

    await logAudit({
      userId: Number(session.sub),
      action: 'create_user',
      module: 'users',
      entityType: 'user',
      entityId: row.userId,
      payload: { email, role: body.role },
    });

    return created(row, {
      what: 'Usuario creado con contraseña conforme a la política de seguridad.',
      how: 'La contraseña se almacena como hash bcrypt; nunca se devuelve ni se registra en claro.',
      decision: 'Comunicar las credenciales por un canal seguro y pedir el cambio en el primer acceso.',
    });
  } catch (e) {
    return handleError(e);
  }
}
