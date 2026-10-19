'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, apiPut } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChecklistForm } from './ChecklistForm';
import { PhotoUpload } from './PhotoUpload';
import { useSession } from '@/lib/hooks/useSession';
import { toast } from 'sonner';
import type { Paginated, Order } from '@/lib/api/types';

/** Estados en los que al técnico todavía le queda trabajo por hacer. */
const PENDIENTES = ['planned', 'approved', 'in_progress'];

/**
 * Lista de órdenes del técnico autenticado.
 *
 * `onlyPending` la reutiliza la pestaña "Checklists" de la barra móvil para mostrar
 * solo lo que sigue abierto, sin duplicar la lógica de completar ni de subir fotos.
 */
export function OrderView({ onlyPending = false }: { onlyPending?: boolean }) {
  const { session } = useSession();
  const [open, setOpen] = useState<number | null>(null);
  /**
   * Fotos ya subidas, por orden, pendientes de enviarse al completar.
   *
   * Subir una foto NO cierra la orden: se acumula aquí y viaja en el mismo
   * `PUT /complete` que las notas del checklist. Antes se completaba la orden
   * en el momento de la subida, lo que permitía cerrarla sin los 6 pasos.
   */
  const [photos, setPhotos] = useState<Record<number, string[]>>({});
  const { data, isLoading, mutate } = useSWR<{ data: Paginated<Order> }>(
    session ? `/api/orders?technician_id=${session.id}&pageSize=50` : null,
    fetcher, { refreshInterval: 30_000 },
  );
  const todas = data?.data?.items ?? [];
  const items = onlyPending ? todas.filter((o) => PENDIENTES.includes(o.status)) : todas;

  function addPhoto(id: number, url: string) {
    setPhotos((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), url] }));
  }

  async function start(id: number) {
    try {
      await apiPut(`/api/orders/${id}/start`);
      toast.success('Intervención iniciada');
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function complete(id: number, payload: { notes?: string; photos?: string[] }) {
    try {
      await apiPut(`/api/orders/${id}/complete`, payload);
      toast.success('Orden completada');
      setPhotos((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      mutate();
      setOpen(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {onlyPending
          ? 'No tienes checklists pendientes: no queda ninguna orden por ejecutar.'
          : 'No tienes órdenes asignadas.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((o) => (
        <Card key={o.orderId}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              Orden #{o.orderId}
              <Badge variant={o.priority === 'critical' ? 'destructive' : o.priority === 'high' ? 'warning' : 'secondary'}>
                {o.priority}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Equipo:</span> {o.equipment?.name ?? '—'}</div>
            <div><span className="text-muted-foreground">Ubicación:</span> {o.equipment?.location ?? '—'}</div>
            <div><span className="text-muted-foreground">Programada:</span> {o.scheduledDate ? new Date(o.scheduledDate).toLocaleString('es-ES') : '—'}</div>
            <div><span className="text-muted-foreground">Estado:</span> {o.status}</div>
            {o.notes && <div className="text-xs text-muted-foreground">{o.notes}</div>}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(open === o.orderId ? null : o.orderId)}>
                {open === o.orderId ? 'Cerrar' : 'Abrir checklist'}
              </Button>
              {PENDIENTES.includes(o.status) && o.status !== 'in_progress' && (
                <Button size="sm" onClick={() => start(o.orderId)}>Iniciar intervención</Button>
              )}
              {o.status === 'in_progress' && (
                <span className="text-xs font-medium text-amber-600">En ejecución</span>
              )}
            </div>
            {open === o.orderId && (
              <div className="space-y-3 rounded border p-3">
                <ChecklistForm
                  orderId={o.orderId}
                  onSubmit={(notes) => complete(o.orderId, { notes, photos: photos[o.orderId] ?? [] })}
                />
                <PhotoUpload orderId={o.orderId} onUploaded={(url) => addPhoto(o.orderId, url)} />
                {(photos[o.orderId]?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {photos[o.orderId].length} foto(s) adjunta(s). Se enviarán al completar la orden.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
