-- =====================================================================
-- MaintainPredict AI — SEED CORE: usuarios, equipos y sensores (Fase B.1)
-- =====================================================================
-- Volumen objetivo (spec §10): 7 usuarios · 500 equipos · ~1.600 sensores.
--
-- Adaptaciones respecto al SQL de la spec (que usaba tipos ENUM que este esquema no
-- tiene, aquí son VARCHAR + CHECK) y columnas que no existen en `equipment`
-- (manufacturer/model/serial_number): se han quitado. Nada más cambia.
--
-- Idempotente: los usuarios van con ON CONFLICT y el resto solo se siembra si la tabla
-- está vacía, así que reaplicar este fichero no duplica nada.

BEGIN;

-- ─── USUARIOS (7) ────────────────────────────────────────────────────
-- La contraseña de todos es "Password123!". El hash de aquí es un marcador: el script
-- `pnpm db:seed:users` lo regenera con bcrypt real al terminar el reset. Así el seed SQL
-- no depende de bcrypt y sigue siendo reproducible.
INSERT INTO users (email, password_hash, full_name, role, phone) VALUES
  ('admin@mp.ai',      '$2a$10$wB5Wf6KjWzC8G9yJ6L6K7OHP48.E0a7j5tQ4rBqG3f9e2k8a1b2c3', 'Admin Principal',    'admin',      '+34 600 000 001'),
  ('supervisor@mp.ai', '$2a$10$wB5Wf6KjWzC8G9yJ6L6K7OHP48.E0a7j5tQ4rBqG3f9e2k8a1b2c3', 'Laura Supervisora',  'supervisor', '+34 600 000 002'),
  ('planner@mp.ai',    '$2a$10$wB5Wf6KjWzC8G9yJ6L6K7OHP48.E0a7j5tQ4rBqG3f9e2k8a1b2c3', 'Diego Planificador', 'planner',    '+34 600 000 003'),
  ('tec1@mp.ai',       '$2a$10$wB5Wf6KjWzC8G9yJ6L6K7OHP48.E0a7j5tQ4rBqG3f9e2k8a1b2c3', 'Carlos Técnico',     'technician', '+34 600 000 004'),
  ('tec2@mp.ai',       '$2a$10$wB5Wf6KjWzC8G9yJ6L6K7OHP48.E0a7j5tQ4rBqG3f9e2k8a1b2c3', 'Marta Técnica',      'technician', '+34 600 000 005'),
  ('tec3@mp.ai',       '$2a$10$wB5Wf6KjWzC8G9yJ6L6K7OHP48.E0a7j5tQ4rBqG3f9e2k8a1b2c3', 'Javier Técnico',     'technician', '+34 600 000 006'),
  ('tec4@mp.ai',       '$2a$10$wB5Wf6KjWzC8G9yJ6L6K7OHP48.E0a7j5tQ4rBqG3f9e2k8a1b2c3', 'Ana Técnica',        'technician', '+34 600 000 007')
ON CONFLICT (email) DO NOTHING;

-- ─── EQUIPOS (500: 5 plantas × 10 líneas × 10 celdas) ────────────────
-- El coste por hora de parada se multiplica por el tipo de máquina (los compresores y
-- las CNC paran más caro), para que el KPI de ahorro tenga variedad real.
INSERT INTO equipment (name, type, location, criticality, installation_date, status, downtime_cost_eur_h)
SELECT
  'EQ-' || LPAD(s.g::text, 5, '0') || '-' || t.name,
  t.name,
  'Planta-' || (1 + (s.g % 5)) || '/Linea-' || (1 + ((s.g / 5) % 10)) || '/Celda-' || (1 + (s.g % 10)),
  (ARRAY['low','medium','high','critical'])[1 + (s.g % 4)],
  (DATE '2018-01-01' + ((s.g % 2000) || ' days')::interval)::date,
  (ARRAY['operational','operational','operational','maintenance','down'])[1 + (s.g % 5)],
  ROUND((random() * 2500 * t.cost_mult + 200)::numeric, 2)
FROM generate_series(1, 500) AS s(g)
JOIN (VALUES
  ('Pump',       0.95),
  ('Motor',      0.90),
  ('Compressor', 1.20),
  ('Conveyor',   0.80),
  ('CNC',        1.50)
) AS t(name, cost_mult)
  ON t.name = (ARRAY['Pump','Motor','Compressor','Conveyor','CNC'])[1 + (s.g % 5)]
WHERE NOT EXISTS (SELECT 1 FROM equipment);

-- ─── SENSORES (~1.600: 2 a 5 por equipo según el tipo) ───────────────
-- Cada equipo lleva siempre un sensor de vibración; el resto depende del tipo de máquina.
-- Un ~8 % nace inactivo o averiado, como en una planta real.
INSERT INTO sensors (equipment_id, type, unit, status, min_threshold, max_threshold)
SELECT
  e.equipment_id,
  s.type,
  s.unit,
  CASE
    WHEN random() < 0.03 THEN 'faulty'
    WHEN random() < 0.05 THEN 'inactive'
    ELSE 'active'
  END,
  s.min_t,
  s.max_t
FROM equipment e
CROSS JOIN (VALUES
  ('vibration','mm/s', 0::numeric, 11.0::numeric),
  ('temperature','°C', 0::numeric, 95.0::numeric),
  ('pressure','bar',   0::numeric, 12.0::numeric),
  ('current','A',      0::numeric, 60.0::numeric),
  ('rpm','rpm',        0::numeric, 3000.0::numeric)
) AS s(type, unit, min_t, max_t)
WHERE (
    (s.type = 'vibration')
    OR (s.type = 'temperature' AND (e.equipment_id % 2) = 0)
    OR (s.type = 'pressure'    AND (e.equipment_id % 3) = 0)
    OR (s.type = 'current'     AND e.type IN ('Motor','Compressor','CNC'))
    OR (s.type = 'rpm'         AND e.type IN ('Pump','Motor','Compressor'))
  )
  AND NOT EXISTS (SELECT 1 FROM sensors);

COMMIT;

-- ─── Verificación ────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Seed core → usuarios: %, equipos: %, sensores: %',
    (SELECT count(*) FROM users),
    (SELECT count(*) FROM equipment),
    (SELECT count(*) FROM sensors);
END $$;
