import { NextResponse } from 'next/server';
import { pg } from '@/lib/db/client';
import type { Explanation } from '@/lib/http/response';

/**
 * GET /api/health
 *
 * Público (lo usan el healthcheck de Docker, Caddy y `scripts/smoke-test.sh`).
 * Se mantiene la forma plana (`status`, `db`, `timestamp`) y se le añade la
 * explicación estándar para que también la consuma la UI.
 */
const EXPLANATION: Explanation = {
  what: 'Latido del servicio web y conectividad con PostgreSQL.',
  how: '`status: "ok"` (HTTP 200) significa que la web responde y la base de datos acepta consultas; `"degraded"` (HTTP 503) que la base no responde.',
  decision: 'Ante un 503, revisar el contenedor `postgres` y la variable `DATABASE_URL` antes de tocar el resto del stack.',
};

export async function GET() {
  try {
    await pg`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      db: 'up',
      timestamp: new Date().toISOString(),
      explanation: EXPLANATION,
    });
  } catch (e) {
    return NextResponse.json({
      status: 'degraded',
      db: 'down',
      error: String(e),
      timestamp: new Date().toISOString(),
      explanation: EXPLANATION,
    }, { status: 503 });
  }
}
