import type { Role } from './jwt';

export type Permission =
  | 'equipment:read'
  | 'equipment:write'
  | 'predictions:read'
  | 'predict:run'
  | 'orders:read'
  | 'orders:create'
  | 'orders:complete'
  | 'orders:approve'
  | 'sensors:ingest'
  | 'reports:read'
  | 'users:manage'
  | 'audit:read'
  | 'integrations:read';

const MATRIX: Record<Role, Permission[]> = {
  technician: ['equipment:read', 'predictions:read', 'orders:read', 'orders:complete'],
  supervisor: [
    'equipment:read', 'equipment:write',
    'predictions:read', 'predict:run',
    'orders:read', 'orders:create', 'orders:approve',
    'reports:read', 'integrations:read',
  ],
  planner: [
    'equipment:read',
    'predictions:read',
    'orders:read', 'orders:create', 'orders:approve',
    'reports:read',
  ],
  admin: [
    'equipment:read', 'equipment:write',
    'predictions:read', 'predict:run',
    'orders:read', 'orders:create', 'orders:complete', 'orders:approve',
    'sensors:ingest', 'reports:read', 'users:manage', 'audit:read',
    'integrations:read',
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function assertCan(role: Role, permission: Permission) {
  if (!can(role, permission)) {
    const err = new Error(`Forbidden: role=${role} missing ${permission}`);
    (err as any).status = 403;
    throw err;
  }
}
