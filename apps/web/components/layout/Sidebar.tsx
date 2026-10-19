'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Wrench, Activity, ClipboardList, FileBarChart2, ShieldCheck,
  LogOut, Users, Radio, Plug, UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRbac } from '@/lib/hooks/useRbac';
import { useSession } from '@/lib/hooks/useSession';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Permission } from '@/lib/auth/rbac';

type NavItem = { href: string; label: string; icon: typeof Activity; perm?: Permission };

/**
 * Navegación lateral. `perm` es opcional: las páginas personales (mi perfil) no
 * dependen de un permiso, solo de tener sesión. La lista se agrupa en dos bloques
 * para que un administrador no vea catorce entradas mezcladas.
 */
const principal: NavItem[] = [
  { href: '/dashboard',     label: 'Dashboard',      icon: LayoutDashboard, perm: 'equipment:read' },
  { href: '/equipment',     label: 'Equipos',        icon: Wrench,          perm: 'equipment:read' },
  { href: '/sensors',       label: 'Sensores',       icon: Radio,           perm: 'equipment:read' },
  { href: '/predictions',   label: 'Predicciones',   icon: Activity,        perm: 'predictions:read' },
  { href: '/orders',        label: 'Órdenes',        icon: ClipboardList,   perm: 'orders:read' },
  { href: '/reports',       label: 'Reportes',       icon: FileBarChart2,   perm: 'reports:read' },
  { href: '/observability', label: 'Observabilidad', icon: Activity,        perm: 'reports:read' },
  { href: '/profile',       label: 'Mi perfil',      icon: UserCog },
];

const administracion: NavItem[] = [
  { href: '/integrations', label: 'Integraciones', icon: Plug,        perm: 'integrations:read' },
  { href: '/audit',        label: 'Auditoría',     icon: ShieldCheck, perm: 'audit:read' },
  { href: '/users',        label: 'Usuarios',      icon: Users,       perm: 'users:manage' },
];

export function Sidebar() {
  const path = usePathname();
  const { can } = useRbac();
  const { session } = useSession();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  }

  const visible = (list: NavItem[]) => list.filter((i) => !i.perm || can(i.perm));

  const render = (list: NavItem[]) =>
    visible(list).map((i) => {
      const Icon = i.icon;
      const active = path === i.href || path.startsWith(`${i.href}/`);
      return (
        <Link key={i.href} href={i.href}
          className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
          <Icon className="h-4 w-4" />
          {i.label}
        </Link>
      );
    });

  const hayAdministracion = visible(administracion).length > 0;

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">MP</div>
        <span className="text-sm font-semibold">MaintainPredict</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {render(principal)}
        {hayAdministracion && (
          <>
            <div className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Administración
            </div>
            {render(administracion)}
          </>
        )}
      </nav>
      <div className="border-t p-3 text-xs">
        <DropdownMenu>
          <DropdownMenuTrigger className="mb-2 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
            <div className="truncate">
              <div className="font-medium">{session?.name ?? '—'}</div>
              <div className="text-muted-foreground">{session?.role ?? ''}</div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Cuenta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile" className="w-full cursor-pointer">
                <UserCog className="h-4 w-4" /> Mi perfil y contraseña
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
