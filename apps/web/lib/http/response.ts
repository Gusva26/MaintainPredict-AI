import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export type Explanation = {
  what: string;      // qué muestra
  how: string;       // cómo interpretarlo
  decision: string;  // qué decisión sugiere
};

export function ok<T>(data: T, explanation?: Explanation, init?: ResponseInit) {
  return NextResponse.json({ data, explanation: explanation ?? null }, init);
}

export function created<T>(data: T, explanation?: Explanation) {
  return ok(data, explanation, { status: 201 });
}

export function fail(status: number, error: string, details?: unknown) {
  return NextResponse.json({ error, details: details ?? null }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail(422, 'Validation failed', err.flatten());
  }

  const anyErr = err as any;
  if (anyErr?.status) {
    return fail(anyErr.status, anyErr.message ?? 'Error');
  }

  console.error('[api] unhandled exception', err);
  return fail(500, 'Internal Server Error');
}
