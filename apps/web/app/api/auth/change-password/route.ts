import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { PasswordSchema } from '@/lib/auth/password-policy';
import { requireSession } from '@/lib/auth/session';
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/session';
import { logAudit } from '@/lib/audit/log';
import { ok, fail, handleError } from '@/lib/http/response';

const Body = z.object({
  current_password: z.string().min(1),
  new_password: PasswordSchema,
});

/**
 * POST /api/auth/change-password
 *
 * Cambio de contraseña del usuario autenticado. Exige la contraseña actual y
 * aplica la política de `lib/auth/password-policy.ts`.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = Body.parse(await req.json());

    const userId = Number(session.sub);
    const [user] = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
    if (!user) return fail(404, 'Usuario no encontrado');

    if (!(await verifyPassword(body.current_password, user.passwordHash))) {
      await logAudit({
        userId,
        action: 'change_password',
        module: 'auth',
        payload: { result: 'current_password_mismatch' },
      });
      return fail(401, 'La contraseña actual no es correcta');
    }

    if (await verifyPassword(body.new_password, user.passwordHash)) {
      return fail(422, 'La nueva contraseña debe ser distinta de la actual');
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.new_password), updatedAt: new Date() })
      .where(eq(users.userId, userId));

    await logAudit({ userId, action: 'change_password', module: 'auth', entityType: 'user', entityId: userId });

    // Se reemiten los tokens para que la sesión actual siga viva tras el cambio.
    const claims = {
      sub: String(user.userId),
      email: user.email,
      role: user.role as any,
      name: user.fullName,
    };
    const [access, refresh] = await Promise.all([signAccessToken(claims), signRefreshToken(claims)]);

    const res = ok(
      { changed: true },
      {
        what: 'Contraseña actualizada y verificada contra la política de seguridad.',
        how: 'La política exige al menos 10 caracteres con mayúscula, minúscula, dígito y símbolo. La sesión actual se reemite para no expulsar al usuario.',
        decision: 'Si sospechas que la cuenta estaba comprometida, comunica al administrador para rotar `JWT_SECRET` (invalida todas las sesiones activas).',
      },
    );

    res.cookies.set(ACCESS_COOKIE, access, { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 8 * 3600 });
    res.cookies.set(REFRESH_COOKIE, refresh, { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 7 * 86400 });

    return res;
  } catch (e) {
    return handleError(e);
  }
}
