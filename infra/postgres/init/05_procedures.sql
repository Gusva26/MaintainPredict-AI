-- =====================================================================
-- MaintainPredict AI — Procedimientos (Fase A.4)
-- =====================================================================
-- Idempotente (CREATE OR REPLACE). Aplicable en caliente con:
--   docker compose exec -T postgres psql -U mp_user -d maintainpredict -f /docker-entrypoint-initdb.d/05_procedures.sql
--
-- Se invocan con CALL (no con SELECT). Todos emiten un NOTICE con lo que han hecho,
-- para que quede en el log del contenedor cuando los lance un trabajo programado.

-- ─── sp_refresh_views ────────────────────────────────────────────────
-- Refresca las dos vistas materializadas (mv_daily_kpis y mv_equipment_health).
CREATE OR REPLACE PROCEDURE sp_refresh_views()
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_daily_kpis;
  REFRESH MATERIALIZED VIEW mv_equipment_health;
  RAISE NOTICE 'Vistas materializadas refrescadas (mv_daily_kpis, mv_equipment_health).';
END;
$$;

-- ─── sp_purge_old_readings ───────────────────────────────────────────
-- Borra lecturas anteriores a N días (por defecto 90). Pensado para una tarea
-- programada: `readings` es la tabla que más crece.
CREATE OR REPLACE PROCEDURE sp_purge_old_readings(p_days INT DEFAULT 90)
LANGUAGE plpgsql AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'El número de días debe ser >= 1 (recibido: %)', p_days;
  END IF;

  DELETE FROM readings WHERE recorded_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Lecturas purgadas (más de % días): %', p_days, v_deleted;
END;
$$;

-- ─── sp_archive_completed_orders ─────────────────────────────────────
-- Mueve a `maintenance_orders_archive` las órdenes cerradas (completed/cancelled)
-- anteriores a N días. Devuelve por NOTICE cuántas movió.
CREATE OR REPLACE PROCEDURE sp_archive_completed_orders(p_days INT DEFAULT 365)
LANGUAGE plpgsql AS $$
DECLARE
  v_moved BIGINT;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'El número de días debe ser >= 1 (recibido: %)', p_days;
  END IF;

  WITH moved AS (
    DELETE FROM maintenance_orders
    WHERE status IN ('completed', 'cancelled')
      AND coalesce(completed_at, updated_at, created_at) < now() - make_interval(days => p_days)
    RETURNING *
  )
  INSERT INTO maintenance_orders_archive (
    order_id, equipment_id, prediction_id, scheduled_date, technician_id, parts,
    estimated_downtime_h, status, priority, notes, requires_hitl, approved_by,
    approved_at, completed_at, created_at, updated_at, archived_at
  )
  SELECT
    order_id, equipment_id, prediction_id, scheduled_date, technician_id, parts,
    estimated_downtime_h, status, priority, notes, requires_hitl, approved_by,
    approved_at, completed_at, created_at, updated_at, now()
  FROM moved
  ON CONFLICT (order_id) DO NOTHING;

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RAISE NOTICE 'Órdenes archivadas (más de % días): %', p_days, v_moved;
END;
$$;

-- ─── sp_recompute_kpis ───────────────────────────────────────────────
-- Recalcula los KPIs de negocio de la ventana y los persiste en `business_kpis`.
-- Escribe los **mismos cinco** nombres que `syncBusinessKpis()` para que el panel
-- (`getKpiComparison`) los sume igual vengan de donde vengan. Idempotente: borra antes
-- las filas de esa misma ventana.
CREATE OR REPLACE PROCEDURE sp_recompute_kpis(p_days INT DEFAULT 7)
LANGUAGE plpgsql AS $$
DECLARE
  v_start TIMESTAMPTZ := now() - make_interval(days => p_days);
  v_end   TIMESTAMPTZ := now();
  k       RECORD;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'El número de días debe ser >= 1 (recibido: %)', p_days;
  END IF;

  SELECT * INTO k FROM fn_calculate_kpis(v_start, v_end);

  DELETE FROM business_kpis WHERE period_start = v_start;

  INSERT INTO business_kpis (kpi_name, kpi_value, period_start, period_end)
  VALUES
    ('downtime_avoided_h',      k.downtime_avoided_h,      v_start, v_end),
    ('cost_savings_eur',        k.cost_savings_eur,        v_start, v_end),
    ('availability',            k.availability,            v_start, v_end),
    ('false_positives_auto',    k.false_positives_auto,    v_start, v_end),
    ('false_positives_manual',  k.false_positives_manual,  v_start, v_end);

  RAISE NOTICE 'KPIs recalculados (% días): paradas evitadas=% h · ahorro=% EUR · disponibilidad=%',
    p_days, k.downtime_avoided_h, k.cost_savings_eur, k.availability;
END;
$$;

-- ─── sp_flag_stale_predictions ───────────────────────────────────────
-- Marca en la bitácora las predicciones en alerta (> 0,70) que llevan más de N días
-- sin ninguna orden abierta: alertas publicadas que nadie ha planificado. Idempotente
-- (no vuelve a marcar una predicción que ya tiene su aviso).
CREATE OR REPLACE PROCEDURE sp_flag_stale_predictions(p_days INT DEFAULT 3)
LANGUAGE plpgsql AS $$
DECLARE
  v_flagged BIGINT := 0;
  r RECORD;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'El número de días debe ser >= 1 (recibido: %)', p_days;
  END IF;

  FOR r IN
    SELECT p.prediction_id, p.equipment_id, p.failure_probability
    FROM predictions p
    WHERE p.failure_probability > 0.70
      AND p.created_at < now() - make_interval(days => p_days)
      AND NOT EXISTS (
        SELECT 1 FROM maintenance_orders mo
        WHERE mo.prediction_id = p.prediction_id
          AND mo.status IN ('planned', 'pending_approval', 'approved', 'in_progress')
      )
      AND NOT EXISTS (
        SELECT 1 FROM audit_log a
        WHERE a.action = 'flag_stale_prediction'
          AND a.entity_type = 'prediction'
          AND a.entity_id = p.prediction_id::text
      )
  LOOP
    PERFORM fn_audit(
      NULL,
      'flag_stale_prediction',
      'predictions',
      'prediction',
      r.prediction_id::text,
      jsonb_build_object(
        'equipment_id', r.equipment_id,
        'failure_probability', r.failure_probability,
        'stale_days', p_days
      )
    );
    v_flagged := v_flagged + 1;
  END LOOP;

  RAISE NOTICE 'Predicciones en alerta sin planificar (> % días) marcadas: %', p_days, v_flagged;
END;
$$;

-- ─── sp_vacuum_hot_tables ────────────────────────────────────────────
-- Mantenimiento de las tablas que más se escriben.
--
-- DESVIACIÓN DOCUMENTADA de la Fase A.4: `VACUUM` **no** se puede ejecutar desde una
-- función ni desde un procedimiento. No es una limitación transaccional que se salve con
-- `COMMIT`: el motor lo rechaza directamente (`ERROR: VACUUM cannot be executed from a
-- function`). Como el procedimiento tampoco puede pedirle a otra sesión que lo haga sin
-- credenciales nuevas, hace lo que sí está permitido dentro del motor —`ANALYZE`, que
-- recalcula las estadísticas del planificador— y deja por NOTICE las sentencias VACUUM
-- exactas. El VACUUM real (recuperar espacio) vive en `scripts/vacuum-db.sh`, que las
-- lanza por psql, fuera de toda transacción.
CREATE OR REPLACE PROCEDURE sp_vacuum_hot_tables()
LANGUAGE plpgsql AS $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'readings', 'audit_log', 'predictions', 'maintenance_orders',
    'model_metrics', 'business_kpis', 'kb_maintenance'
  ]
  LOOP
    EXECUTE format('ANALYZE %I', t);
  END LOOP;
  RAISE NOTICE 'ANALYZE completado en las tablas calientes. Para recuperar espacio (VACUUM real): bash scripts/vacuum-db.sh';
END;
$$;
