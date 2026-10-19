import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, cleanup } from '@testing-library/react';
import axe from 'axe-core';
import { AuditTable } from '@/components/audit/AuditTable';
import { PredictionDetail } from '@/components/predictions/PredictionDetail';
import { PaginationBar } from '@/components/ui/pagination';
import { PasswordChecklist } from '@/components/auth/PasswordChecklist';
import { ExplanationFooter } from '@/components/ExplanationFooter';

/**
 * Auditoría de accesibilidad con axe-core (G.13).
 *
 * Se pide lo que el plan exige: **ninguna violación crítica ni grave**. Las de
 * impacto moderado/menor (p. ej. `region`, que se resuelve con el layout real)
 * quedan fuera del umbral. `color-contrast` se desactiva porque jsdom no calcula
 * colores: esa comprobación se hace en el navegador, no aquí.
 */

const state = vi.hoisted(() => ({ audit: null as any, prediction: null as any }));

vi.mock('swr', () => ({
  default: (key: string) => (key.startsWith('/api/audit') ? state.audit : state.prediction),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a>
  ),
}));

vi.mock('@/lib/hooks/useRbac', () => ({
  useRbac: () => ({
    session: { id: 1, email: 'admin@mp.ai', name: 'Admin', role: 'admin' as const },
    can: () => true,
  }),
}));

state.audit = {
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
      ],
      meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    },
  },
  isLoading: false,
};

state.prediction = {
  data: {
    data: {
      prediction: {
        predictionId: 173, equipmentId: 2, component: 'bearing', failureProbability: 0.907,
        windowDays: 7, modelVersion: 'rf-v1.0.0', explanation: 'Vibración en zona C.',
        createdAt: '2026-10-18T23:20:41.512Z', alert: true,
        features: {
          inputs: [{ type: 'vibration', value: 10.7, min: 0, max: 11, unit: 'mm/s' }],
          top_features: [{ feature: 'vibration.ratio', value: 0.973 }],
          rag_sources: [{ doc_id: 3, title: 'Norma ISO 10816', similarity: 0.68 }],
        },
      },
      equipment: {
        equipmentId: 2, name: 'EQ-00001-Motor', type: 'Motor', location: 'Planta-2',
        criticality: 'medium', status: 'operational', downtimeCostEurH: '900.00', installationDate: null,
      },
      orders: [],
      hasOrder: false,
    },
  },
  isLoading: false,
};

async function violacionesGraves(node: HTMLElement) {
  const resultado = await axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
  return resultado.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id} (${v.impact}): ${v.help}`);
}

// Sin `globals` en vitest, Testing Library no registra su limpieza automática:
// sin esto, el DOM de un test se cuela en el siguiente y las consultas globales
// encuentran elementos duplicados.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('accesibilidad (axe-core)', () => {
  it('la tabla de auditoría no tiene violaciones críticas ni graves', async () => {
    const { container } = render(<AuditTable />);
    expect(await violacionesGraves(container)).toEqual([]);
  });

  it('el detalle de predicción no tiene violaciones críticas ni graves', async () => {
    const { container } = render(<PredictionDetail id={173} />);
    expect(await violacionesGraves(container)).toEqual([]);
  });

  it('la paginación se anuncia como navegación y sus botones tienen nombre', async () => {
    const { container, getByLabelText } = render(
      <PaginationBar page={2} totalPages={5} total={100} label="usuarios" onPage={() => {}} />,
    );
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Paginación de usuarios');
    expect(getByLabelText('Página anterior')).toBeTruthy();
    expect(getByLabelText('Página siguiente')).toBeTruthy();
    expect(await violacionesGraves(container)).toEqual([]);
  });

  it('las reglas de contraseña se anuncian y marcan su estado', async () => {
    const { container } = render(<PasswordChecklist password="Password12" />);
    // El símbolo ✓/· es decorativo; el estado va en texto para el lector de pantalla.
    expect(container.textContent).toContain('(pendiente)');
    expect(await violacionesGraves(container)).toEqual([]);
  });

  it('el pie de explicación usa role=note con etiqueta', async () => {
    const { container } = render(<ExplanationFooter what="a" how="b" decision="c" />);
    const note = container.querySelector('[role="note"]');
    expect(note?.getAttribute('aria-label')).toBe('Explicación del dato mostrado');
    expect(await violacionesGraves(container)).toEqual([]);
  });
});
