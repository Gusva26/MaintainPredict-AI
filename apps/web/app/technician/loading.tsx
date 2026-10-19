/**
 * Carga dentro de la app del técnico (la PWA).
 *
 * Aquí sí compensa un esqueleto: es la primera pantalla que se abre en el móvil, a
 * menudo con mala cobertura, y las fichas se resuelven con SWR en el cliente.
 *
 * No hay `loading.tsx` en `app/` ni en `(dashboard)` a propósito: un límite de
 * Suspense hace que Next envíe la cabecera 200 antes de resolver la página, y con
 * ello `notFound()` deja de devolver un 404 real (ver `lib/db/detail-guard.ts`).
 * Las listas del panel ya tienen su propio esqueleto con el estado `isLoading`.
 */
export default function TechnicianLoading() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-6 w-40 animate-pulse rounded bg-muted" aria-hidden />
      <div className="h-24 animate-pulse rounded border bg-muted/40" aria-hidden />
      <div className="h-24 animate-pulse rounded border bg-muted/40" aria-hidden />
      <div className="h-24 animate-pulse rounded border bg-muted/40" aria-hidden />
    </div>
  );
}
