import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermissionOrInternal } from '@/lib/auth/session';
import { syncModelMetrics, getLatestMetrics } from '@/lib/observability/metrics';
import { syncBusinessKpis, getKpiComparison } from '@/lib/observability/kpis';
import { scanDirtyData } from '@/lib/observability/dirty-data';
import { detectFalsePositives } from '@/lib/observability/false-positives';
import { ok, handleError } from '@/lib/http/response';

const Body = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
  includeDirtyScan: z.boolean().default(true),
}).partial();

export async function POST(req: NextRequest) {
  try {
    await requirePermissionOrInternal(req, 'reports:read');
    const body = Body.parse(await req.json().catch(() => ({})));
    const windowDays = body.windowDays ?? 7;

    const [model, kpis, dirty, fp] = await Promise.all([
      syncModelMetrics(windowDays),
      syncBusinessKpis(Math.max(windowDays, 30)),
      body.includeDirtyScan !== false ? scanDirtyData(24) : Promise.resolve(null),
      detectFalsePositives(windowDays),
    ]);

    return ok(
      {
        syncedAt: new Date().toISOString(),
        model,
        kpis,
        dirty,
        falsePositives: fp,
        comparison: await getKpiComparison(Math.max(windowDays, 30)),
        latestMetrics: await getLatestMetrics(),
      },
      {
        what: 'Sincronización de métricas del modelo, KPIs de negocio, datos sucios y falsos positivos.',
        how: 'Persiste snapshots en model_metrics y business_kpis para trazabilidad histórica.',
        decision: 'Revisar tendencias; si la precisión baja de 85% o los FP suben del 10%, reentrenar el modelo.',
      },
    );
  } catch (e) { return handleError(e); }
}
