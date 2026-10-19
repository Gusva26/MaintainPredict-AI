'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationBar } from '@/components/ui/pagination';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '@/lib/audit/catalog';
import type { AuditLogEntry, Paginated } from '@/lib/api/types';

/** Rangos temporales ofrecidos al usuario; se traducen al `since` que espera la API. */
const RANGOS = [
  { value: '', label: 'Todo el histórico' },
  { value: '24h', label: 'Últimas 24 h' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
];

function sinceOf(rango: string): string | undefined {
  if (!rango) return undefined;
  const horas = rango === '24h' ? 24 : rango === '7d' ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - horas * 3_600_000).toISOString();
}

const accionVariant = (accion: string) =>
  accion === 'login_failed'
    ? 'destructive'
    : accion.startsWith('create')
      ? 'success'
      : accion.startsWith('update') || accion === 'change_password'
        ? 'warning'
        : 'secondary';

const selectClass = 'h-8 rounded border border-input bg-background px-2 text-sm';

export function AuditTable() {
  const [modulo, setModulo] = useState('');
  const [accion, setAccion] = useState('');
  const [rango, setRango] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (modulo) params.set('module', modulo);
  if (accion) params.set('action', accion);
  const since = sinceOf(rango);
  if (since) params.set('since', since);

  const { data, isLoading } = useSWR<{ data: Paginated<AuditLogEntry> }>(
    `/api/audit?${params}`,
    fetcher,
    { keepPreviousData: true },
  );
  const items = data?.data?.items ?? [];
  const meta = data?.data?.meta;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          Bitácora de auditoría
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filtrar por módulo"
              value={modulo}
              onChange={(e) => { setModulo(e.target.value); setPage(1); }}
              className={selectClass}
            >
              <option value="">Todos los módulos</option>
              {AUDIT_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              aria-label="Filtrar por acción"
              value={accion}
              onChange={(e) => { setAccion(e.target.value); setPage(1); }}
              className={selectClass}
            >
              <option value="">Todas las acciones</option>
              {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              aria-label="Filtrar por fecha"
              value={rango}
              onChange={(e) => { setRango(e.target.value); setPage(1); }}
              className={selectClass}
            >
              {RANGOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">Cargando…</TableCell>
              </TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay registros que cumplan los filtros seleccionados.
                </TableCell>
              </TableRow>
            )}
            {items.map((e) => (
              <TableRow key={e.log.auditId}>
                <TableCell className="whitespace-nowrap text-xs">
                  {e.log.createdAt ? new Date(e.log.createdAt).toLocaleString('es-ES') : '—'}
                </TableCell>
                <TableCell className="text-xs">
                  {e.user ? (
                    <>
                      <div className="font-medium">{e.user.fullName}</div>
                      <div className="text-muted-foreground">{e.user.role}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">sistema</span>
                  )}
                </TableCell>
                <TableCell><Badge variant={accionVariant(e.log.action)}>{e.log.action}</Badge></TableCell>
                <TableCell className="text-xs">{e.log.module}</TableCell>
                <TableCell className="text-xs">
                  {e.log.entityType ? `${e.log.entityType} #${e.log.entityId ?? '—'}` : '—'}
                </TableCell>
                <TableCell className="text-xs">{e.log.ipAddress ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {meta && (
          <PaginationBar page={meta.page} totalPages={meta.totalPages} total={meta.total} label="auditoría" onPage={setPage} />
        )}
      </CardContent>
    </Card>
  );
}
