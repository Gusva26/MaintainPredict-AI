/**
 * Catálogo de acciones y módulos de auditoría para la interfaz.
 *
 * Vive aparte de `lib/audit/log.ts` a propósito: aquel importa la base de datos y
 * `next/headers`, así que no puede acabar en el paquete del navegador. Este módulo
 * solo tiene datos y comprobaciones de tipos (el `import type` se borra al compilar),
 * de modo que se puede usar desde un componente de cliente.
 *
 * Si añades una acción en `log.ts`, añádela aquí: la comprobación del final falla.
 */
import type { AuditAction, AuditModule } from './log';

export const AUDIT_ACTIONS = [
  'login',
  'logout',
  'login_failed',
  'change_password',
  'create_order',
  'approve_order',
  'reject_order',
  'start_order',
  'complete_order',
  'create_prediction',
  'update_equipment',
  'create_sensor',
  'update_sensor',
  'create_user',
  'update_user',
  'read_report',
  'ingest_sensor',
] as const;

export const AUDIT_MODULES = [
  'auth',
  'equipment',
  'kb',
  'orders',
  'predictions',
  'reports',
  'sensors',
  'users',
] as const;

/**
 * Garantía en tiempo de compilación: el catálogo de la UI cubre todas las acciones y
 * módulos que el backend puede registrar. Si `log.ts` gana una acción o un módulo y no
 * se añade aquí, el tipo deja de ser `never` y estas líneas no compilan.
 */
type AccionSinCubrir = Exclude<AuditAction, (typeof AUDIT_ACTIONS)[number]>;
type ModuloSinCubrir = Exclude<AuditModule, (typeof AUDIT_MODULES)[number]>;
export const CATALOGO_DE_ACCIONES_COMPLETO: AccionSinCubrir extends never ? true : never = true;
export const CATALOGO_DE_MODULOS_COMPLETO: ModuloSinCubrir extends never ? true : never = true;
