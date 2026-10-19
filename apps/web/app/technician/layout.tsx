import { MobileNav } from '@/components/layout/MobileNav';

export default function TechnicianLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-16">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-20 border-b bg-card px-4 py-3">
        <h1 className="text-base font-semibold">App Técnico</h1>
      </header>
      <main id="contenido" tabIndex={-1} className="p-4">{children}</main>
      <MobileNav />
    </div>
  );
}
