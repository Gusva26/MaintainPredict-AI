import { describe, it, expect } from 'vitest';
import { can } from '../lib/auth/rbac';

describe('RBAC Matrix', () => {
  it('technician puede completar órdenes pero no aprobarlas ni escribir equipos', () => {
    expect(can('technician', 'orders:complete')).toBe(true);
    expect(can('technician', 'orders:read')).toBe(true);
    expect(can('technician', 'orders:approve')).toBe(false);
    expect(can('technician', 'equipment:write')).toBe(false);
  });

  it('planner puede leer, crear y aprobar órdenes, y consultar reportes', () => {
    expect(can('planner', 'orders:read')).toBe(true);
    expect(can('planner', 'orders:create')).toBe(true);
    expect(can('planner', 'orders:approve')).toBe(true);
    expect(can('planner', 'reports:read')).toBe(true);
    expect(can('planner', 'users:manage')).toBe(false);
  });

  it('supervisor puede aprobar órdenes y editar equipos', () => {
    expect(can('supervisor', 'orders:approve')).toBe(true);
    expect(can('supervisor', 'equipment:write')).toBe(true);
    expect(can('supervisor', 'predict:run')).toBe(true);
  });

  it('admin tiene permisos completos (usuarios, auditoría, sensores, órdenes)', () => {
    expect(can('admin', 'users:manage')).toBe(true);
    expect(can('admin', 'audit:read')).toBe(true);
    expect(can('admin', 'sensors:ingest')).toBe(true);
    expect(can('admin', 'orders:approve')).toBe(true);
    expect(can('admin', 'orders:complete')).toBe(true);
    expect(can('admin', 'integrations:read')).toBe(true);
  });

  it('integrations:read queda restringido a supervisor y admin', () => {
    expect(can('supervisor', 'integrations:read')).toBe(true);
    expect(can('planner', 'integrations:read')).toBe(false);
    expect(can('technician', 'integrations:read')).toBe(false);
  });
});
