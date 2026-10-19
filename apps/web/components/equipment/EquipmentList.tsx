'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Paginated, Equipment } from '@/lib/api/types';

const criticalityVariant = (c: string) =>
  c === 'critical' ? 'destructive' : c === 'high' ? 'warning' : c === 'medium' ? 'secondary' : 'outline';

const statusVariant = (s: string) =>
  s === 'operational' ? 'success' : s === 'maintenance' ? 'warning' : s === 'down' ? 'destructive' : 'outline';

export function EquipmentList() {
  const [q, setQ] = useState('');
  const [criticality, setCriticality] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (q) params.set('q', q);
  if (criticality) params.set('criticality', criticality);
  if (status) params.set('status', status);

  const { data, isLoading } = useSWR<{ data: Paginated<Equipment> }>(`/api/equipment?${params}`, fetcher, { keepPreviousData: true });
  const items = data?.data?.items ?? [];
  const meta = data?.data?.meta;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipos</CardTitle>
        <div className="grid gap-2 pt-2 sm:grid-cols-4">
          <Input placeholder="Buscar por nombre…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <select value={criticality} onChange={(e) => { setCriticality(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Criticidad (todas)</option>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Estado (todos)</option>
            <option value="operational">operational</option>
            <option value="maintenance">maintenance</option>
            <option value="down">down</option>
            <option value="retired">retired</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Criticidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">EUR/h parada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow key="loading"><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow key="empty"><TableCell colSpan={7} className="text-center text-muted-foreground">Sin resultados</TableCell></TableRow>
            )}
            {items.map((e) => (
              <TableRow key={e.equipmentId}>
                <TableCell>#{e.equipmentId}</TableCell>
                <TableCell className="font-medium">
                  <Link href={`/equipment/${e.equipmentId}`} className="hover:underline">{e.name}</Link>
                </TableCell>
                <TableCell>{e.type}</TableCell>
                <TableCell>{e.location ?? '—'}</TableCell>
                <TableCell><Badge variant={criticalityVariant(e.criticality)}>{e.criticality}</Badge></TableCell>
                <TableCell><Badge variant={statusVariant(e.status)}>{e.status}</Badge></TableCell>
                <TableCell className="text-right">€{Number(e.downtimeCostEurH).toFixed(0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {meta && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Página {meta.page} de {meta.totalPages} · {meta.total} equipos</span>
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
