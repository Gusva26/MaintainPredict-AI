import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { OrderList } from '@/components/orders/OrderList';
import { PredictionList } from '@/components/predictions/PredictionList';
import { EquipmentList } from '@/components/equipment/EquipmentList';

// Las listas usan SWR + RoleGuard + next/link; los sustituimos por versiones
// simples para poder renderizarlas en jsdom sin red ni router.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

vi.mock('@/lib/hooks/useRbac', () => ({
  useRbac: () => ({
    session: { id: 1, email: 'admin@mp.ai', name: 'Admin', role: 'admin' as const },
    can: () => true,
  }),
}));

// Los datos imitan EXACTAMENTE la forma que devuelve la API real: items
// PLANOS (orderId / predictionId / equipmentId en la raíz), no anidados.
vi.mock('swr', () => ({
  default: (key: string) => {
    const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
    const mutate = () => {};
    if (key.startsWith('/api/orders')) {
      return {
        data: {
          data: {
            items: [
              {
                orderId: 93, equipmentId: 120, predictionId: 120,
                scheduledDate: '2026-10-17T02:00:00.000Z', technicianId: 5,
                parts: [{ sku: 'BRG-6205', qty: 2 }], estimatedDowntimeH: '4.50',
                status: 'pending_approval', priority: 'critical',
                notes: null, requiresHitl: true, createdAt: '2026-10-16T23:05:12.813Z',
                equipment: { equipmentId: 120, name: 'EQ-00024-CNC', criticality: 'low', location: 'Planta-5/Linea-5' },
                technician: { userId: 5, fullName: 'Marta Técnica', email: 'tec2@mp.ai' },
              },
            ],
            meta,
          },
        },
        isLoading: false,
        mutate,
      };
    }
    if (key.startsWith('/api/predictions')) {
      return {
        data: {
          data: {
            items: [
              {
                predictionId: 81, equipmentId: 81, component: 'motor',
                failureProbability: 0.979, windowDays: 7, modelVersion: 'v1.0.0-rf+lstm',
                explanation: null, createdAt: '2026-10-16T22:31:54.418Z',
                equipment: { equipmentId: 81, name: 'EQ-00017-Pump', criticality: 'medium', location: 'Planta-3/Linea-4' },
                alert: true,
              },
            ],
            meta,
          },
        },
        isLoading: false,
        mutate,
      };
    }
    return {
      data: {
        data: {
          items: [
            {
              equipmentId: 2500, name: 'EQ-00500-CNC', type: 'CNC', location: 'Planta-1/Linea-1',
              criticality: 'low', status: 'operational', downtimeCostEurH: '1482.44',
              installationDate: null,
            },
          ],
          meta,
        },
      },
      isLoading: false,
      mutate,
    };
  },
}));

afterEach(() => vi.restoreAllMocks());

function renderCapturingErrors(node: ReactNode) {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const utils = render(node);
  const errors = error.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
  return { ...utils, errors };
}

describe('Listas (contrato con la API y keys de React)', () => {
  it('OrderList renderiza órdenes planas (id/técnico/estado) y no "undefined"', () => {
    const { container, errors } = renderCapturingErrors(<OrderList />);
    expect(container.textContent).toContain('#93');
    expect(container.textContent).toContain('EQ-00024-CNC');
    expect(container.textContent).toContain('Marta Técnica');
    // Regresión: si la API devolviera items anidados ({ order: {…} }), la key
    // sería undefined y el id se pintaría como "undefined".
    expect(container.textContent).not.toContain('undefined');
    expect(errors).not.toMatch(/unique "key"/i);
  });

  it('PredictionList renderiza predicciones planas', () => {
    const { container, errors } = renderCapturingErrors(<PredictionList />);
    expect(container.textContent).toContain('#81');
    expect(container.textContent).toContain('EQ-00017-Pump');
    expect(container.textContent).toContain('v1.0.0-rf+lstm');
    expect(container.textContent).not.toContain('undefined');
    expect(errors).not.toMatch(/unique "key"/i);
  });

  it('EquipmentList renderiza equipos planos', () => {
    const { container, errors } = renderCapturingErrors(<EquipmentList />);
    expect(container.textContent).toContain('#2500');
    expect(container.textContent).toContain('EQ-00500-CNC');
    expect(container.textContent).toContain('CNC');
    expect(container.textContent).not.toContain('undefined');
    expect(errors).not.toMatch(/unique "key"/i);
  });
});
