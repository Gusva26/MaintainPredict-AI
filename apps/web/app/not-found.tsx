import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Página no encontrada' };

/**
 * 404 propio: por defecto Next sirve una página en inglés y sin la identidad del
 * producto. Se conserva la navegación al panel.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-4xl font-bold text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">Esta página no existe</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Puede que el enlace esté mal escrito o que el elemento al que apuntaba se haya eliminado.
      </p>
      <Button asChild><Link href="/dashboard">Volver al panel</Link></Button>
    </div>
  );
}
