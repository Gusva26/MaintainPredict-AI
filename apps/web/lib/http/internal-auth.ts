import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { assertCan, type Permission } from '@/lib/auth/rbac';
import type { AppJwtPayload } from '@/lib/auth/jwt';

export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? 'change_me_internal_token_32_chars_long';

export const SYSTEM_USER: AppJwtPayload = {
  sub: '1',
  email: 'system@maintainpredict.ai',
  role: 'admin',
  name: 'System',
  typ: 'access',
};

/**
 * Permite acceso si:
 *  - Header x-internal-token coincide con INTERNAL_TOKEN (llamadas automatizadas desde n8n), o
 *  - Hay sesión de usuario activa con permisos.
 */
export function isInternalCall(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  return !!token && token === INTERNAL_TOKEN;
}

export async function requirePermissionOrInternal(
  req: NextRequest,
  permission: Permission,
): Promise<AppJwtPayload> {
  if (isInternalCall(req)) {
    return SYSTEM_USER;
  }
  const s = await getSession();
  if (!s) {
    const err = new Error('Unauthorized');
    (err as any).status = 401;
    throw err;
  }
  assertCan(s.role, permission);
  return s;
}
