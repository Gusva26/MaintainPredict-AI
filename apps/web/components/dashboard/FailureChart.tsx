'use client';
import useSWR from 'swr';
import { fetcher } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Paginated, Prediction } from '@/lib/api/types';

export function FailureChart() {
  const { data, isLoading } = useSWR<{ data: Paginated<Prediction> }>('/api/predictions?pageSize=200', fetcher, { refreshInterval: 60_000 });
  const items = data?.data?.items ?? [];

  const buckets = [
    { range: '0–30%', min: 0, max: 0.3 },
    { range: '30–50%', min: 0.3, max: 0.5 },
    { range: '50–70%', min: 0.5, max: 0.7 },
    { range: '70–90%', min: 0.7, max: 0.9 },
    { range: '90–100%', min: 0.9, max: 1.01 },
  ];
  const chartData = buckets.map((b) => ({
    range: b.range,
    count: items.filter((i) => i.failureProbability >= b.min && i.failureProbability < b.max).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución de probabilidad de falla</CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        {isLoading ? <div className="text-sm text-muted-foreground">Cargando…</div> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="range" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
