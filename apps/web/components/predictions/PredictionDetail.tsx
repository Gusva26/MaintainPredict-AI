'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, apiPost } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProbabilityGauge } from './ProbabilityGauge';
import { ComponentView } from './ComponentView';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ExplanationFooter } from '@/components/ExplanationFooter';
import { orderStatusVariant, orderPriorityVariant } from '@/lib/ui/variants';
import { toast } from 'sonner';
import type { PredictionDetailPayload } from '@/lib/api/types';

type WinSignal = { type: string; value: number; min: number; max: number; unit?: string };

/** Barra con el peso que el modelo da a cada señal (lo que la API llama `top_features`). */
function FeatureBars({ features }: { features: { feature: string; value: number }[] }) {
  const max = Math.max(...features.map((f) => Math.abs(f.value)), 0.001);
  return (
    <ul className="space-y-2">
      {[...features]
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .map((f) => (
          <li key={f.feature}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium">{f.feature}</span>
              <span className="tabular-nums text-muted-foreground">{f.value.toFixed(3)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${(Math.abs(f.value) / max) * 100}%` }} />
            </div>
          </li>
        ))}
    </ul>
  );
}

/** Lectura frente a sus umbrales: deja ver de un vistazo lo cerca que está del máximo. */
function SignalRow({ signal }: { signal: WinSignal }) {
  const span = Math.max(signal.max - signal.min, 0.001);
  const ratio = Math.max(0, Math.min(1, (signal.value - signal.min) / span));
  const tone = ratio > 0.7 ? 'bg-amber-500' : ratio > 0.4 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span>{signal.type}</span>
        <span className="tabular-nums">
          <span className="font-medium">{signal.value}{signal.unit ?? ''}</span>
          <span className="text-muted-foreground"> / {signal.max}{signal.unit ?? ''}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function PredictionDetail({ id }: { id: number }) {
  const { data, isLoading, error, mutate } = useSWR<{ data: PredictionDetailPayload }>(
    `/api/predictions/${id}`,
    fetcher,
  );
  const [planning, setPlanning] = useState(false);

  async function autoPlan() {
    setPlanning(true);
    try {
      const res = await apiPost<{ order_id: number; requires_hitl: boolean }>('/api/orders/auto-plan', {
        prediction_id: id,
      });
      toast.success(`Orden #${res.data.order_id} creada`, {
        description: res.data.requires_hitl ? 'Requiere aprobación HITL.' : 'Asignada al técnico.',
      });
      mutate();
    } catch (e: any) {
      toast.error('No se pudo planificar', { description: e.message });
    } finally {
      setPlanning(false);
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (error || !data?.data) {
    return (
      <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
        No se ha podido cargar la predicción #{id}
        {error?.message ? `: ${error.message}` : '.'}
      </div>
    );
  }

  const { prediction, equipment, orders, hasOrder } = data.data;
  const features = prediction.features;
  const topFeatures = features?.top_features ?? [];
  const signals = features?.inputs ?? [];
  const ragSources = features?.rag_sources ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Predicción #{prediction.predictionId}
              {equipment && (
                <>
                  {' · '}
                  <Link href={`/equipment/${equipment.equipmentId}`} className="hover:underline">
                    {equipment.name}
                  </Link>
                </>
              )}
            </span>
            <span className="flex items-center gap-2">
              {prediction.alert && <Badge variant="destructive">alerta</Badge>}
              <Badge variant="secondary">{prediction.modelVersion ?? 'modelo desconocido'}</Badge>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Probabilidad de falla</div>
            <ProbabilityGauge value={prediction.failureProbability} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Componente</div>
            <div className="font-medium">{prediction.component ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Ventana</div>
            <div className="font-medium">{prediction.windowDays ?? '—'} días</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Fecha</div>
            <div className="font-medium">{new Date(prediction.createdAt).toLocaleString('es-ES')}</div>
          </div>
          {equipment && (
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">Ubicación y criticidad</div>
              <div className="font-medium">
                {equipment.location ?? '—'} · {equipment.criticality}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ComponentView
        component={prediction.component ?? 'unknown'}
        explanation={prediction.explanation}
        features={features as Record<string, unknown> | null}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Peso de cada señal</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topFeatures.length === 0 ? (
              <p className="text-muted-foreground">
                El modelo no devolvió pesos por señal para esta predicción.
              </p>
            ) : (
              <>
                <FeatureBars features={topFeatures} />
                <p className="text-xs text-muted-foreground">
                  Cuanto mayor es la barra, más ha pesado esa señal en la probabilidad.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Lecturas que entraron al modelo</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {signals.length === 0 ? (
              <p className="text-muted-foreground">No se registraron lecturas para esta predicción.</p>
            ) : (
              signals.map((s) => <SignalRow key={s.type} signal={s} />)
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Documentación consultada (RAG)</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {ragSources.length === 0 ? (
            <p className="text-muted-foreground">No se recuperó documentación para esta predicción.</p>
          ) : (
            <ul className="space-y-1">
              {ragSources.map((d) => (
                <li key={d.doc_id} className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{d.title}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    similitud {d.similarity.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Órdenes derivadas
            {!hasOrder && (
              <RoleGuard permission="orders:create">
                <Button size="sm" onClick={autoPlan} disabled={planning}>
                  {planning ? 'Planificando…' : 'Generar orden (auto-plan)'}
                </Button>
              </RoleGuard>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay ninguna orden de mantenimiento para esta predicción.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Programada</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Parada</TableHead>
                  <TableHead>HITL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.orderId}>
                    <TableCell>
                      <Link href={`/orders/${o.orderId}`} className="font-medium hover:underline">
                        #{o.orderId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.scheduledDate ? new Date(o.scheduledDate).toLocaleString('es-ES') : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{o.technician?.fullName ?? '—'}</TableCell>
                    <TableCell><Badge variant={orderPriorityVariant(o.priority)}>{o.priority}</Badge></TableCell>
                    <TableCell><Badge variant={orderStatusVariant(o.status)}>{o.status}</Badge></TableCell>
                    <TableCell className="text-xs">{o.estimatedDowntimeH ?? '—'} h</TableCell>
                    <TableCell className="text-xs">{o.requiresHitl ? 'sí' : 'no'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExplanationFooter
        what="Una predicción concreta: probabilidad, componente, las señales que la explican (su peso y su valor) y las órdenes que se han derivado de ella."
        how="Las barras de 'Peso de cada señal' salen del modelo; las de 'Lecturas' comparan cada valor con su umbral. RAG son los documentos del manual que se citaron al explicarla."
        decision="Si hay alerta y todavía no hay orden, generar el auto-plan; si ya existe, revisar su estado y aprobarla si está pendiente de HITL."
      />
    </div>
  );
}
