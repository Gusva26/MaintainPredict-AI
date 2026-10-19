'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, apiPost } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExplanationFooter } from '@/components/ExplanationFooter';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { toast } from 'sonner';

type FpReport = {
  windowDays: number; threshold: number; highRiskPredictions: number; truePositives: number;
  falsePositivesAuto: number; falsePositivesManual: number; falsePositiveRate: number;
  examples: { predictionId: number; equipmentId: number; probability: number; createdAt: string }[];
};

type Summary = {
  windowDays: number;
  config: { falsePositiveThreshold: number };
  latestMetrics: { metric: string; value: number; modelVersion: string; windowEnd: string }[];
  kpiComparison: {
    downtimeAvoidedH: number; costSavingsEur: number; availability: number;
    falsePositivesAuto: number; falsePositivesManual: number;
    targets: { modelPrecision: number; falsePositiveRateMax: number };
  };
  falsePositives: FpReport;
  falsePositivesSimulated: FpReport | null;
  series: {
    precision: { t: string; value: number }[];
    availability: { t: string; value: number }[];
  };
};

export function ObservabilityView() {
  const [days, setDays] = useState(30);
  // `null` = umbral configurado en el despliegue; un número = simulación (H.7).
  const [fpThreshold, setFpThreshold] = useState<number | null>(null);
  const query = `/api/observability/summary?windowDays=${days}${fpThreshold ? `&fpThreshold=${fpThreshold}` : ''}`;
  const { data, isLoading, mutate } = useSWR<{ data: Summary }>(query, fetcher, { refreshInterval: 60_000 });
  const s = data?.data;

  async function sync() {
    try {
      await apiPost('/api/observability/metrics/sync', { windowDays: 7, includeDirtyScan: true });
      toast.success('Métricas sincronizadas');
      mutate();
    } catch (e: any) { toast.error('Error al sincronizar', { description: e.message }); }
  }

  if (isLoading || !s) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const precision = s.latestMetrics.find((m) => m.metric === 'precision')?.value ?? 0;
  const recall = s.latestMetrics.find((m) => m.metric === 'recall')?.value ?? 0;
  const f1 = s.latestMetrics.find((m) => m.metric === 'f1')?.value ?? 0;
  const auc = s.latestMetrics.find((m) => m.metric === 'auc')?.value ?? 0;

  const precisionOk = precision >= s.kpiComparison.targets.modelPrecision;
  const fp = s.falsePositivesSimulated ?? s.falsePositives;
  const fpOk = fp.falsePositiveRate <= s.kpiComparison.targets.falsePositiveRateMax;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ventana:</span>
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>
              {d} días
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={sync}>Sincronizar ahora</Button>
      </div>

      {/* Tarjetas de estado del modelo */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Precisión" value={`${(precision * 100).toFixed(1)}%`} target="≥ 85%" ok={precisionOk} />
        <MetricCard label="Recall" value={`${(recall * 100).toFixed(1)}%`} target="—" ok={recall > 0.7} />
        <MetricCard label="F1" value={f1.toFixed(3)} target="—" ok={f1 > 0.75} />
        <MetricCard label="AUC" value={auc.toFixed(3)} target="—" ok={auc > 0.85} />
      </div>

      {/* Falsos positivos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Falsos positivos (riesgo 28)
            <Badge variant={fpOk ? 'success' : 'warning'}>
              {(fp.falsePositiveRate * 100).toFixed(1)}% · objetivo ≤ {(s.kpiComparison.targets.falsePositiveRateMax * 100).toFixed(0)}%
            </Badge>
            {s.falsePositivesSimulated && <Badge variant="outline">simulado a {fp.threshold.toFixed(2)}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Umbral de alerta (configurado: {s.config.falsePositiveThreshold.toFixed(2)}):
            </span>
            {[s.config.falsePositiveThreshold, 0.8, 0.9].map((t, i) => {
              const active = i === 0 ? fpThreshold === null : fpThreshold === t;
              return (
                <Button
                  key={t}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => setFpThreshold(i === 0 ? null : t)}
                >
                  {i === 0 ? `${t.toFixed(2)} (actual)` : `simular ${t.toFixed(2)}`}
                </Button>
              );
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-4 text-sm">
            <div><div className="text-muted-foreground text-xs">Predicciones ≥ {fp.threshold.toFixed(2)}</div><div className="text-lg font-semibold">{fp.highRiskPredictions}</div></div>
            <div><div className="text-muted-foreground text-xs">Verdaderos positivos</div><div className="text-lg font-semibold text-emerald-600">{fp.truePositives}</div></div>
            <div><div className="text-muted-foreground text-xs">FP automáticos</div><div className="text-lg font-semibold text-amber-600">{fp.falsePositivesAuto}</div></div>
            <div><div className="text-muted-foreground text-xs">FP manuales</div><div className="text-lg font-semibold text-amber-600">{fp.falsePositivesManual}</div></div>
          </div>
        </CardContent>
      </Card>

      {/* Series */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Precisión del modelo</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.series.precision.map((p) => ({ t: new Date(p.t).toLocaleDateString('es-ES'), v: Number((p.value * 100).toFixed(1)) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[50, 100]} fontSize={11} unit="%" />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Precisión']} />
                <ReferenceLine y={85} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'Objetivo 85%', fontSize: 11, fill: '#16a34a' }} />
                <Line type="monotone" dataKey="v" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Disponibilidad de planta</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.series.availability.map((p) => ({ t: new Date(p.t).toLocaleDateString('es-ES'), v: Number((p.value * 100).toFixed(1)) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[80, 100]} fontSize={11} unit="%" />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Disponibilidad']} />
                <Line type="monotone" dataKey="v" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <ExplanationFooter
        what="Métricas del modelo (precisión, recall, F1, AUC), KPIs de negocio y análisis de falsos positivos."
        how="La precisión debe mantenerse ≥ 85%; la tasa de FP ≤ 10%. Los FP se cuentan con el umbral configurado (FALSE_POSITIVE_THRESHOLD) y se puede simular otro umbral sin cambiar el despliegue."
        decision="Lanzar escaneo de datos sucios, marcar falsos positivos desde el cierre de órdenes, ajustar el umbral o reentrenar el modelo."
      />
    </div>
  );
}

function MetricCard({ label, value, target, ok }: { label: string; value: string; target: string; ok: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <Badge variant={ok ? 'success' : 'warning'} className="mt-1">{target}</Badge>
      </CardContent>
    </Card>
  );
}
