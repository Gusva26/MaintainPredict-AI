'use client';
import useSWR from 'swr';
import { fetcher } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SensorChart } from './SensorChart';
import { ExplanationFooter } from '@/components/ExplanationFooter';
import type { Equipment, Sensor, Reading, Prediction } from '@/lib/api/types';

type Payload = { equipment: Equipment; sensors: Sensor[]; lastReadings: Reading[]; lastPredictions: Prediction[] };

export function EquipmentDetail({ id }: { id: number }) {
  const { data, isLoading } = useSWR<{ data: Payload }>(`/api/equipment/${id}`, fetcher);
  if (isLoading || !data?.data) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  const { equipment, sensors, lastReadings, lastPredictions } = data.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {equipment.name} <Badge variant="secondary">#{equipment.equipmentId}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Tipo:</span> {equipment.type}</div>
          <div><span className="text-muted-foreground">Ubicación:</span> {equipment.location ?? '—'}</div>
          <div><span className="text-muted-foreground">Criticidad:</span> {equipment.criticality}</div>
          <div><span className="text-muted-foreground">Estado:</span> {equipment.status}</div>
          <div><span className="text-muted-foreground">Coste parada:</span> €{Number(equipment.downtimeCostEurH).toFixed(0)}/h</div>
          <div><span className="text-muted-foreground">Instalación:</span> {equipment.installationDate ?? '—'}</div>
        </CardContent>
      </Card>

      <SensorChart sensors={sensors} readings={lastReadings} />

      <Card>
        <CardHeader><CardTitle>Últimas predicciones</CardTitle></CardHeader>
        <CardContent>
          {lastPredictions.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sin predicciones registradas.</div>
          ) : (
            <ul className="divide-y">
              {lastPredictions.map((p) => (
                <li key={p.predictionId} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{p.component ?? 'unknown'}</div>
                    <div className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString('es-ES')}</div>
                  </div>
                  <Badge variant={p.failureProbability > 0.7 ? 'destructive' : 'secondary'}>
                    {(p.failureProbability * 100).toFixed(1)}%
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ExplanationFooter
        what="Detalle del equipo con sus sensores, últimas lecturas y predicciones."
        how="Cada serie del gráfico compara las lecturas con los min/max_threshold de su sensor, dibujados como líneas discontinuas del mismo color."
        decision="Si la última predicción supera 0.70, revisar la orden generada o crear una manualmente."
      />
    </div>
  );
}
