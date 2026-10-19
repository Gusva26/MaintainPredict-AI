'use client';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import type { Sensor, Reading } from '@/lib/api/types';

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed'];

export function SensorChart({ sensors, readings }: { sensors: Sensor[]; readings: Reading[] }) {
  const data = useMemo(() => {
    const byTime = new Map<string, Record<string, number>>();
    for (const r of readings) {
      const key = new Date(r.recordedAt).toISOString().slice(0, 16);
      const sensor = sensors.find((s) => s.sensorId === r.sensorId);
      if (!sensor) continue;
      const entry = byTime.get(key) ?? {};
      entry[`${sensor.type}#${sensor.sensorId}`] = Number(r.value);
      byTime.set(key, entry);
    }
    return Array.from(byTime.entries())
      .map(([t, vals]) => ({ t, ...vals }))
      .sort((a, b) => a.t.localeCompare(b.t));
  }, [readings, sensors]);

  const series = Array.from(new Set(sensors.map((s) => `${s.type}#${s.sensorId}`)));
  const colorOf = (name: string) => COLORS[series.indexOf(name) % COLORS.length];

  /**
   * Umbrales de cada sensor como líneas discontinuas del color de su serie.
   * Antes el pie prometía compararlos con el gráfico, pero no se dibujaban
   * (hallazgo H-K6). Solo se pintan los que el sensor tiene definidos.
   */
  const umbrales = sensors.flatMap((s) => {
    const key = `${s.type}#${s.sensorId}`;
    if (!series.includes(key)) return [];
    const color = colorOf(key);
    const lines = [];
    const min = s.minThreshold != null ? Number(s.minThreshold) : NaN;
    const max = s.maxThreshold != null ? Number(s.maxThreshold) : NaN;
    if (Number.isFinite(min)) {
      lines.push(
        <ReferenceLine key={`${key}-min`} y={min} stroke={color} strokeDasharray="4 4" strokeOpacity={0.7}
          label={{ value: `${s.type} mín`, fontSize: 10, fill: color, position: 'insideLeft' }} />,
      );
    }
    if (Number.isFinite(max)) {
      lines.push(
        <ReferenceLine key={`${key}-max`} y={max} stroke={color} strokeDasharray="4 4" strokeOpacity={0.7}
          label={{ value: `${s.type} máx`, fontSize: 10, fill: color, position: 'insideLeft' }} />,
      );
    }
    return lines;
  });

  return (
    <Card>
      <CardHeader><CardTitle>Lecturas de sensores</CardTitle></CardHeader>
      <CardContent className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="t" fontSize={11} hide={data.length > 40} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {umbrales}
            {series.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={1.5} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
