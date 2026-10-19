-- =====================================================================
-- MaintainPredict AI — SEED READINGS: 30 días de telemetría (Fase B.1/B.2)
-- =====================================================================
-- Patrón de cada señal: un valor "sano" por tipo de sensor + ruido + una tendencia al
-- alza en ~20 % de los equipos (los que tienen id múltiplo de 5) para simular falla
-- incipiente. La calidad se deriva del rango del sensor (igual que `fn_classify_reading`)
-- y se ensucia un 2,5 % a propósito (`suspect`/`bad`) para que la app tenga datos sucios
-- reales que detectar.
--
-- VOLUMEN (variable, como pide B.1). El objetivo de la spec es ~600.000 lecturas, pero
-- su propio literal (30 días cada 6 h sobre los ~1.400 sensores activos) da ~168.000. El
-- intervalo es, por tanto, la variable que se ajusta para cuadrar con la tabla de
-- verificación de la spec:
--
--   30 días × 24 × 60 / mp_step_minutes muestras × ~1.400 sensores activos
--
-- Con los valores por defecto (30 días, 100 min) salen ~600.000. Se pueden sobreescribir
-- sin tocar el fichero, que es lo que hace CI para no sembrar 600 k filas en cada push:
--
--   psql -v mp_days=7 -v mp_step_minutes=720 -f 07_seed_readings.sql   (seed rápido)
--
-- Se inserta con un único INSERT ... SELECT (nada de bucles fila a fila): así 600 k filas
-- entran en segundos y no en minutos (B.2).
-- Valores por defecto solo si no vienen de la línea de comandos (`-v mp_days=…`).
\if :{?mp_days}
\else
\set mp_days 30
\endif
\if :{?mp_step_minutes}
\else
\set mp_step_minutes 100
\endif

INSERT INTO readings (sensor_id, value, quality, recorded_at)
SELECT
  sen.sensor_id,
  x.value,
  CASE
    WHEN random() < 0.005 THEN 'bad'
    WHEN random() < 0.02  THEN 'suspect'
    WHEN (sen.min_threshold IS NOT NULL AND x.value < sen.min_threshold)
      OR (sen.max_threshold IS NOT NULL AND x.value > sen.max_threshold) THEN 'suspect'
    ELSE 'good'
  END,
  now() - ((cfg.days * 24 * 60 / cfg.step_minutes - st.step)
             * make_interval(mins => cfg.step_minutes))
FROM (
  SELECT
    s.sensor_id,
    (s.equipment_id % 5 = 0) AS has_failure,
    CASE s.type
      WHEN 'vibration'   THEN 3.5
      WHEN 'temperature' THEN 45
      WHEN 'pressure'    THEN 6
      WHEN 'current'     THEN 25
      WHEN 'rpm'         THEN 1800
      ELSE 10
    END AS healthy,
    coalesce(s.max_threshold, 100) - coalesce(s.min_threshold, 0) AS rng,
    CASE s.type WHEN 'vibration' THEN 1.0 WHEN 'temperature' THEN 0.9 ELSE 0.6 END AS trend_factor,
    s.min_threshold,
    s.max_threshold
  FROM sensors s
  WHERE s.status = 'active'
) sen
CROSS JOIN (SELECT :mp_days::int AS days, :mp_step_minutes::int AS step_minutes) cfg
CROSS JOIN generate_series(1, (cfg.days * 24 * 60 / cfg.step_minutes)) AS st(step)
CROSS JOIN LATERAL (
  SELECT round((
      sen.healthy
    + sen.rng * 0.05 * (random() - 0.5)
    + CASE WHEN sen.has_failure
           THEN (st.step::numeric / (cfg.days * 24 * 60 / cfg.step_minutes))
                * sen.rng * 0.55 * sen.trend_factor
           ELSE 0 END
  )::numeric, 4) AS value
) x
WHERE NOT EXISTS (SELECT 1 FROM readings);

-- ─── Verificación ────────────────────────────────────────────────────
DO $$
DECLARE
  v_total    BIGINT;
  v_suspect  BIGINT;
  v_bad      BIGINT;
  v_mismatch BIGINT;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE quality = 'suspect'),
         count(*) FILTER (WHERE quality = 'bad')
    INTO v_total, v_suspect, v_bad
  FROM readings;

  RAISE NOTICE 'Seed readings → total: %, suspect: %, bad: %', v_total, v_suspect, v_bad;

  -- Invariante que ata el seed a la función de la Fase A: una lectura marcada 'good'
  -- tiene que estar dentro de rango según `fn_classify_reading`. Si esto no da 0, el
  -- seed y la función se han separado.
  SELECT count(*) INTO v_mismatch
  FROM readings r
  JOIN sensors s USING (sensor_id)
  WHERE r.quality = 'good'
    AND fn_classify_reading(r.value, s.sensor_id) = 'suspect';

  IF v_mismatch > 0 THEN
    RAISE WARNING 'Incoherencia seed↔fn_classify_reading en % lecturas', v_mismatch;
  ELSE
    RAISE NOTICE 'Coherencia con fn_classify_reading: OK';
  END IF;
END $$;
