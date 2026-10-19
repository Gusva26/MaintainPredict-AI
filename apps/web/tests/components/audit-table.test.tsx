import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AuditTable } from '@/components/audit/AuditTable';
import { AUDIT_ACTIONS, AUDIT_MODULES, CATALOGO_DE_ACCIONES_COMPLETO, CATALOGO_DE_MODULOS_COMPLETO } from '@/lib/audit/catalog';

// La tabla usa SWR; se sustituye por una respuesta con la MISMA forma que devuelve
// `/api/audit` de verdad: `items[i] = { log, user }`.
vi.mock('swr', () => ({
  default: () => ({
    data: {
      data: {
        items: [
          {
            log: {
              auditId: 512, userId: 1, action: 'login', module: 'auth',
              entityType: null, entityId: null, payload: null,
              ipAddress: '::ffff:172.19.0.1', userAgent: 'curl/8.21.0',
              createdAt: '2026-10-19T01:02:32.549Z',
            },
            user: { userId: 1, email: 'admin@mp.ai', fullName: 'Admin Principal', role: 'admin' },
          },
          {
            // Sin usuario: las acciones del sistema (p. ej. un job) no tienen `user_id`.
            log: {
              auditId: 511, userId: null, action: 'login_failed', module: 'auth',
              entityType: 'user', entityId: '9', payload: null,
              ipAddress: '10.0.0.7', userAgent: 'curl/8.21.0',
              createdAt: '2026-10-19T01:02:02.306Z',
            },
            user: null,
          },
        ],
        meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
      },
    },
    isLoading: false,
  }),
}));

afterEach(() => vi.restoreAllMocks());

describe('AuditTable', () => {
  it('renderiza las filas con usuario, acción, módulo, entidad e IP', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<AuditTable />);
    const texto = container.textContent ?? '';

    expect(texto).toContain('Admin Principal');
    expect(texto).toContain('admin');
    expect(texto).toContain('login');
    expect(texto).toContain('login_failed');
    expect(texto).toContain('auth');
    expect(texto).toContain('user #9');
    expect(texto).toContain('10.0.0.7');
    expect(texto).toContain('2 registros');

    // Regresión: si la API devolviera las filas anidadas de otra forma, el id sería
    // undefined y React avisaría de claves repetidas.
    expect(texto).not.toContain('undefined');
    expect(error.mock.calls.map((c) => c.map(String).join(' ')).join('\n')).not.toMatch(/unique "key"/i);
  });

  it('los filtros ofrecen el catálogo completo de acciones y módulos', () => {
    const { container } = render(<AuditTable />);

    for (const accion of AUDIT_ACTIONS) {
      expect(container.querySelector(`option[value="${accion}"]`)).not.toBeNull();
    }
    for (const modulo of AUDIT_MODULES) {
      expect(container.querySelector(`option[value="${modulo}"]`)).not.toBeNull();
    }
  });

  it('el catálogo cubre lo que el backend registra (comprobado al compilar)', () => {
    expect(CATALOGO_DE_ACCIONES_COMPLETO).toBe(true);
    expect(CATALOGO_DE_MODULOS_COMPLETO).toBe(true);
  });
});
