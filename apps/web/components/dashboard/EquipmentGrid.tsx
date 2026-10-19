'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Paginated, Equipment } from '@/lib/api/types';

const criticalityVariant = (c: string) =>
  c === 'critical' ? 'destructive' : c === 'high' ? 'warning' : c === 'medium' ? 'secondary' : 'outline';

export function EquipmentGrid() {
  const { data, isLoading } = useSWR<{ data: Paginated<Equipment> }>(
    '/api/equipment?pageSize=12&sort=criticality&order=desc',
    fetcher,
  );
  const items = data?.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipos críticos</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="text-sm text-muted-foreground">Cargando…</div> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((e) => (
              <li key={e.equipmentId}>
                <Link href={`/equipment/${e.equipmentId}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-accent">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{e.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{e.location ?? '—'}</div>
                  </div>
                  <Badge variant={criticalityVariant(e.criticality)}>{e.criticality}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
