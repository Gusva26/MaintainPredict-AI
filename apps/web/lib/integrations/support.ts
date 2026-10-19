// Utilidades compartidas por los adaptadores de integración.

import type { HealthStatus, IntegrationKind, IntegrationMode } from './types';

// `fetchWithTimeout` vive en lib/http porque es genérico (lo usan también los
// agentes). Se reexporta aquí para no cambiar los imports de los adaptadores.
export { fetchWithTimeout } from '@/lib/http/fetch';

/** Ejecuta la sonda del adaptador y la convierte en un `HealthStatus` (nunca lanza). */
export async function probe(
  kind: IntegrationKind,
  adapter: string,
  mode: IntegrationMode,
  fn: () => Promise<void>,
): Promise<HealthStatus> {
  const started = Date.now();
  const base = { kind, adapter, mode, checkedAt: new Date().toISOString() };
  try {
    await fn();
    return { ...base, ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ...base,
      ok: false,
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Heurística: una URL/host con "mock", "mailhog", "sandbox" o localhost es un entorno simulado. */
export function modeOf(baseUrl: string): IntegrationMode {
  return /mock|mailhog|sandbox|localhost|127\.0\.0\.1/.test(baseUrl) ? 'mock' : 'real';
}

