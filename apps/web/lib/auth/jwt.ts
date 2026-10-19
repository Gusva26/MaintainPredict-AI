import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '@/lib/env';

export type Role = 'technician' | 'supervisor' | 'planner' | 'admin';

export type AppJwtPayload = JWTPayload & {
  sub: string;          // user_id
  email: string;
  role: Role;
  name: string;
  typ: 'access' | 'refresh';
};

const enc = (s: string) => new TextEncoder().encode(s);
const accessKey = enc(env.JWT_SECRET);
const refreshKey = enc(env.JWT_REFRESH_SECRET);

function parseTtl(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 3600;
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return n * mult;
}

export async function signAccessToken(p: Omit<AppJwtPayload, 'typ'>) {
  return new SignJWT({ ...p, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('maintainpredict')
    .setAudience('mp-web')
    .setExpirationTime(`${parseTtl(env.JWT_EXPIRES_IN)}s`)
    .sign(accessKey);
}

export async function signRefreshToken(p: Omit<AppJwtPayload, 'typ'>) {
  return new SignJWT({ ...p, typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('maintainpredict')
    .setAudience('mp-web')
    .setExpirationTime(`${parseTtl(env.JWT_REFRESH_EXPIRES_IN)}s`)
    .sign(refreshKey);
}

export async function verifyAccessToken(token: string): Promise<AppJwtPayload> {
  const { payload } = await jwtVerify(token, accessKey, { issuer: 'maintainpredict', audience: 'mp-web' });
  if (payload.typ !== 'access') throw new Error('Invalid token type');
  return payload as AppJwtPayload;
}

export async function verifyRefreshToken(token: string): Promise<AppJwtPayload> {
  const { payload } = await jwtVerify(token, refreshKey, { issuer: 'maintainpredict', audience: 'mp-web' });
  if (payload.typ !== 'refresh') throw new Error('Invalid token type');
  return payload as AppJwtPayload;
}
