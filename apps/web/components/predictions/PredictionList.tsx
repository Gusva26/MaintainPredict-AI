'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, apiPost } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProbabilityGauge } from './ProbabilityGauge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { toast } from 'sonner';
import type { Paginated, Prediction } from '@/lib/api/types';

export function PredictionList() {
  const [minProb, setMinProb] = useState(0);
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (minProb > 0) params.set('min_prob', String(minProb));
  const { data, isLoading, mutate } = useSWR<{ data: Paginated<Prediction> }>(`/api/predictions?${params}`, fetcher, { keepPreviousData: true, refreshInterval: 30_000 });
  const items = data?.data?.items ?? [];
  const meta = data?.data?.meta;

  async function autoPlan(predictionId: number) {
    try {
      const res = await apiPost<any>('/api/orders/auto-plan', { prediction_id: predictionId });
      toast.success(`Orden #${res.data.order_id} creada`, { description: res.data.requires_hitl ? 'Requiere aprobación HITL.' : 'Asignada al técnico.' });
      mutate();
    } catch (e: any) {
      toast.error('No se pudo planificar', { description: e.message });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Predicciones
          <div className="flex items-center gap-2 text-sm">
            <label className="text-muted-foreground">Umbral</label>
            <input type="range" min={0} max={1} step={0.05} value={minProb} onChange={(e) => { setMinProb(Number(e.target.value)); setPage(1); }} />
            <span className="w-10 text-right">{(minProb * 100).toFixed(0)}%</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Componente</TableHead>
              <TableHead>Probabilidad</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow key="loading"><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>}
            {items.map((p) => (
              <TableRow key={p.predictionId}>
                <TableCell>
                  <Link href={`/predictions/${p.predictionId}`} className="font-medium hover:underline">
                    #{p.predictionId}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">{p.equipment?.name ?? `#${p.equipmentId}`}</TableCell>
                <TableCell>{p.component ?? '—'}</TableCell>
                <TableCell><ProbabilityGauge value={p.failureProbability} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.modelVersion}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString('es-ES')}</TableCell>
                <TableCell className="text-right">
                  <RoleGuard permission="orders:create">
                    <Button size="sm" variant={p.alert ? 'default' : 'outline'} onClick={() => autoPlan(p.predictionId)}>
                      Auto-plan
                    </Button>
                  </RoleGuard>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {meta && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Página {meta.page} de {meta.totalPages} · {meta.total} predicciones</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-50">Anterior</button>
              <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
