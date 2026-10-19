import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Enlace de salto: con teclado, la primera tabulación lleva al contenido en
          lugar de recorrer las 11 entradas del menú (WCAG 2.4.1). */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main id="contenido" tabIndex={-1} className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
