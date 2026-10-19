-- =====================================================================
-- MaintainPredict AI — Funciones (Fase A.3)
-- =====================================================================
-- Idempotente (CREATE OR REPLACE). Aplicable en caliente con:
--   docker compose exec -T postgres psql -U mp_user -d maintainpredict -f /docker-entrypoint-initdb.d/04_functions.sql
--
-- Regla de oro: cuando una función reproduce una regla que ya vive en el código de
-- la aplicación, se copia **exactamente** la del código, no una variante. Los sitios
-- duplicados están anotados en cada función para que no se separen.

-- ─── fn_classify_reading ─────────────────────────────────────────────
-- Rango del sensor → calidad de la lectura.
--   dentro de [min_threshold, max_threshold] → 'good'
--   fuera (solo un lado definido cuenta)     → 'suspect'
-- Sin umbrales definidos, la lectura se acepta como 'good'.
-- `'bad'` queda reservado para fallos de ingesta (valor no numérico), no para rangos.
CREATE OR REPLACE FUNCTION fn_classify_reading(p_value NUMERIC, p_sensor_id INT)
RETURNS VARCHAR
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_min NUMERIC;
  v_max NUMERIC;
BEGIN
  SELECT s.min_threshold, s.max_threshold INTO v_min, v_max
  FROM sensors s WHERE s.sensor_id = p_sensor_id;

  IF v_min IS NULL AND v_max IS NULL THEN
    RETURN 'good';
  END IF;
  IF (v_min IS NOT NULL AND p_value < v_min) OR (v_max IS NOT NULL AND p_value > v_max) THEN
    RETURN 'suspect';
  END IF;
  RETURN 'good';
END;
$$;

-- ─── fn_audit ────────────────────────────────────────────────────────
-- Inserta una fila en la bitácora y devuelve su id. Pensada para disparadores y
-- procedimientos que no pueden usar `lib/audit/log.ts` (el logger de TypeScript).
CREATE OR REPLACE FUNCTION fn_audit(
  p_user_id      INT,
  p_action       VARCHAR,
  p_module       VARCHAR,
  p_entity_type  VARCHAR DEFAULT NULL,
  p_entity_id    TEXT    DEFAULT NULL,
  p_payload      JSONB   DEFAULT NULL,
  p_ip           INET    DEFAULT NULL,
  p_user_agent   TEXT    DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO audit_log (user_id, action, module, entity_type, entity_id, payload, ip_address, user_agent)
  VALUES (p_user_id, p_action, p_module, p_entity_type, left(p_entity_id, 60), p_payload, p_ip, p_user_agent)
  RETURNING audit_id INTO v_id;
  RETURN v_id;
END;
$$;

-- ─── fn_calculate_kpis ───────────────────────────────────────────────
-- KPIs de negocio de una ventana. **Copia exacta** de la lógica de
-- `apps/web/lib/observability/kpis.ts` (`syncBusinessKpis`) para que el panel y la
-- base de datos no puedan discrepar:
--   · paradas evitadas = Σ estimated_downtime_h de órdenes completadas nacidas de
--     una predicción dentro de la ventana;
--   · ahorro            = paradas evitadas × downtime_cost_eur_h del equipo;
--   · disponibilidad    = equipos 'operational' / total (medida puntual);
--   · falsos positivos auto   = predicciones ≥ 0,70 de la ventana sin orden completada;
--   · falsos positivos manual = órdenes completadas con `[FALSO_POSITIVO]` en las notas.
CREATE OR REPLACE FUNCTION fn_calculate_kpis(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE (
  orders_created          INT,
  orders_completed        INT,
  predictions             INT,
  avg_failure_probability NUMERIC,
  downtime_avoided_h      NUMERIC,
  cost_savings_eur        NUMERIC,
  availability            NUMERIC,
  false_positives_auto    INT,
  false_positives_manual  INT
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM maintenance_orders o
      WHERE o.created_at >= p_start AND o.created_at < p_end),
    (SELECT count(*)::int FROM maintenance_orders o
      WHERE o.completed_at >= p_start AND o.completed_at < p_end),
    (SELECT count(*)::int FROM predictions p
      WHERE p.created_at >= p_start AND p.created_at < p_end),
    (SELECT round(avg(p.failure_probability), 4) FROM predictions p
      WHERE p.created_at >= p_start AND p.created_at < p_end),
    (SELECT coalesce(sum(mo.estimated_downtime_h), 0) FROM maintenance_orders mo
      WHERE mo.created_at >= p_start AND mo.created_at < p_end
        AND mo.status = 'completed' AND mo.prediction_id IS NOT NULL),
    (SELECT coalesce(sum(mo.estimated_downtime_h * e.downtime_cost_eur_h), 0)
       FROM maintenance_orders mo JOIN equipment e ON e.equipment_id = mo.equipment_id
      WHERE mo.created_at >= p_start AND mo.created_at < p_end
        AND mo.status = 'completed' AND mo.prediction_id IS NOT NULL),
    (SELECT CASE WHEN count(*) = 0 THEN 0
                 ELSE round(count(*) FILTER (WHERE e.status = 'operational')::numeric / count(*), 4)
            END
       FROM equipment e),
    (SELECT count(*)::int FROM predictions p
      WHERE p.created_at >= p_start AND p.created_at < p_end
        AND p.failure_probability >= 0.700
        AND NOT EXISTS (
          SELECT 1 FROM maintenance_orders done
          WHERE done.prediction_id = p.prediction_id AND done.status = 'completed')),
    (SELECT count(*)::int FROM maintenance_orders mo
      WHERE mo.created_at >= p_start AND mo.created_at < p_end
        AND mo.status = 'completed' AND mo.notes ILIKE '%[FALSO_POSITIVO]%');
END;
$$;

-- ─── fn_priority_for ─────────────────────────────────────────────────
-- Prioridad sugerida a partir de la criticidad del equipo y la probabilidad.
-- **Copia exacta** de la regla de `apps/web/lib/agents/planner.ts` (`sealDraftOrder`):
--   probabilidad > 0,9 → 'critical' · > 0,7 → 'high' · resto → 'medium'
-- `p_criticality` se acepta por compatibilidad con la spec §3 y hoy **no** altera el
-- resultado: la regla del código solo mira la probabilidad. Se deja explícito para que
-- nadie asuma una matriz criticidad × probabilidad que el planner no aplica.
--
-- El DROP previo sustituye una firma anterior con los argumentos al revés; con
-- `CREATE OR REPLACE` sola, esa firma vieja seguiría existiendo como función aparte.
DROP FUNCTION IF EXISTS fn_priority_for(numeric, varchar);
CREATE OR REPLACE FUNCTION fn_priority_for(p_criticality VARCHAR, p_probability NUMERIC)
RETURNS VARCHAR
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_probability > 0.9 THEN
    RETURN 'critical';
  ELSIF p_probability > 0.7 THEN
    RETURN 'high';
  END IF;
  RETURN 'medium';
END;
$$;

-- ─── fn_flag_outliers ────────────────────────────────────────────────
-- Lecturas fuera de ±3 desviaciones típicas (z-score) de un sensor en la ventana.
-- Devuelve solo las anómalas, ordenadas de mayor a menor desviación.
CREATE OR REPLACE FUNCTION fn_flag_outliers(p_sensor_id INT, p_window INTERVAL DEFAULT '7 days')
RETURNS TABLE (
  reading_id    BIGINT,
  reading_value NUMERIC,
  recorded_at   TIMESTAMPTZ,
  zscore        NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH stats AS (
    SELECT avg(value) AS mean, stddev_samp(value) AS sd
    FROM readings
    WHERE sensor_id = p_sensor_id AND readings.recorded_at >= now() - p_window
  )
  SELECT
    r.reading_id,
    r.value,
    r.recorded_at,
    round(((r.value - s.mean) / s.sd)::numeric, 3)
  FROM readings r CROSS JOIN stats s
  WHERE r.sensor_id = p_sensor_id
    AND r.recorded_at >= now() - p_window
    AND s.sd IS NOT NULL AND s.sd <> 0
    AND abs((r.value - s.mean) / s.sd) > 3
  ORDER BY 4 DESC;
$$;

-- ─── fn_kb_search_similar ────────────────────────────────────────────
-- Búsqueda semántica sobre la base de conocimiento (pgvector, distancia coseno).
-- `similarity = 1 - (embedding <=> query)`, igual que `lib/rag/retriever.ts`.
CREATE OR REPLACE FUNCTION fn_kb_search_similar(
  p_query    VECTOR(1536),
  p_k        INT DEFAULT 5,
  p_category VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  doc_id     INT,
  title      VARCHAR,
  category   VARCHAR,
  content    TEXT,
  metadata   JSONB,
  similarity DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
  SELECT
    d.doc_id,
    d.title,
    d.category,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> p_query))::double precision
  FROM kb_maintenance d
  WHERE d.embedding IS NOT NULL
    AND (p_category IS NULL OR d.category = p_category)
  ORDER BY d.embedding <=> p_query
  LIMIT p_k;
$$;

-- ─── fn_refresh_materialized_views ───────────────────────────────────
-- Refresca las dos vistas materializadas.
--
-- OJO: usa `REFRESH MATERIALIZED VIEW` sin `CONCURRENTLY` porque una función se ejecuta
-- siempre dentro de una transacción y `CONCURRENTLY` no está permitido ahí. Cuando se
-- quiera refrescar sin bloquear la lectura, hay que lanzarlo como sentencia suelta
-- (los índices únicos necesarios ya están creados):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_kpis;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_equipment_health;
CREATE OR REPLACE FUNCTION fn_refresh_materialized_views()
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_daily_kpis;
  REFRESH MATERIALIZED VIEW mv_equipment_health;
END;
$$;
