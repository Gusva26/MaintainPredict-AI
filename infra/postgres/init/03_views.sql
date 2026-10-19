-- =====================================================================
-- MaintainPredict AI — Vistas y vistas materializadas (Fase A.2 + A.5)
-- =====================================================================
-- Idempotente: se puede aplicar sobre una base ya en marcha con
--   docker compose exec -T postgres psql -U mp_user -d maintainpredict -f /docker-entrypoint-initdb.d/03_views.sql
--
-- Nota de A.5: el plan situaba las dos vistas materializadas en `04_functions.sql`.
-- Se adelantan aquí a propósito: son relaciones y los procedimientos/funciones de
-- refresco (`fn_refresh_materialized_views`, `sp_refresh_views`) las referencian, así
-- que el orden de dependencias queda 03 → 04 → 05.

-- ─── A.2 · v_equipment_health ────────────────────────────────────────
-- Equipo + última lectura recibida + predicción vigente (la más reciente).
CREATE OR REPLACE VIEW v_equipment_health AS
SELECT
  e.equipment_id,
  e.name,
  e.type,
  e.location,
  e.criticality,
  e.status,
  e.downtime_cost_eur_h,
  sc.sensor_count,
  lr.reading_id      AS last_reading_id,
  lr.sensor_id       AS last_sensor_id,
  lr.value           AS last_value,
  lr.quality         AS last_quality,
  lr.recorded_at     AS last_reading_at,
  p.prediction_id,
  p.component        AS predicted_component,
  p.failure_probability,
  p.window_days,
  p.created_at       AS prediction_at,
  CASE
    WHEN p.failure_probability IS NULL      THEN 'unknown'
    WHEN p.failure_probability >= 0.70      THEN 'alert'
    WHEN p.failure_probability >= 0.40      THEN 'watch'
    ELSE 'ok'
  END AS health
FROM equipment e
LEFT JOIN LATERAL (
  SELECT count(*)::int AS sensor_count
  FROM sensors s WHERE s.equipment_id = e.equipment_id
) sc ON TRUE
LEFT JOIN LATERAL (
  SELECT r.reading_id, r.sensor_id, r.value, r.quality, r.recorded_at
  FROM readings r
  JOIN sensors s2 ON s2.sensor_id = r.sensor_id
  WHERE s2.equipment_id = e.equipment_id
  ORDER BY r.recorded_at DESC
  LIMIT 1
) lr ON TRUE
LEFT JOIN LATERAL (
  SELECT pr.prediction_id, pr.component, pr.failure_probability, pr.window_days, pr.created_at
  FROM predictions pr
  WHERE pr.equipment_id = e.equipment_id
  ORDER BY pr.created_at DESC
  LIMIT 1
) p ON TRUE;

-- ─── A.2 · v_open_orders ─────────────────────────────────────────────
-- Órdenes no cerradas, con su equipo y su técnico.
CREATE OR REPLACE VIEW v_open_orders AS
SELECT
  o.order_id,
  o.status,
  o.priority,
  o.scheduled_date,
  o.estimated_downtime_h,
  o.requires_hitl,
  o.equipment_id,
  e.name       AS equipment_name,
  e.location,
  e.criticality,
  o.technician_id,
  u.full_name  AS technician_name,
  u.email      AS technician_email,
  o.prediction_id,
  o.notes,
  o.approved_by,
  o.approved_at,
  o.created_at
FROM maintenance_orders o
JOIN equipment e ON e.equipment_id = o.equipment_id
LEFT JOIN users u ON u.user_id = o.technician_id
WHERE o.status NOT IN ('completed', 'cancelled');

-- ─── A.2 · v_active_alerts ───────────────────────────────────────────
-- Predicciones en alerta (> 0,70) que todavía NO tienen una orden completada.
-- Coincide con la definición de falso positivo «auto» de `lib/observability/kpis.ts`.
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT
  p.prediction_id,
  p.equipment_id,
  e.name       AS equipment_name,
  e.location,
  e.criticality,
  p.component,
  p.failure_probability,
  p.window_days,
  p.created_at AS prediction_at,
  o.order_id,
  o.status     AS order_status
FROM predictions p
JOIN equipment e ON e.equipment_id = p.equipment_id
LEFT JOIN LATERAL (
  SELECT mo.order_id, mo.status
  FROM maintenance_orders mo
  WHERE mo.prediction_id = p.prediction_id
  ORDER BY mo.order_id DESC
  LIMIT 1
) o ON TRUE
WHERE p.failure_probability > 0.70
  AND NOT EXISTS (
    SELECT 1 FROM maintenance_orders done
    WHERE done.prediction_id = p.prediction_id
      AND done.status = 'completed'
  );

-- ─── A.2 · v_technician_load ─────────────────────────────────────────
-- Carga abierta por técnico activo. Mismo orden que usa el planner (menos carga primero).
CREATE OR REPLACE VIEW v_technician_load AS
SELECT
  u.user_id AS technician_id,
  u.full_name AS technician_name,
  u.email,
  count(o.order_id) FILTER (WHERE o.status IN ('planned', 'approved', 'in_progress'))::int AS open_orders,
  count(o.order_id) FILTER (WHERE o.status = 'pending_approval')::int                      AS awaiting_approval,
  count(o.order_id) FILTER (WHERE o.status IN ('planned', 'approved', 'in_progress')
                              AND o.scheduled_date::date = CURRENT_DATE)::int              AS due_today,
  coalesce(sum(o.estimated_downtime_h) FILTER (WHERE o.status IN ('planned', 'approved', 'in_progress')), 0) AS open_downtime_h
FROM users u
LEFT JOIN maintenance_orders o ON o.technician_id = u.user_id
WHERE u.role = 'technician' AND coalesce(u.is_active, TRUE)
GROUP BY u.user_id, u.full_name, u.email;

-- ─── A.2 · v_kb_search ───────────────────────────────────────────────
-- Búsqueda léxica de respaldo sobre la base de conocimiento (pg_trgm), para cuando
-- no hay embeddings. Se usa fijando la consulta en una variable de sesión:
--
--   SET mp.search_query = 'rodamiento';
--   SELECT doc_id, title, round(score::numeric, 3) FROM v_kb_search ORDER BY score DESC;
--
-- Usa `word_similarity` (no `similarity`): compara la consulta contra la mejor palabra
-- del texto en lugar de contra el texto entero, y eso evita que un documento largo
-- diluya la puntuación. El umbral es configurable con `mp.search_min` (por defecto 0,4).
CREATE OR REPLACE VIEW v_kb_search AS
SELECT
  d.doc_id,
  d.title,
  d.category,
  d.metadata,
  (d.embedding IS NOT NULL) AS has_embedding,
  word_similarity(current_setting('mp.search_query', true), d.title || ' ' || d.content) AS score
FROM kb_maintenance d
WHERE current_setting('mp.search_query', true) IS NOT NULL
  AND word_similarity(current_setting('mp.search_query', true), d.title || ' ' || d.content)
      >= coalesce(nullif(current_setting('mp.search_min', true), '')::real, 0.4);

-- ─── A.5 · mv_daily_kpis ─────────────────────────────────────────────
-- Serie diaria con los conteos que alimentan el panel de observabilidad.
-- Cubre desde el primer día con actividad hasta hoy (ventana móvil amplia).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_kpis AS
WITH days AS (
  SELECT generate_series(
    least(
      coalesce((SELECT min(created_at)::date FROM maintenance_orders), CURRENT_DATE),
      coalesce((SELECT min(created_at)::date FROM predictions), CURRENT_DATE),
      coalesce((SELECT min(recorded_at)::date FROM readings), CURRENT_DATE)
    ),
    CURRENT_DATE,
    '1 day'
  )::date AS day
)
SELECT
  d.day,
  (SELECT count(*) FROM maintenance_orders o WHERE o.created_at::date = d.day)::int          AS orders_created,
  (SELECT count(*) FROM maintenance_orders o WHERE o.completed_at::date = d.day)::int        AS orders_completed,
  (SELECT count(*) FROM maintenance_orders o
    WHERE o.status = 'cancelled' AND o.updated_at::date = d.day)::int                        AS orders_cancelled,
  (SELECT count(*) FROM predictions p WHERE p.created_at::date = d.day)::int                 AS predictions,
  (SELECT count(*) FROM predictions p WHERE p.created_at::date = d.day
    AND p.failure_probability > 0.70)::int                                                   AS alerts,
  (SELECT round(avg(p.failure_probability), 4) FROM predictions p
    WHERE p.created_at::date = d.day)                                                        AS avg_failure_probability,
  (SELECT count(*) FROM readings r WHERE r.recorded_at::date = d.day)::int                   AS readings
FROM days d;

-- Índice único: obligatorio para poder refrescar con REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_kpis_day_key ON mv_daily_kpis(day);

-- ─── A.5 · mv_equipment_health ───────────────────────────────────────
-- Foto del estado de salud de todos los equipos (la última lectura y predicción).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_equipment_health AS
SELECT v.*, now() AS refreshed_at
FROM v_equipment_health v;

CREATE UNIQUE INDEX IF NOT EXISTS mv_equipment_health_pk ON mv_equipment_health(equipment_id);
