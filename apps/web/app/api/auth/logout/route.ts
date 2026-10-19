import { NextResponse } from 'next/server';
import { getSession, ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/session';
import { logAudit } from '@/lib/audit/log';

export async function POST() {
  const s = await getSession();
  if (s) {
    await logAudit({ userId: Number(s.sub), action: 'logout', module: 'auth' });
  }

  const res = NextResponse.json({
    data: { ok: true },
    explanation: {
      what: 'Cierre de sesión completado.',
      how: 'Se han invalidado las cookies HttpOnly de acceso y refresco.',
      decision: 'Redirigir a la pantalla de /login.'
    }
  });

  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);

  return res;
}
