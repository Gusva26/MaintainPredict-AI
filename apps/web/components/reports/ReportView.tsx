'use client';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExplanationFooter } from '@/components/ExplanationFooter';
import type { Equipment, Paginated, WeeklyReport } from '@/lib/api/types';

type Technician = { userId: number; fullName: string; email: string; openOrders: number };

/**
 * Informe semanal.
 *
 * Los filtros de equipo y técnico (H.1) van en la misma URL que consume la API, así que la
 * tabla que se ve en pantalla y el PDF/Excel/Word que se descargan cuentan **exactamente lo
 * mismo**. Los botones de descarga reutilizan la query ya construida.
 */
export function ReportView() {
  const [equipmentId, setEquipmentId] = useState('');
  const [technicianId, setTechnicianId] = useState('');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (equipmentId) p.set('equipmentId', equipmentId);
    if (technicianId) p.set('technicianId', technicianId);
    return p.toString();
  }, [equipmentId, technicianId]);

  const { data, isLoading } = useSWR<{ data: WeeklyReport }>(
    `/api/reports/weekly${query ? `?${query}` : ''}`, fetcher,
  );
  const { data: eqs } = useSWR<{ data: Paginated<Equipment> }>('/api/equipment?pageSize=100', fetcher);
  const { data: tecs } = useSWR<{ data: { items: Technician[] } }>('/api/technicians', fetcher);

  const r = data?.data;
  if (isLoading || !r) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const filtrado = r.filters.equipmentId != null || r.filters.technicianId != null;
  const download = (format: string) => `/api/reports/weekly?${query ? `${query}&` : ''}format=${format}`;

  return (
    <div className="space-y-4">
      {/* Filtros (H.1) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Filtros del informe</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Equipo
            <select
              className="h-9 rounded-md border border-input bg-background px-2"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
            >
              <option value="">Todos</option>
              {(eqs?.data.items ?? []).map((e) => (
                <option key={e.equipmentId} value={e.equipmentId}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Técnico
            <select
              className="h-9 rounded-md border border-input bg-background px-2"
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
            >
              <option value="">Todos</option>
              {(tecs?.data.items ?? []).map((t) => (
                <option key={t.userId} value={t.userId}>{t.fullName}</option>
              ))}
            </select>
          </label>
          {filtrado && (
            <Button variant="ghost" size="sm" onClick={() => { setEquipmentId(''); setTechnicianId(''); }}>
              Quitar filtros
            </Button>
          )}
          <span className="text-muted-foreground">
            {r.counts.ordersTotal} órdenes y {r.counts.predictionsTotal} predicciones en la ventana
            {filtrado ? ' (filtrado)' : ''}
          </span>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm"><a href={download('pdf')} download>Descargar PDF</a></Button>
        <Button asChild variant="outline" size="sm"><a href={download('xlsx')} download>Descargar Excel</a></Button>
        <Button asChild variant="outline" size="sm"><a href={download('docx')} download>Descargar Word</a></Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Órdenes por estado ({new Date(r.window.start).toLocaleDateString('es-ES')} → {new Date(r.window.end).toLocaleDateString('es-ES')})</CardTitle></CardHeader>
        <CardContent>
          {r.ordersByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin órdenes en la ventana con estos filtros.</p>
          ) : (
            <ul className="divide-y text-sm">
              {r.ordersByStatus.map((o) => (
                <li key={o.status} className="flex justify-between py-1"><span>{o.status}</span><span className="font-medium">{o.n}</span></li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Top equipos en riesgo</CardTitle></CardHeader>
        <CardContent>
          {r.topPredictions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin predicciones en la ventana con estos filtros.</p>
          ) : (
            <ul className="divide-y text-sm">
              {r.topPredictions.map((p) => (
                <li key={p.equipmentId} className="flex justify-between py-1">
                  <span>{p.name} ({p.criticality})</span>
                  <span className="font-medium tabular-nums">max {(p.maxProb * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Métricas del modelo</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {r.modelMetrics.map((m) => (
              <li key={m.metric} className="flex justify-between py-1"><span>{m.metric}</span><span className="font-medium tabular-nums">{m.value}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Las métricas del modelo y los KPIs son de planta: no se filtran por equipo ni técnico.
          </p>
        </CardContent>
      </Card>

      <ExplanationFooter
        what="Reporte semanal con órdenes por estado, top equipos en riesgo y métricas del modelo."
        how="Se puede acotar a un equipo y/o un técnico; los filtros afectan a órdenes y predicciones (los KPIs son globales). Descargar el PDF/Excel/Word usa exactamente los mismos filtros."
        decision="Descargar el informe para gestión; escalar si la precisión cae por debajo del objetivo o si un equipo concentra el riesgo."
      />
    </div>
  );
}
