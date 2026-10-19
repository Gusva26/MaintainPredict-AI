import { db } from '@/lib/db/client';
import { auditLog } from '@/lib/db/schema';
import { headers } from 'next/headers';

export type AuditAction =
  | 'login' | 'logout' | 'login_failed' | 'change_password'
  | 'create_order' | 'approve_order' | 'reject_order' | 'start_order' | 'complete_order'
  | 'create_prediction' | 'update_equipment'
  | 'create_sensor' | 'update_sensor'
  | 'create_user' | 'update_user'
  | 'read_report' | 'ingest_sensor';

/** Módulos de la aplicación que dejan rastro en la bitácora. */
export type AuditModule =
  | 'auth' | 'equipment' | 'kb' | 'orders'
  | 'predictions' | 'reports' | 'sensors' | 'users';

export type AuditEntry = {
  userId?: number | null;
  /** Se permiten acciones fuera del catálogo (`AuditAction`) para no bloquear casos nuevos. */
  action: AuditAction | (string & {});
  /** Igual que `action`: se admiten módulos nuevos sin tocar el tipo. */
  module: AuditModule | (string & {});
  entityType?: string;
  entityId?: string | number;
  payload?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Inserta una entrada en la bitácora inmutable.
 *
 * No captura nada del contexto de la petición: si necesitas IP y user-agent,
 * usa `logAudit` (peticiones) o pásalos explícitamente.
 */
export async function insertAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    userId: entry.userId ?? null,
    action: entry.action,
    module: entry.module,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId != null ? String(entry.entityId) : null,
    payload: entry.payload ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  });
}

/**
 * Auditoría desde una petición HTTP: añade IP y user-agent automáticamente.
 * Nunca lanza — la auditoría no debe tumbar la operación principal.
 */
export async function logAudit(params: AuditEntry) {
  try {
    const h = headers();
    const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? '').trim() || null;
    const ua = h.get('user-agent') ?? null;

    await insertAudit({ ...params, ipAddress: ip, userAgent: ua });
  } catch (err) {
    // Auditoría nunca debe bloquear la petición principal
    console.error('[audit] failed to record audit log', err);
  }
}

/**
 * Variante para scripts, jobs y seeders: no depende de `next/headers`, así que
 * funciona fuera del ciclo de una petición (p. ej. con `tsx` desde la CLI).
 */
export async function logAuditSync(params: AuditEntry): Promise<void> {
  await insertAudit(params);
}
