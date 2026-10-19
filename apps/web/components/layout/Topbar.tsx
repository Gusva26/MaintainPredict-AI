'use client';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/lib/hooks/useSession';

const titles: Record<string, string> = {
  '/dashboard': 'Panel de control',
  '/equipment': 'Equipos',
  '/predictions': 'Predicciones',
  '/orders': 'Órdenes de mantenimiento',
  '/reports': 'Reportes',
  '/observability': 'Observabilidad',
  '/audit': 'Auditoría',
};

export function Topbar() {
  const path = usePathname();
  const { session } = useSession();
  const key = Object.keys(titles).find((k) => path.startsWith(k));
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
      <h1 className="text-base font-semibold">{key ? titles[key] : 'MaintainPredict AI'}</h1>
      <div className="flex items-center gap-2">
        {session && <Badge variant="secondary">{session.role}</Badge>}
      </div>
    </header>
  );
}
