import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleGuard } from '@/components/auth/RoleGuard';

vi.mock('@/lib/hooks/useRbac', () => ({
  useRbac: () => ({
    session: { id: 1, email: 'tec@mp.ai', name: 'Técnico', role: 'technician' as const },
    can: (p: string) => p === 'orders:read',
  }),
}));

describe('RoleGuard', () => {
  it('muestra children cuando el rol tiene permiso', () => {
    render(<RoleGuard permission="orders:read"><span>VISIBLE</span></RoleGuard>);
    expect(screen.getByText('VISIBLE')).toBeInTheDocument();
  });
  it('oculta children cuando el rol no tiene permiso', () => {
    render(<RoleGuard permission="orders:approve"><span>OCULTO</span></RoleGuard>);
    expect(screen.queryByText('OCULTO')).not.toBeInTheDocument();
  });
});
