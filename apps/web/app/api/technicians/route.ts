import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/session';
import { technicianAvailability } from '@/lib/db/queries';
import { ok, handleError } from '@/lib/http/response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/technicians
 *
 * Técnicos con su carga de órdenes abiertas, ordenados de menor a mayor carga.
 * La misma consulta alimenta al PlannerAgent, así que la UI nunca discrepa del agente.
 */
export async function GET(_: NextRequest) {
  try {
    await requirePermission('orders:read');

    const technicians = await technicianAvailability();

    return ok(
      { items: technicians, total: technicians.length },
      {
        what: 'Técnicos activos con el número de órdenes abiertas (planned, approved, in_progress).',
        how: 'Ordenados por menor carga: el primero es el candidato natural para una asignación nueva.',
        decision: 'Asignar la próxima orden al técnico con menos carga y con especialidad compatible con el componente.',
      },
    );
  } catch (e) {
    return handleError(e);
  }
}
