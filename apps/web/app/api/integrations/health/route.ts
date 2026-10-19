import { NextRequest } from 'next/server';
import { getIntegrations } from '@/lib/integrations';
import { requirePermission } from '@/lib/auth/session';
import { ok, handleError } from '@/lib/http/response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/health
 *
 * Estado agregado de los adaptadores de integración (ERP, SCADA, SMS, Email).
 * Requiere `integrations:read` (admin, supervisor).
 */
export async function GET(_: NextRequest) {
  try {
    await requirePermission('integrations:read');

    const integrations = getIntegrations();
    const adapters = await integrations.health();

    const summary = {
      total: adapters.length,
      ok: adapters.filter((a) => a.ok).length,
      failed: adapters.filter((a) => !a.ok).map((a) => a.adapter),
      slowestMs: adapters.reduce((max, a) => Math.max(max, a.latencyMs), 0),
    };

    return ok(
      { mode: integrations.mode, summary, adapters },
      {
        what: 'Estado en vivo de los adaptadores de integración y la latencia de cada sonda.',
        how: 'Un adaptador en rojo no detiene la app: se degrada al catálogo/simulación local. `mode` indica si el entorno es simulado o real.',
        decision:
          'Si `failed` no está vacío, revisar URL y credenciales del sistema afectado; si `slowestMs` supera ~1000 ms, revisar la red con el proveedor.',
      },
    );
  } catch (e) {
    return handleError(e);
  }
}
