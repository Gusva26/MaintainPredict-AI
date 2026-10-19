import { cookies } from 'next/headers';
import { verifyAccessToken, type AppJwtPayload } from './jwt';
import { assertCan, type Permission } from './rbac';

export const ACCESS_COOKIE = 'mp_access';
export const REFRESH_COOKIE = 'mp_refresh';

export async function getSession(): Promise<AppJwtPayload | null> {
  const c = cookies().get(ACCESS_COOKIE)?.value;
  if (!c) return null;
  try {
    return await verifyAccessToken(c);
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<AppJwtPayload> {
  const s = await getSession();
  if (!s) {
    const err = new Error('Unauthorized');
    (err as any).status = 401;
    throw err;
  }
  return s;
}

export async function requirePermission(permission: Permission): Promise<AppJwtPayload> {
  const s = await requireSession();
  assertCan(s.role, permission);
  return s;
}

export { requirePermissionOrInternal } from '@/lib/http/internal-auth';
