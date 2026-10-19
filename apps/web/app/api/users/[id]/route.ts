import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { userPublicColumns } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { UserUpdateBody } from '@/lib/validation/users';
import { ok, fail, handleError } from '@/lib/http/response';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/** PATCH /api/users/:id — edición parcial de usuario (solo administración). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requirePermission('users:manage');

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, 'ID de usuario inválido');

    const body = UserUpdateBody.parse(await req.json());
    const isSelf = Number(session.sub) === id;

    // Evita que un administrador se bloquee a sí mismo sin querer.
    if (isSelf && body.is_active === false) {
      return fail(422, 'No puedes desactivar tu propio usuario');
    }
    if (isSelf && body.role !== undefined && body.role !== 'admin') {
      return fail(422, 'No puedes cambiarte el rol a ti mismo; pide a otro administrador que lo haga');
    }

    const values: Record<string, unknown> = {};
    if (body.full_name !== undefined) values.fullName = body.full_name;
    if (body.role !== undefined) values.role = body.role;
    if (body.phone !== undefined) values.phone = body.phone;
    if (body.is_active !== undefined) values.isActive = body.is_active;
    if (body.password !== undefined) values.passwordHash = await hashPassword(body.password);

    if (Object.keys(values).length === 0) return fail(422, 'No hay campos que actualizar');
    values.updatedAt = new Date();

    const [row] = await db.update(users).set(values).where(eq(users.userId, id)).returning(userPublicColumns);
    if (!row) return fail(404, 'Usuario no encontrado');

    await logAudit({
      userId: Number(session.sub),
      action: 'update_user',
      module: 'users',
      entityType: 'user',
      entityId: id,
      // Nunca se registra la contraseña, solo el hecho de que se cambió.
      payload: { ...body, password: body.password ? '[cambiada]' : undefined },
    });

    return ok(row, {
      what: 'Usuario actualizado.',
      how: '`is_active=false` impide el login sin borrar el histórico de órdenes y auditoría.',
      decision: body.password
        ? 'Avisar al usuario de la nueva contraseña por un canal seguro; su sesión anterior sigue válida hasta que caduque el JWT (8 h).'
        : 'Sin acciones adicionales.',
    });
  } catch (e) {
    return handleError(e);
  }
}
