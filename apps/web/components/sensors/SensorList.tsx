'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, apiPost } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationBar } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { toast } from 'sonner';
import type { Paginated, Reading, Sensor } from '@/lib/api/types';

const SENSOR_STATUS = ['active', 'inactive', 'maintenance'] as const;

const statusVariant = (s: string) =>
  s === 'active' ? 'success' : s === 'maintenance' ? 'warning' : 'outline';

const qualityVariant = (q: string) =>
  q === 'good' ? 'success' : q === 'suspect' ? 'warning' : 'destructive';

/** Últimas lecturas de un sensor; solo se pide al desplegar la fila. */
function SensorReadings({ sensorId }: { sensorId: number }) {
  const { data, isLoading } = useSWR<{ data: { sensor: Sensor; lastReadings: Reading[] } }>(
    `/api/sensors/${sensorId}`,
    fetcher,
  );
  if (isLoading) return <div className="p-2 text-xs text-muted-foreground">Cargando lecturas…</div>;
  const readings = data?.data?.lastReadings ?? [];
  if (readings.length === 0) {
    return <div className="p-2 text-xs text-muted-foreground">Sin lecturas registradas para este sensor.</div>;
  }
  return (
    <div className="max-h-64 overflow-auto p-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Fecha</TableHead>
            <TableHead className="text-xs">Valor</TableHead>
            <TableHead className="text-xs">Calidad</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {readings.map((r) => (
            <TableRow key={r.readingId}>
              <TableCell className="text-xs">{new Date(r.recordedAt).toLocaleString('es-ES')}</TableCell>
              <TableCell className="text-xs tabular-nums">{r.value}</TableCell>
              <TableCell><Badge variant={qualityVariant(r.quality)}>{r.quality}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SensorList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (equipmentId) params.set('equipment_id', equipmentId);

  const { data, isLoading, mutate } = useSWR<{ data: Paginated<Sensor> }>(
    `/api/sensors?${params}`,
    fetcher,
    { keepPreviousData: true },
  );
  const items = data?.data?.items ?? [];
  const meta = data?.data?.meta;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            Sensores
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Buscar por tipo"
                placeholder="Tipo (vibración, temperatura…)"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                className="h-8 w-52"
              />
              <Select value={status || 'todos'} onValueChange={(v) => { setStatus(v === 'todos' ? '' : v); setPage(1); }}>
                <SelectTrigger className="h-8 w-40 text-sm" aria-label="Filtrar por estado">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  {SENSOR_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                aria-label="Filtrar por equipo"
                placeholder="ID de equipo"
                inputMode="numeric"
                value={equipmentId}
                onChange={(e) => { setEquipmentId(e.target.value.replace(/\D/g, '')); setPage(1); }}
                className="h-8 w-28"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Umbral mín.</TableHead>
                <TableHead>Umbral máx.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No hay sensores con esos filtros.</TableCell></TableRow>
              )}
              {items.map((s) => (
                <TableRow key={s.sensorId}>
                  <TableCell className="text-xs tabular-nums">#{s.sensorId}</TableCell>
                  <TableCell className="text-xs">
                    {s.equipment ? (
                      <Link href={`/equipment/${s.equipment.equipmentId}`} className="hover:underline">
                        {s.equipment.name}
                      </Link>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{s.type}</TableCell>
                  <TableCell className="text-xs">{s.unit ?? '—'}</TableCell>
                  <TableCell className="text-xs tabular-nums">{s.minThreshold ?? '—'}</TableCell>
                  <TableCell className="text-xs tabular-nums">{s.maxThreshold ?? '—'}</TableCell>
                  <TableCell><Badge variant={statusVariant(s.status)}>{s.status}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setOpen(open === s.sensorId ? null : s.sensorId)}>
                      {open === s.sensorId ? 'Ocultar' : 'Ver lecturas'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {open !== null && (
                <TableRow>
                  <TableCell colSpan={8} className="bg-muted/30">
                    <SensorReadings sensorId={open} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {meta && (
            <PaginationBar page={meta.page} totalPages={meta.totalPages} total={meta.total} label="sensores" onPage={setPage} />
          )}
        </CardContent>
      </Card>

      <RoleGuard permission="equipment:write">
        <NewSensorForm onCreated={() => { setPage(1); mutate(); }} />
      </RoleGuard>
    </div>
  );
}

function NewSensorForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [equipmentId, setEquipmentId] = useState('');
  const [type, setType] = useState('');
  const [unit, setUnit] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [status, setStatus] = useState<string>('active');
  const [saving, setSaving] = useState(false);

  const ready = equipmentId !== '' && type.trim().length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost('/api/sensors', {
        equipment_id: Number(equipmentId),
        type: type.trim(),
        unit: unit.trim() || undefined,
        status,
        min_threshold: min === '' ? undefined : Number(min),
        max_threshold: max === '' ? undefined : Number(max),
      });
      toast.success('Sensor creado');
      setEquipmentId(''); setType(''); setUnit(''); setMin(''); setMax(''); setStatus('active');
      setOpen(false);
      onCreated();
    } catch (err: any) {
      toast.error('No se pudo crear el sensor', { description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Nuevo sensor</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alta de sensor</DialogTitle>
          <DialogDescription>
            El sensor queda vinculado al equipo indicado. Los umbrales definen cuándo una lectura
            deja de considerarse normal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">ID de equipo</span>
            <Input inputMode="numeric" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value.replace(/\D/g, ''))} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Tipo</span>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="vibration" required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Unidad</span>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mm/s" />
          </label>
          <div className="space-y-1">
            <span className="text-xs font-medium">Estado</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Estado del nuevo sensor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENSOR_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-medium">Umbral mínimo</span>
            <Input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Umbral máximo</span>
            <Input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!ready || saving}>{saving ? 'Guardando…' : 'Crear sensor'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
