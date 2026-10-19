'use client';
import useSWR from 'swr';
import { fetcher } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { IntegrationsHealth } from '@/lib/api/types';

const NOMBRES: Record<string, string> = {
  erp: 'ERP (repuestos y catálogo)',
  scada: 'SCADA (lecturas en vivo)',
  sms: 'SMS (avisos al técnico)',
  email: 'Email (reportes y notificaciones)',
};

export function IntegrationsView() {
  const { data, isLoading, error, mutate, isValidating } = useSWR<{ data: IntegrationsHealth }>(
    '/api/integrations/health',
    fetcher,
    { refreshInterval: 60_000 },
  );

  if (isLoading) return <div className="text-sm text-muted-foreground">Comprobando integraciones…</div>;
  if (error || !data?.data) {
    return (
      <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
        No se ha podido consultar el estado de las integraciones{error?.message ? `: ${error.message}` : '.'}
      </div>
    );
  }

  const { mode, summary, adapters } = data.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              Estado de las integraciones
              <Badge variant={mode === 'real' ? 'success' : 'warning'}>
                modo {mode}
              </Badge>
            </span>
            <Button size="sm" variant="outline" onClick={() => mutate()} disabled={isValidating}>
              {isValidating ? 'Comprobando…' : 'Volver a comprobar'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Adaptadores correctos</div>
            <div className="font-medium">
              {summary.ok} de {summary.total}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Con fallo</div>
            <div className="font-medium">
              {summary.failed.length === 0 ? 'ninguno' : summary.failed.join(', ')}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Latencia máxima</div>
            <div className="font-medium">{summary.slowestMs} ms</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integración</TableHead>
                <TableHead>Adaptador</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Latencia</TableHead>
                <TableHead>Comprobado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adapters.map((a) => (
                <TableRow key={a.kind}>
                  <TableCell className="text-sm font-medium">{NOMBRES[a.kind] ?? a.kind}</TableCell>
                  <TableCell className="text-xs">{a.adapter}</TableCell>
                  <TableCell>
                    <Badge variant={a.mode === 'real' ? 'success' : 'secondary'}>{a.mode}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.ok ? 'success' : 'destructive'}>{a.ok ? 'correcto' : 'con fallo'}</Badge>
                    {a.detail && <div className="mt-1 text-xs text-muted-foreground">{a.detail}</div>}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{a.latencyMs} ms</TableCell>
                  <TableCell className="text-xs">{new Date(a.checkedAt).toLocaleTimeString('es-ES')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
