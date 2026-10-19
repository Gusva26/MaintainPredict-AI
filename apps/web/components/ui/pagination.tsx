'use client';
import { Button } from '@/components/ui/button';

/**
 * Barra de paginación compartida.
 *
 * Estaba copiada en tres tablas (auditoría, sensores y usuarios) como `<button>`
 * sueltos, sin anillo de foco ni etiqueta para lectores de pantalla. Al unificarla,
 * la navegación por teclado y el anuncio de página se arreglan en un solo sitio.
 */
export function PaginationBar({
  page,
  totalPages,
  total,
  label,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  /** Nombre del recurso, para el `aria-label` («Auditoría», «Sensores»…). */
  label: string;
  onPage: (page: number) => void;
}) {
  return (
    <nav aria-label={`Paginación de ${label}`} className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>
        Página {page} de {totalPages} · {total} registros
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          Anterior
        </Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
