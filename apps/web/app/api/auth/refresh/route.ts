import { NextRequest } from 'next/server';
import { verifyRefreshToken, signAccessToken } from '@/lib/auth/jwt';
import { REFRESH_COOKIE, ACCESS_COOKIE } from '@/lib/auth/session';
import { ok, fail, handleError } from '@/lib/http/response';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!token) return fail(401, 'No refresh token provided');

    const p = await verifyRefreshToken(token);
    const access = await signAccessToken({
      sub: p.sub,
      email: p.email,
      role: p.role,
      name: p.name
    });

    const res = ok(
      { ok: true },
      {
        what: 'Renovación de token de acceso exitosa.',
        how: 'Se ha verificado la validez del refresh token y emitido un nuevo access token de 8 horas.',
        decision: 'Continuar navegando sin interrumpir la sesión del operador.',
      }
    );

    res.cookies.set(ACCESS_COOKIE, access, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 3600
    });

    return res;
  } catch (e) {
    return handleError(e);
  }
}
