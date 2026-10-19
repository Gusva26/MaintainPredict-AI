'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, apiPost } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { orderPriorityVariant, orderStatusVariant } from '@/lib/ui/variants';
import { toast } from 'sonner';
import type { Paginated, Order } from '@/lib/api/types';

export function OrderList() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) params.set('status', status);
  const { data, isLoading, mutate } = useSWR<{ data: Paginated<Order> }>(`/api/orders?${params}`, fetcher, { keepPreviousData: true, refreshInterval: 30_000 });
  const items = data?.data?.items ?? [];
  const meta = data?.data?.meta;

  async function approve(id: number) {
    // Reenvía el ?resume= que pueda venir del email HITL para reanudar WF-02.
    const resume = new URLSearchParams(window.location.search).get('resume');
    const qs = resume ? `?resume=${encodeURIComponent(resume)}` : '';
    try {
      await apiPost(`/api/orders/${id}/approve${qs}`);
      toast.success(`Orden #${id} aprobada`);
      mutate();
    } catch (e: any) { toast.error('Error al aprobar', { description: e.message }); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Órdenes
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-8 rounded border border-input bg-background px-2 text-sm">
            <option value="">Todos los estados</option>
            <option value="pending_approval">pending_approval</option>
            <option value="approved">approved</option>
            <option value="planned">planned</option>
            <option value="in_progress">in_progress</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Programada</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Parada</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>}
            {items.map((o) => (
              <TableRow key={o.orderId}>
                <TableCell><Link href={`/orders/${o.orderId}`} className="font-medium hover:underline">#{o.orderId}</Link></TableCell>
                <TableCell>{o.equipment?.name ?? `#${o.equipmentId}`}</TableCell>
                <TableCell className="text-xs">{o.scheduledDate ? new Date(o.scheduledDate).toLocaleString('es-ES') : '—'}</TableCell>
                <TableCell className="text-xs">{o.technician?.fullName ?? '—'}</TableCell>
                <TableCell><Badge variant={orderPriorityVariant(o.priority)}>{o.priority}</Badge></TableCell>
                <TableCell><Badge variant={orderStatusVariant(o.status)}>{o.status}</Badge></TableCell>
                <TableCell className="text-xs">{o.estimatedDowntimeH ?? '—'} h</TableCell>
                <TableCell className="text-right">
                  {o.status === 'pending_approval' && (
                    <RoleGuard permission="orders:approve">
                      <Button size="sm" onClick={() => approve(o.orderId)}>Aprobar</Button>
                    </RoleGuard>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {meta && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Página {meta.page} de {meta.totalPages} · {meta.total} órdenes</span>
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
