'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, Target, Activity, AlertTriangle } from 'lucide-react';
import type { DashboardKpis } from '@/lib/api/types';

/**
 * Tarjetas del panel.
 *
 * Antes leían `/api/reports/weekly` entero (órdenes, predicciones y métricas de 7 días)
 * solo para pintar cuatro números. Ahora usan `/api/dashboard/kpis`, que devuelve
 * únicamente los KPI, los contadores y los objetivos del proyecto.
 */
export function KPICards() {
  const { data, isLoading } = useSWR<{ data: DashboardKpis }>(
    '/api/dashboard/kpis',
    fetcher,
    { refreshInterval: 60_000 },
  );
  const kpi = data?.data;

  const business = kpi?.businessKpis ?? {};
  const metrics = kpi?.modelMetrics ?? {};
  const targets = kpi?.targets;

  const precision = metrics.precision ?? 0;
  const availability = business.availability ?? 0;

  const cards = [
    {
      title: 'Paradas evitadas',
      value: `${(business.downtime_avoided_h ?? 0).toFixed(0)} h`,
      target: targets ? `objetivo −${Math.round(targets.downtime_reduction * 100)}%` : 'objetivo −60%',
      icon: TrendingDown,
      variant: 'success' as const,
    },
    {
      title: 'Ahorro estimado',
      value: `€${(business.cost_savings_eur ?? 0).toLocaleString('es-ES')}`,
      target: targets ? `objetivo −${Math.round(targets.cost_reduction * 100)}%` : 'objetivo −30%',
      icon: TrendingDown,
      variant: 'success' as const,
    },
    {
      title: 'Precisión del modelo',
      value: `${(precision * 100).toFixed(1)}%`,
      target: targets ? `objetivo ${Math.round(targets.precision * 100)}%` : 'objetivo 85%',
      icon: Target,
      variant: (!targets || precision >= targets.precision) ? 'success' as const : 'warning' as const,
    },
    {
      title: 'Disponibilidad',
      value: `${(availability * 100).toFixed(1)}%`,
      target: targets ? `objetivo ${(targets.availability * 100).toFixed(1)}%` : 'planta global',
      icon: Activity,
      variant: (!targets || availability >= targets.availability) ? 'success' as const : 'warning' as const,
    },
  ];

  const contadores = [
    { label: 'Equipos caídos', value: kpi?.counts.equipmentDown, href: '/equipment', alerta: (kpi?.counts.equipmentDown ?? 0) > 0 },
    { label: 'Alertas 7 días', value: kpi?.counts.alertsLast7d, href: '/predictions', alerta: false },
    { label: 'Órdenes abiertas', value: kpi?.counts.ordersOpen, href: '/orders', alerta: false },
    { label: 'Pendientes de aprobar', value: kpi?.counts.ordersPendingApproval, href: '/orders', alerta: (kpi?.counts.ordersPendingApproval ?? 0) > 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
                <Icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? '…' : c.value}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={c.variant}>{c.target}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {contadores.map((c) => (
          <Link key={c.label} href={c.href}
            className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent">
            <span className="flex items-center gap-2 text-muted-foreground">
              {c.alerta && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              {c.label}
            </span>
            <span className="font-semibold tabular-nums">{isLoading ? '…' : c.value ?? 0}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
