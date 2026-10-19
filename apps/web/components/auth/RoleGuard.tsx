'use client';
import { useRbac } from '@/lib/hooks/useRbac';

type Props = {
  permission: Parameters<ReturnType<typeof useRbac>['can']>[0];
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

export function RoleGuard({ permission, fallback = null, children }: Props) {
  const { can, session } = useRbac();
  if (!session) return null;
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}
