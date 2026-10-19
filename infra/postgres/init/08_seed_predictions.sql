-- =====================================================================
-- MaintainPredict AI — SEED PREDICTIONS + MAINTENANCE ORDERS (Fase B.1)
-- =====================================================================
-- Objetivo (spec §10): ~800 predicciones y ~600 órdenes.
--
-- La probabilidad de las predicciones no es ruido puro: sale de la vibración máxima de
-- los últimos 3 días, así que los equipos con la tendencia de falla del seed de lecturas
-- (id múltiplo de 5) puntúan más alto. Es lo que hace que las listas de alertas y los
-- KPIs tengan sentido en lugar de ser aleatorios.
--
-- Coherencia con las reglas de la app (importante: el seed no debe crear estados que la
-- aplicación jamás produciría):
--   · prioridad = `fn_priority_for(criticidad, probabilidad)`;
--   · `requires_hitl` = (parada estimada > 4 h) y una orden así **no** se queda 'planned'
--     (pasa a 'pending_approval'), igual que hace `sealDraftOrder()`;
--   · `completed_at` solo en órdenes completadas; `approved_by/at` en las que ya pasaron
--     por aprobación (aprobadas, en curso o completadas), nunca en `pending_approval`/`planned`;
--   · las fechas derivan unas de otras (creación → aprobación +1 d → cierre +2 d), para no
--     sembrar órdenes aprobadas antes de existir ni cerradas en el futuro.

BEGIN;

-- ─── Predicciones (una por equipo + una segunda tanda de seguimiento) ─
WITH base AS (
  SELECT
    e.equipment_id,
    (SELECT count(*) FROM sensors s WHERE s.equipment_id = e.equipment_id) AS n_sensors,
    (SELECT max(r.value)
       FROM readings r JOIN sensors s ON s.sensor_id = r.sensor_id
      WHERE s.equipment_id = e.equipment_id AND s.type = 'vibration'
        AND r.recorded_at >= now() - interval '3 days') AS last_vib
  FROM equipment e
),
gen AS (
  SELECT
    b.equipment_id,
    (ARRAY['bearing','motor','pump','valve','belt'])[1 + (b.equipment_id % 5)] AS component,
    least(0.99, greatest(0.05,
      (coalesce(b.last_vib, 3.5) / 11.0) * 0.75 + random() * 0.20))::numeric(4,3) AS failure_probability,
    (coalesce(b.last_vib, 3.5) / 11.0) AS vib_ratio
  FROM base b
  WHERE b.n_sensors > 0
)
INSERT INTO predictions (equipment_id, component, failure_probability, window_days,
                         model_version, explanation, features, created_at)
SELECT
  g.equipment_id,
  g.component,
  g.failure_probability,
  7,
  'rf-v1.0.0',
  format(
    'Se detecta incremento de %s%% en la señal de vibración respecto al histórico. ' ||
    'Temperatura asociada dentro de rango operativo. Componente probable: %s. ' ||
    'Recomendación: revisar lubricación y alineación.',
    round((g.vib_ratio * 100)::numeric, 1),
    g.component
  ),
  jsonb_build_object(
    'top_features', jsonb_build_array(
      jsonb_build_object('feature','vibration.ratio','value', round(g.vib_ratio::numeric, 3)),
      jsonb_build_object('feature','temperature.ratio','value', round((random()*0.6 + 0.2)::numeric, 3)),
      jsonb_build_object('feature','current.ratio','value', round((random()*0.5 + 0.3)::numeric, 3))
    ),
    'rag_sources', jsonb_build_array(
      jsonb_build_object('doc_id', 1, 'title', 'Manual rodamiento SKF 6205 — síntoma vibración',
                         'similarity', round((random()*0.3 + 0.65)::numeric, 3))
    )
  ),
  now() - (random() * interval '30 days')
FROM gen g
WHERE NOT EXISTS (SELECT 1 FROM predictions);

-- Segunda tanda: 60 % de los equipos con una predicción de seguimiento (más reciente).
INSERT INTO predictions (equipment_id, component, failure_probability, window_days,
                         model_version, explanation, features, created_at)
SELECT
  e.equipment_id,
  (ARRAY['bearing','motor','pump'])[1 + (e.equipment_id % 3)],
  round((random() * 0.9 + 0.05)::numeric, 3),
  7,
  'rf-v1.0.0',
  'Predicción de seguimiento: tendencia creciente en las últimas 72h.',
  jsonb_build_object('top_features', jsonb_build_array(
    jsonb_build_object('feature','vibration.ratio','value', round(random()::numeric, 3))
  )),
  now() - (random() * interval '15 days')
FROM equipment e
WHERE e.equipment_id % 5 < 3
  AND NOT EXISTS (SELECT 1 FROM predictions WHERE explanation LIKE 'Predicción de seguimiento%');

-- ─── Órdenes nacidas de una predicción (probabilidad > 0,5) ──────────
WITH plan AS (
  SELECT
    p.prediction_id, p.equipment_id, p.failure_probability, p.created_at, e.criticality,
    round((random() * 7 + 1)::numeric, 2) AS downtime,
    CASE
      WHEN p.created_at < now() - interval '20 days' AND random() < 0.7 THEN 'completed'
      WHEN p.created_at < now() - interval '10 days' AND random() < 0.4 THEN 'in_progress'
      WHEN p.created_at >= now() - interval '1 day' THEN 'pending_approval'
      WHEN random() < 0.2 THEN 'pending_approval'
      WHEN random() < 0.6 THEN 'approved'
      ELSE 'planned'
    END AS status0
  FROM predictions p
  JOIN equipment e ON e.equipment_id = p.equipment_id
  WHERE p.failure_probability > 0.5
),
plan2 AS (
  SELECT
    pl.*,
    (pl.downtime > 4) AS requires_hitl,
    CASE WHEN pl.status0 = 'planned' AND pl.downtime > 4 THEN 'pending_approval' ELSE pl.status0 END AS status
  FROM plan pl
)
INSERT INTO maintenance_orders (
  equipment_id, prediction_id, scheduled_date, technician_id, parts,
  estimated_downtime_h, status, priority, requires_hitl, notes,
  approved_by, approved_at, completed_at, created_at)
SELECT
  p2.equipment_id,
  p2.prediction_id,
  now() + ((1 + (random()*10)::int) || ' days')::interval,
  (SELECT user_id FROM users WHERE role = 'technician' ORDER BY random() LIMIT 1),
  CASE (ARRAY['bearing','motor','pump','valve','belt'])[1 + (p2.equipment_id % 5)]
    WHEN 'bearing' THEN jsonb_build_array(jsonb_build_object('sku','BRG-6205','qty',2), jsonb_build_object('sku','LUB-EP2','qty',1))
    WHEN 'motor'   THEN jsonb_build_array(jsonb_build_object('sku','MTR-5KW','qty',1), jsonb_build_object('sku','BRG-6206','qty',2))
    WHEN 'pump'    THEN jsonb_build_array(jsonb_build_object('sku','SEAL-PMP','qty',1), jsonb_build_object('sku','IMP-PMP','qty',1))
    WHEN 'valve'   THEN jsonb_build_array(jsonb_build_object('sku','VLV-DN50','qty',1))
    ELSE jsonb_build_array(jsonb_build_object('sku','BLT-A45','qty',1))
  END,
  p2.downtime,
  p2.status,
  fn_priority_for(p2.criticality, p2.failure_probability),
  p2.requires_hitl,
  CASE WHEN random() < 0.05 THEN '[FALSO_POSITIVO] No se encontró falla durante la inspección.'
       ELSE 'Inspección programada según plan.' END,
  CASE WHEN p2.status IN ('approved','completed','in_progress')
       THEN (SELECT user_id FROM users WHERE role IN ('supervisor','planner','admin') ORDER BY random() LIMIT 1) END,
  CASE WHEN p2.status IN ('approved','completed','in_progress')
       THEN p2.created_at + interval '1 day' END,
  CASE WHEN p2.status = 'completed' THEN p2.created_at + interval '2 days' END,
  p2.created_at
FROM plan2 p2
WHERE NOT EXISTS (SELECT 1 FROM maintenance_orders WHERE prediction_id IS NOT NULL);

-- ─── Órdenes históricas (mantenimiento preventivo ya cerrado) ────────
-- Dan volumen a los KPIs de 30 días; no nacen de una predicción (prediction_id NULL).
-- Una orden completada pasó por aprobación, así que lleva `approved_by/at` (y su fecha de
-- cierre posterior a la aprobación): el visor de auditoría no debe mostrar cierres sin
-- aprobación previa.
-- Ojo: las fechas y la parada se calculan en un CTE y no en un LATERAL sin correlacionar,
-- porque Postgres puede evaluar ese LATERAL una sola vez y asignar el mismo valor a todas
-- las filas (pasaba: las 332 históricas salían con 5,93 h de parada).
WITH hist AS (
  SELECT
    e.equipment_id,
    now() - ((5 + (random()*55)::int) || ' days')::interval AS created,
    round((random() * 5 + 1)::numeric, 2) AS downtime
  FROM equipment e
  CROSS JOIN generate_series(1, 2) AS g
  WHERE e.equipment_id % 3 = 0
)
INSERT INTO maintenance_orders (
  equipment_id, prediction_id, scheduled_date, technician_id, parts,
  estimated_downtime_h, status, priority, requires_hitl, notes,
  approved_by, approved_at, completed_at, created_at)
SELECT
  h.equipment_id,
  NULL,
  h.created + interval '1 day',
  (SELECT user_id FROM users WHERE role = 'technician' ORDER BY random() LIMIT 1),
  '[]'::jsonb,
  h.downtime,
  'completed',
  (ARRAY['low','medium','high','critical'])[1 + (random()*3)::int],
  (h.downtime > 4),
  'Mantenimiento preventivo rutinario.',
  (SELECT user_id FROM users WHERE role IN ('supervisor','planner','admin') ORDER BY random() LIMIT 1),
  h.created + interval '2 days',
  h.created + interval '3 days',
  h.created
FROM hist h
WHERE NOT EXISTS (SELECT 1 FROM maintenance_orders WHERE prediction_id IS NULL);

COMMIT;

-- ─── Verificación ────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Seed predictions → predicciones: %, órdenes: %, HITL: %, falsos positivos: %',
    (SELECT count(*) FROM predictions),
    (SELECT count(*) FROM maintenance_orders),
    (SELECT count(*) FROM maintenance_orders WHERE requires_hitl),
    (SELECT count(*) FROM maintenance_orders WHERE notes ILIKE '%[FALSO_POSITIVO]%');
END $$;
