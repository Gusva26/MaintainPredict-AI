import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { syncModelMetrics } from '../lib/observability/metrics';
import { syncBusinessKpis } from '../lib/observability/kpis';
import { detectFalsePositives } from '../lib/observability/false-positives';
import { scanDirtyData } from '../lib/observability/dirty-data';

describe('Observabilidad', () => {
  it('syncModelMetrics devuelve valores coherentes', async () => {
    const m = await syncModelMetrics(7);
    expect(m.precision).toBeGreaterThanOrEqual(0);
    expect(m.precision).toBeLessThanOrEqual(1);
    expect(m.falsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(m.falsePositiveRate).toBeLessThanOrEqual(1);
    expect(m.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('syncBusinessKpis devuelve KPIs no negativos', async () => {
    const k = await syncBusinessKpis(30);
    expect(k.downtimeAvoidedH).toBeGreaterThanOrEqual(0);
    expect(k.costSavingsEur).toBeGreaterThanOrEqual(0);
    expect(k.availability).toBeGreaterThanOrEqual(0);
    expect(k.availability).toBeLessThanOrEqual(1);
  });

  it('detectFalsePositives calcula tasa correctamente', async () => {
    const fp = await detectFalsePositives(7);
    expect(fp.falsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(fp.falsePositiveRate).toBeLessThanOrEqual(1);
    expect(Array.isArray(fp.examples)).toBe(true);
  });

  it('scanDirtyData devuelve reporte estructurado', async () => {
    const d = await scanDirtyData(24, 3);
    expect(d.scanned).toBeGreaterThanOrEqual(0);
    expect(d.flaggedTotal).toBe(d.flaggedByRange + d.flaggedByOutlier + d.flaggedByIqr);
    expect(Array.isArray(d.details)).toBe(true);
  });

  it('scanDirtyData cuenta aparte las lecturas ya marcadas por el ingesta (H.6)', async () => {
    const d = await scanDirtyData(24, 3);
    expect(d.flaggedByQuality).toBeGreaterThanOrEqual(0);
    for (const det of d.details) {
      expect(['range_high', 'range_low', 'outlier_z', 'outlier_iqr']).toContain(det.reason);
    }
  });

  it('detectFalsePositives respeta el umbral explícito (H.7)', async () => {
    const low = await detectFalsePositives(30, 0.5);
    const high = await detectFalsePositives(30, 0.95);
    expect(low.threshold).toBe(0.5);
    expect(high.threshold).toBe(0.95);
    // Un umbral más alto no puede dejar más predicciones en alerta.
    expect(high.highRiskPredictions).toBeLessThanOrEqual(low.highRiskPredictions);
  });

  it('syncModelMetrics es idempotente dentro de la misma hora (H.5)', async () => {
    const countRows = async () => {
      const rows = await db.execute(sql`SELECT count(*)::int AS n FROM model_metrics`);
      return (rows as unknown as { n: number }[])[0].n;
    };
    await syncModelMetrics(3);
    const afterFirst = await countRows();
    await syncModelMetrics(3);
    const afterSecond = await countRows();
    expect(afterSecond).toBe(afterFirst);
  });
});
