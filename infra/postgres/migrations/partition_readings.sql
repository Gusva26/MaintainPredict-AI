-- =====================================================================
-- MaintainPredict AI — Migración: particionar `readings` (Fase A.8 / decisión D4)
-- =====================================================================
-- NO SE APLICA TODAVÍA. Decisión D4: el particionado queda escrito y probado, pero solo
-- se ejecuta cuando `readings` supere ~10 M de filas. Con los volúmenes de la demo, una
-- tabla normal rinde igual y añade menos piezas móviles.
--
-- Cómo aplicarla el día que toque:
--   1. Backup ANTES, siempre:            bash scripts/backup-db.sh
--   2. Parar la ingesta (n8n WF-01) para que no entren lecturas durante la copia.
--   3. Ejecutar con el seguro quitado:
--        docker compose exec -T postgres psql -U mp_user -d maintainpredict \
--          -v allow_partition=on -f /migrations/partition_readings.sql
--   4. Reanudar la ingesta y comprobar:  SELECT count(*) FROM readings;
--
-- Notas de diseño:
--   · Partición RANGE mensual sobre `recorded_at` + partición DEFAULT. Un INSERT cuya
--     fecha no encaje en ninguna partición cae en la DEFAULT en lugar de fallar, así que
--     la ingesta nunca se rompe por una fecha rara; vigila su tamaño y ve creando meses.
--   · La clave primaria de una tabla particionada debe incluir la clave de partición
--     → PK (reading_id, recorded_at). Las consultas por reading_id suelto siguen usando
--     el índice; las consultas por rango de fechas ya no tocan la tabla completa.
--   · La migración es atómica (una transacción): o queda todo o no queda nada.
--
-- Antes de ejecutar, cambia las particiones mensuales de abajo (bloque "particiones")
-- por las que correspondan al rango real de datos del momento.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('mp.allow_partition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'Migración bloqueada. Léela entera y ejecútala con el seguro quitado: -v allow_partition=on';
  END IF;
END;
$$;

BEGIN;

-- 1) Tabla nueva, ya particionada, con la misma forma que `readings`.
CREATE TABLE readings_partitioned (
  reading_id   BIGINT      NOT NULL DEFAULT nextval('readings_reading_id_seq'),
  sensor_id    INT         NOT NULL,
  value        NUMERIC(12,4) NOT NULL,
  quality      VARCHAR(10) DEFAULT 'good'
               CHECK (quality IN ('good','suspect','bad')),
  recorded_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (reading_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- 2) Particiones mensuales + DEFAULT.
--    Ajusta/amplía este bloque al rango real de datos antes de aplicarlo.
CREATE TABLE readings_y2026m09 PARTITION OF readings_partitioned
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE readings_y2026m10 PARTITION OF readings_partitioned
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE readings_y2026m11 PARTITION OF readings_partitioned
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE readings_default PARTITION OF readings_partitioned DEFAULT;

-- 3) Copiar los datos.
INSERT INTO readings_partitioned (reading_id, sensor_id, value, quality, recorded_at)
SELECT reading_id, sensor_id, value, quality, recorded_at FROM readings;

-- 4) Índices equivalentes a los de la tabla original (se crean por partición).
CREATE INDEX idx_readings_part_sensor   ON readings_partitioned(sensor_id);
CREATE INDEX idx_readings_part_time     ON readings_partitioned(recorded_at DESC);
CREATE INDEX idx_readings_part_sensor_t ON readings_partitioned(sensor_id, recorded_at DESC);

-- 5) Sustituir la tabla. La FK hacia `sensors` se rehace sobre la nueva.
ALTER TABLE readings            RENAME TO readings_legacy;
ALTER TABLE readings_partitioned RENAME TO readings;
ALTER TABLE readings ADD CONSTRAINT readings_sensor_id_fkey
  FOREIGN KEY (sensor_id) REFERENCES sensors(sensor_id) ON DELETE CASCADE;

-- 6) Limpieza. Comenta esta línea si prefieres conservar `readings_legacy` unos días
--    (ocupa lo mismo que la tabla nueva hasta que la borres).
DROP TABLE readings_legacy;

COMMIT;

-- Después de esto, programa mantenimiento de particiones: crea el mes siguiente con
-- antelación y vigila el tamaño de `readings_default`.
--   CREATE TABLE readings_y2026m12 PARTITION OF readings
--     FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
