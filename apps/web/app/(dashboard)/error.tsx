'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ExplanationFooter } from '@/components/ExplanationFooter';

/**
 * Error dentro del panel: se renderiza con la barra lateral y el topbar, así que el
 * usuario no pierde la navegación (el `error.tsx` raíz sí la pierde).
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Error en una vista del panel:', error);
  }, [error]);

  return (
    <div className="space-y-4">
      <div className="rounded border border-destructive/40 bg-destructive/5 p-4">
        <h1 className="text-base font-semibold">Esta vista no ha podido cargarse</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El resto del panel sigue disponible: puedes ir a otra sección desde el menú.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        <div className="mt-3 flex gap-2">
          <Button onClick={reset}>Reintentar</Button>
          <Button asChild variant="outline"><Link href="/dashboard">Ir al panel</Link></Button>
        </div>
      </div>
      <ExplanationFooter
        what="El aviso de que una vista concreta ha fallado al renderizar, sin tumbar el resto del panel."
        how="El mensaje de error sale tal cual de la excepción; si viene con una referencia (digest), sirve para localizarlo en los logs del contenedor web."
        decision="Reintentar una vez; si se repite, comprobar la salud del sistema con GET /api/health y los diagnósticos de ./scripts/smoke-test.sh antes de tocar datos."
      />
    </div>
  );
}
