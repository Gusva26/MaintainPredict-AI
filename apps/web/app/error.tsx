'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Error de cualquier página dentro del layout raíz (conserva el tema y la tipografía). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Error en el segmento raíz:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">No se ha podido cargar la página</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Ha ocurrido un error al renderizar esta vista. Si vuelve a pasar, revisa el estado con{' '}
        <code className="rounded bg-muted px-1">./scripts/smoke-test.sh</code>.
      </p>
      <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
      <div className="flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Button asChild variant="outline"><Link href="/dashboard">Volver al panel</Link></Button>
      </div>
    </div>
  );
}
