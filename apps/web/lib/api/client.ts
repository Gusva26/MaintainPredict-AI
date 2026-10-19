import type { Explanation } from '@/lib/http/response';

export type ApiResponse<T> = { data: T; explanation: Explanation | null };

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? 'Error de red', body.details);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export const fetcher = <T,>(url: string) => fetch(url, { credentials: 'include' }).then(handle<ApiResponse<T>>);

export async function apiPost<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle<ApiResponse<T>>(res);
}

export async function apiPut<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle<ApiResponse<T>>(res);
}

/** Edición parcial (lo usan los endpoints de usuario, que exponen PATCH). */
export async function apiPatch<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle<ApiResponse<T>>(res);
}
