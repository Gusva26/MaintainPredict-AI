/**
 * Resiliencia de los agentes: corte por tiempo y reintentos con backoff.
 *
 * Motivo (fase E, spec §5): un agente no puede dejar colgada una petición HTTP
 * porque un proveedor externo (ML, LLM) no conteste. Antes, un `fetch` que no
 * respondía bloqueaba la ruta hasta el timeout del sistema operativo.
 *
 * Reparto de responsabilidades:
 *   - Servicio ML  → timeout + reintentos (es interno, rápido y barato, y su
 *                    número es imprescindible para la predicción).
 *   - LLM          → solo timeout: si falla, se usa el texto de respaldo de
 *                    inmediato (reintentar encarecería y retrasaría el plan).
 */

import { env } from '@/lib/env';

export type RetryOptions = {
  /** Reintentos ADICIONALES tras el primer intento. Por defecto `AGENT_RETRIES`. */
  retries?: number;
  /** Corte por intento en ms. Por defecto `AGENT_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** Base del backoff exponencial (ms). Por defecto 250 ms. */
  baseDelayMs?: number;
  /** Etiqueta para los mensajes de aviso. */
  label?: string;
};

/** Error propio para distinguir un corte por tiempo de un fallo del proveedor. */
export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label}: tiempo de espera agotado tras ${timeoutMs} ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Espera `promise` como mucho `timeoutMs`; si se pasa, rechaza con `TimeoutError`.
 * Un `timeoutMs` no positivo o no finito desactiva el corte.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = 'operación',
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Ejecuta `fn` con reintentos y backoff exponencial, cortando cada intento por
 * tiempo. Devuelve el primer resultado válido; si se agotan los intentos,
 * relanza el último error (nunca devuelve `undefined` en silencio).
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? env.AGENT_RETRIES;
  const timeoutMs = options.timeoutMs ?? env.AGENT_TIMEOUT_MS;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const label = options.label ?? 'agente';
  const attempts = Math.max(1, retries + 1);

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await withTimeout(fn(attempt), timeoutMs, label);
    } catch (err) {
      lastError = err;
      const pending = attempt < attempts - 1;
      if (pending) {
        const wait = baseDelayMs * 2 ** attempt;
        console.warn(
          `[${label}] intento ${attempt + 1}/${attempts} falló (${describe(err)}); reintento en ${wait} ms`,
        );
        await sleep(wait);
      }
    }
  }

  throw lastError;
}

/** Llama a `fn` con corte por tiempo pero SIN reintentos (para el LLM). */
export function withLlmTimeout<T>(fn: () => Promise<T>, label = 'LLM'): Promise<T> {
  return withTimeout(fn(), env.LLM_TIMEOUT_MS, label);
}
