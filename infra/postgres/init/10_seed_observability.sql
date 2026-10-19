-- =====================================================================
-- MaintainPredict AI — SEED OBSERVABILITY: métricas y KPIs (Fase B.1)
-- =====================================================================
-- Objetivo (spec §10): 150 métricas de modelo + 155 KPIs de negocio.
--
-- Cuentas: 30 días × 5 métricas = 150 · 31 días × 5 KPIs = 155. Los KPIs son diarios y
-- el último día queda abierto (30 días de histórico + hoy), que es lo que espera el panel
-- de observabilidad al comparar periodos.

BEGIN;

-- ─── Métricas del modelo: 30 días × 5 métricas = 150 ────────────────
INSERT INTO model_metrics (model_version, metric_name, metric_value, window_start, window_end, created_at)
SELECT
  'rf-v1.0.0',
  m.name,
  CASE m.name
    WHEN 'precision'       THEN round((0.80 + random()*0.10)::numeric, 4)
    WHEN 'recall'          THEN round((0.72 + random()*0.12)::numeric, 4)
    WHEN 'f1'              THEN round((0.76 + random()*0.10)::numeric, 4)
    WHEN 'auc'             THEN round((0.88 + random()*0.08)::numeric, 4)
    WHEN 'false_positives' THEN round((0.03 + random()*0.08)::numeric, 4)
  END,
  d.ts - interval '7 days',
  d.ts,
  d.ts
FROM (
  SELECT generate_series(date_trunc('day', now()) - interval '29 days',
                         date_trunc('day', now()), interval '1 day') AS ts
) d
CROSS JOIN (VALUES ('precision'), ('recall'), ('f1'), ('auc'), ('false_positives')) AS m(name)
WHERE NOT EXISTS (SELECT 1 FROM model_metrics);

-- ─── KPIs de negocio: 31 días × 5 KPIs = 155 ────────────────────────
-- Los mismos cinco nombres que escriben `syncBusinessKpis()` y `sp_recompute_kpis()`.
INSERT INTO business_kpis (kpi_name, kpi_value, period_start, period_end, created_at)
SELECT
  k.name,
  CASE k.name
    WHEN 'downtime_avoided_h'     THEN round((random()*10 + 8)::numeric, 2)
    WHEN 'cost_savings_eur'       THEN round((random()*4000 + 3000)::numeric, 2)
    WHEN 'availability'           THEN round((0.95 + random()*0.04)::numeric, 4)
    WHEN 'false_positives_auto'   THEN round((random()*3)::numeric, 0)
    WHEN 'false_positives_manual' THEN round((random()*2)::numeric, 0)
  END,
  d.ts,
  d.ts + interval '1 day',
  d.ts + interval '1 day'
FROM (
  SELECT generate_series(date_trunc('day', now()) - interval '30 days',
                         date_trunc('day', now()), interval '1 day') AS ts
) d
CROSS JOIN (VALUES
  ('downtime_avoided_h'), ('cost_savings_eur'), ('availability'),
  ('false_positives_auto'), ('false_positives_manual')
) AS k(name)
WHERE NOT EXISTS (SELECT 1 FROM business_kpis);

COMMIT;

-- ─── Verificación ────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Seed observability → métricas: %, KPIs: %',
    (SELECT count(*) FROM model_metrics),
    (SELECT count(*) FROM business_kpis);
END $$;
