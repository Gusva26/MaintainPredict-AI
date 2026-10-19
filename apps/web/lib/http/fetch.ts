/**
 * Utilidades HTTP compartidas por integraciones y agentes.
 *
 * Vive aquí (y no en `lib/integrations`) porque no tiene nada que ver con
 * integraciones: es un `fetch` con corte por tiempo reutilizable.
 */

/** `fetch` con corte por tiempo: si el proveedor no responde, no bloquea la petición. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 5000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
