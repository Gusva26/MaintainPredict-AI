import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { getLatestMetrics } from '@/lib/observability/metrics';
import { getKpiComparison } from '@/lib/observability/kpis';
import { detectFalsePositives } from '@/lib/observability/false-positives';
import { env } from '@/lib/env';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { ok, handleError } from '@/lib/http/response';

const Query = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(30),
  // Umbral alternativo para simular el impacto de subirlo/bajarlo (H.7), p. ej. 0.80.
  fpThreshold: z.coerce.number().min(0).max(1).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requirePermission('reports:read');
    const url = new URL(req.url);
    const { windowDays, fpThreshold } = Query.parse(Object.fromEntries(url.searchParams));

    const [latest, comparison, fp] = await Promise.all([
      getLatestMetrics(),
      getKpiComparison(windowDays),
      detectFalsePositives(7),
    ]);

    // Simulación con otro umbral (H.7): se calcula aparte para no tocar la configuración.
    const simulated = fpThreshold != null && fpThreshold !== env.FALSE_POSITIVE_THRESHOLD
      ? await detectFalsePositives(7, fpThreshold)
      : null;

    // Serie temporal de precisión (últimos 30 snapshots)
    const precisionSeries = await db.execute(sql`
      SELECT window_end, metric_value::numeric AS value
      FROM model_metrics
      WHERE metric_name = 'precision'
      ORDER BY created_at DESC
      LIMIT 30
    `) as unknown as { window_end: string; value: string }[];

    // Serie de disponibilidad
    const availabilitySeries = await db.execute(sql`
      SELECT period_end, kpi_value::numeric AS value
      FROM business_kpis
      WHERE kpi_name = 'availability'
      ORDER BY created_at DESC
      LIMIT 30
    `) as unknown as { period_end: string; value: string }[];

    return ok(
      {
        windowDays,
        config: { falsePositiveThreshold: env.FALSE_POSITIVE_THRESHOLD },
        latestMetrics: latest,
        kpiComparison: comparison,
        falsePositives: fp,
        falsePositivesSimulated: simulated,
        series: {
          precision: precisionSeries.reverse().map((r) => ({
            t: r.window_end, value: Number(r.value),
          })),
          availability: availabilitySeries.reverse().map((r) => ({
            t: r.period_end, value: Number(r.value),
          })),
        },
      },
      {
        what: 'Métricas del modelo, KPIs y falsos positivos en la ventana seleccionada.',
        how: `Compara con objetivos: precisión ≥ 85%, paradas −60%, costos −30%. Los falsos positivos se cuentan con el umbral configurado (${env.FALSE_POSITIVE_THRESHOLD}); con fpThreshold se simula otro valor.`,
        decision: 'Si algún indicador sale del objetivo, revisar datos sucios, reentrenar modelo o ajustar el umbral de alerta.',
      },
    );
  } catch (e) { return handleError(e); }
}
