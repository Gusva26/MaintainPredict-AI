'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, CheckSquare, LogOut, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/technician', label: 'Órdenes', icon: ClipboardList },
  { href: '/technician/checklists', label: 'Checklists', icon: CheckSquare },
  { href: '/', label: 'Escritorio', icon: Home },
];

export function MobileNav() {
  const path = usePathname();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  }
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card md:hidden">
      <ul className="grid grid-cols-4">
        {items.map((i) => {
          const Icon = i.icon;
          // Coincidencia exacta: estas pestañas son páginas hoja. Con `startsWith`
          // se marcaban a la vez "Órdenes" y "Checklists" en /technician/checklists.
          const active = path === i.href;
          return (
            <li key={i.href}>
              <Link href={i.href}
                className={cn('flex flex-col items-center justify-center gap-1 py-2 text-[11px]',
                  active ? 'text-primary' : 'text-muted-foreground')}>
                <Icon className="h-5 w-5" />
                {i.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button onClick={logout} className="flex w-full flex-col items-center justify-center gap-1 py-2 text-[11px] text-muted-foreground">
            <LogOut className="h-5 w-5" /> Salir
          </button>
        </li>
      </ul>
    </nav>
  );
}
