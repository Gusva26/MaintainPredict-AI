'use client';
import { useSession } from './useSession';
import { can as canRole, type Permission } from '@/lib/auth/rbac';

/**
 * Permisos del usuario actual en el navegador.
 *
 * Delega en `lib/auth/rbac.ts`, la **misma** matriz que usan la API y el middleware.
 * Antes había aquí una copia que se había quedado desincronizada (le faltaban
 * `integrations:read` y `sensors:ingest`), con el riesgo de que la UI ocultara o
 * mostrara acciones que el servidor luego aceptaba o rechazaba. `rbac.ts` se puede
 * importar desde el cliente porque su único import es de tipos y se borra al compilar.
 */
export function useRbac() {
  const { session } = useSession();
  const can = (p: Permission) => (session ? canRole(session.role, p) : false);
  return { session, can };
}
