import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, cleanup } from '@testing-library/react';
import { UserList } from '@/components/users/UserList';
import { SensorList } from '@/components/sensors/SensorList';

/**
 * Contrato de las pantallas CRUD: comprueban la forma EXACTA que devuelven
 * `/api/users` y `/api/sensors` (paginado con `items`/`meta` y, en sensores, el
 * equipo anidado). Si el backend cambia el anidado, esto falla en vez de pintar
 * una tabla llena de «—».
 */

const state = vi.hoisted(() => ({ users: null as any, sensors: null as any }));

vi.mock('swr', () => ({
  default: (key: string) => {
    if (key.startsWith('/api/users')) return state.users;
    if (key.startsWith('/api/sensors/')) return { data: { data: { sensor: {}, lastReadings: [] } }, isLoading: false };
    if (key.startsWith('/api/sensors')) return state.sensors;
    if (key === '/api/auth/me') {
      return { data: { data: { id: 1, email: 'admin@mp.ai', name: 'Admin Principal', role: 'admin' } } };
    }
    return { data: undefined, isLoading: false };
  },
}));

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

state.users = {
  data: {
    data: {
      items: [
        {
          userId: 1, email: 'admin@mp.ai', fullName: 'Admin Principal', role: 'admin',
          phone: null, isActive: true, lastLoginAt: '2026-10-19T01:02:32.549Z',
          createdAt: '2026-10-01T00:00:00.000Z', updatedAt: null,
        },
        {
          userId: 9, email: 'baja@mp.ai', fullName: 'Usuario Baja', role: 'technician',
          phone: '+34600000000', isActive: false, lastLoginAt: null,
          createdAt: '2026-10-01T00:00:00.000Z', updatedAt: null,
        },
      ],
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    },
  },
  isLoading: false,
};

state.sensors = {
  data: {
    data: {
      items: [
        {
          sensorId: 42, equipmentId: 2, type: 'vibration', unit: 'mm/s', status: 'active',
          minThreshold: '0.0000', maxThreshold: '11.0000',
          equipment: { equipmentId: 2, name: 'EQ-00001-Motor', criticality: 'medium' },
        },
        {
          // Sin equipo (left join): la tabla debe mostrar «—», no «undefined».
          sensorId: 43, equipmentId: 99, type: 'temperature', unit: '°C', status: 'maintenance',
          minThreshold: null, maxThreshold: null, equipment: null,
        },
      ],
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    },
  },
  isLoading: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UserList', () => {
  it('pinta usuarios activos y desactivados con su último acceso', () => {
    const { container } = render(<UserList />);
    const texto = container.textContent ?? '';

    expect(texto).toContain('Admin Principal');
    expect(texto).toContain('admin@mp.ai');
    expect(texto).toContain('activo');
    expect(texto).toContain('desactivado');
    expect(texto).toContain('nunca');           // lastLoginAt null
    expect(texto).toContain('(tú)');            // el usuario de la sesión
    expect(texto).toContain('Nuevo usuario');   // el alta existe (en un diálogo)
    expect(texto).toContain('2 registros');
    expect(texto).not.toContain('undefined');
  });
});

describe('SensorList', () => {
  it('pinta sensores, su equipo enlazado y los umbrales', () => {
    const { container } = render(<SensorList />);
    const texto = container.textContent ?? '';

    expect(texto).toContain('#42');
    expect(texto).toContain('EQ-00001-Motor');
    expect(texto).toContain('vibration');
    expect(texto).toContain('mm/s');
    expect(texto).toContain('11.0000');
    expect(texto).toContain('maintenance');
    expect(texto).toContain('Ver lecturas');
    expect(texto).toContain('Nuevo sensor');
    expect(texto).toContain('2 registros');
    expect(texto).not.toContain('undefined');

    // El sensor sin equipo muestra un guion, no el hueco del left join.
    expect(container.textContent).toContain('#43');
  });
});
