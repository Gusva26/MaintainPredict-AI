import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/session';
import { logAudit } from '@/lib/audit/log';
import { ok, fail, handleError } from '@/lib/http/response';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function POST(req: NextRequest) {
  try {
    const { email, password } = Body.parse(await req.json().catch(() => ({})));
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      await logAudit({ action: 'login_failed', module: 'auth', payload: { email } });
      return fail(401, 'Credenciales inválidas');
    }

    const claims = {
      sub: String(user.userId),
      email: user.email,
      role: user.role as any,
      name: user.fullName
    };

    const [access, refresh] = await Promise.all([
      signAccessToken(claims),
      signRefreshToken(claims),
    ]);

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.userId, user.userId));
    await logAudit({ userId: user.userId, action: 'login', module: 'auth' });

    const res = ok(
      {
        user: {
          id: user.userId,
          email: user.email,
          name: user.fullName,
          role: user.role
        }
      },
      {
        what: 'Sesión iniciada correctamente.',
        how: 'El usuario queda autenticado con un JWT válido por 8h (access) y 7d (refresh) en cookies HttpOnly.',
        decision: 'Acceder al Dashboard. Si el rol es technician, redirigir a la App Técnico.',
      }
    );

    res.cookies.set(ACCESS_COOKIE, access, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 8 * 3600
    });

    res.cookies.set(REFRESH_COOKIE, refresh, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 7 * 86400
    });

    return res;
  } catch (e) {
    return handleError(e);
  }
}
