'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, apiPost, apiPut } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ExplanationFooter } from '@/components/ExplanationFooter';
import { orderPriorityVariant, orderStatusVariant } from '@/lib/ui/variants';
import { CompletionPanel } from './CompletionPanel';
import { toast } from 'sonner';
import type { OrderDetailPayload } from '@/lib/api/types';

type Decision = 'approve' | 'reject';

export function OrderDetail({ id }: { id: number }) {
  // Antes esto pedía las 200 órdenes más recientes y buscaba la suya en el cliente:
  // con más de 200 órdenes la ficha se quedaba vacía sin explicar por qué.
  const { data, isLoading, error, mutate } = useSWR<{ data: OrderDetailPayload }>(
    `/api/orders/${id}`,
    fetcher,
  );

  // El email HITL enlaza a /orders/:id?resume=<url de n8n>&decision=approve|reject.
  // Se lee en el cliente (y no en el primer render) para no romper la hidratación.
  const [hitl, setHitl] = useState<{ resume: string | null; decision: Decision | null }>({
    resume: null,
    decision: null,
  });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get('decision');
    setHitl({
      resume: q.get('resume'),
      decision: d === 'approve' || d === 'reject' ? d : null,
    });
  }, []);

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (error || !data?.data) {
    return (
      <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
        No se ha podido cargar la orden #{id}{error?.message ? `: ${error.message}` : '.'}
      </div>
    );
  }

  const { order, equipment, technician, prediction, approvedBy } = data.data;

  /**
   * Resuelve el HITL. `resume` devuelve el control a la espera (Wait) de WF-02: sin él,
   * el workflow seguiría esperando y a los 30 min avisaría de un timeout que no ocurrió.
   */
  async function resolve(decision: Decision) {
    const qs = new URLSearchParams({ decision });
    if (hitl.resume) qs.set('resume', hitl.resume);
    try {
      await apiPost(`/api/orders/${id}/approve?${qs}`);
      toast.success(decision === 'approve' ? 'Orden aprobada' : 'Orden rechazada');
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function confirmarRechazo() {
    const ok = window.confirm(
      `¿Rechazar la orden #${order.orderId}?\n\nNo se ejecutará: la orden quedará cancelada, ` +
        'conservará la predicción que la originó y tu nombre en las notas.',
    );
    if (ok) resolve('reject');
  }

  async function complete(payload: { notes?: string; photos?: string[]; false_positive?: boolean }) {
    try { await apiPut(`/api/orders/${id}/complete`, payload); toast.success('Completada'); mutate(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      {hitl.decision && order.status === 'pending_approval' && (
        <div className="rounded border border-primary/40 bg-primary/5 p-3 text-sm">
          Has llegado desde el email de aprobación HITL para{' '}
          <b>{hitl.decision === 'approve' ? 'aprobar' : 'rechazar'}</b> esta orden. Revisa el contexto y
          confirma abajo con uno de los dos botones: desde el enlace del correo no se decide nada por sí solo.
        </div>
      )}

      {order.status === 'cancelled' && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <b>Orden rechazada.</b> No se ejecutará. El motivo y quién la rechazó están en las notas, y la
          decisión queda registrada en la auditoría.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Orden #{order.orderId}
            <Badge variant={orderStatusVariant(order.status)}>{order.status}</Badge>
            <Badge variant={orderPriorityVariant(order.priority)}>{order.priority}</Badge>
            {order.requiresHitl && <Badge variant="warning">HITL</Badge>}
            {order.status === 'pending_approval' && <span className="text-xs font-normal text-muted-foreground">esperando aprobación</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Equipo:</span>{' '}
            {equipment ? (
              <Link href={`/equipment/${equipment.equipmentId}`} className="hover:underline">
                {equipment.name}
              </Link>
            ) : '—'}
            {equipment && <span className="text-xs text-muted-foreground"> · {equipment.criticality}</span>}
          </div>
          <div>
            <span className="text-muted-foreground">Técnico:</span> {technician?.fullName ?? 'sin asignar'}
            {technician?.phone && <span className="text-xs text-muted-foreground"> · {technician.phone}</span>}
          </div>
          <div>
            <span className="text-muted-foreground">Programada:</span>{' '}
            {order.scheduledDate ? new Date(order.scheduledDate).toLocaleString('es-ES') : '—'}
          </div>
          <div><span className="text-muted-foreground">Parada estimada:</span> {order.estimatedDowntimeH ?? '—'} h</div>
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Repuestos:</span>{' '}
            {order.parts?.length ? order.parts.map((p) => `${p.sku}×${p.qty}`).join(', ') : '—'}
          </div>
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Predicción de origen:</span>{' '}
            {prediction ? (
              <Link href={`/predictions/${prediction.predictionId}`} className="hover:underline">
                #{prediction.predictionId}
              </Link>
            ) : '—'}
            {prediction && (
              <span className="text-xs text-muted-foreground">
                {' '}· {prediction.component ?? 'unknown'} · {Math.round(prediction.failureProbability * 100)}%
              </span>
            )}
          </div>
          {approvedBy && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Aprobada por:</span> {approvedBy.fullName}
            </div>
          )}
          {order.notes && (
            <div className="sm:col-span-2 whitespace-pre-line">
              <span className="text-muted-foreground">Notas:</span> {order.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {order.status === 'pending_approval' && (
        <RoleGuard permission="orders:approve">
          <Card>
            <CardHeader><CardTitle>Aprobación HITL</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Esta orden requiere aprobación humana (parada estimada superior a 4 h) y está bloqueada hasta
                que un supervisor o planificador decida. Aprobar la autoriza y avisa al técnico; rechazarla la
                deja cancelada, sin borrar nada.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={hitl.decision === 'reject' ? 'outline' : 'default'}
                  onClick={() => resolve('approve')}
                >
                  Aprobar orden
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmarRechazo}
                >
                  Rechazar orden
                </Button>
              </div>
            </CardContent>
          </Card>
        </RoleGuard>
      )}

      {['approved', 'in_progress', 'planned'].includes(order.status) && (
        <RoleGuard permission="orders:complete">
          <CompletionPanel onSubmit={complete} />
        </RoleGuard>
      )}

      <ExplanationFooter
        what="Una orden de mantenimiento con su contexto completo: activo, técnico asignado, predicción que la originó, repuestos, coste de parada y quién la aprobó."
        how="El estado indica por dónde va el ciclo: planned (propuesta) → pending_approval (espera HITL) → approved → in_progress → completed, con la salida lateral cancelled si se rechaza. La parada estimada es lo que dispara el HITL cuando supera las 4 h."
        decision={
          order.status === 'pending_approval'
            ? 'Supervisor o planificador: aprobarla para que el técnico pueda ejecutarla, o rechazarla si no hay repuestos, ventana de parada o justificación suficiente.'
            : order.status === 'cancelled'
              ? 'Sin acción sobre esta orden: volver a la predicción de origen para corregir lo que motivó el rechazo antes de replanificar.'
              : order.status === 'completed'
                ? 'Sin acción: la orden ya está cerrada; revisar la predicción de origen si vuelve a repetirse.'
                : 'Técnico: ejecutar los pasos, marcarlos en el checklist y completar la orden al terminar.'
        }
      />
    </div>
  );
}
