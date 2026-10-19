-- =====================================================================
-- MaintainPredict AI — SEED AUDIT: bitácora inicial (Fase B.1)
-- =====================================================================
-- Objetivo (spec §10): ~5.000 entradas de bitácora.
--
-- Se siembran los cinco tipos de evento que la aplicación registra de verdad, con el
-- mismo `action`/`module`/`entity_type` que usa `lib/audit/log.ts`, para que el visor de
-- auditoría tenga un histórico creíble y no un relleno inventado:
--   login/logout · create_order · approve_order · complete_order · ingest_sensor.

BEGIN;

-- ─── Sesiones (login/logout): 7 usuarios × 500 eventos = 3.500 ───────
INSERT INTO audit_log (user_id, action, module, payload, ip_address, user_agent, created_at)
SELECT
  u.user_id,
  CASE (g % 3) WHEN 0 THEN 'login' WHEN 1 THEN 'login' ELSE 'logout' END,
  'auth',
  jsonb_build_object('seed', true),
  ('192.168.1.' || (10 + g % 200))::inet,
  'Mozilla/5.0 (MaintainPredict seed)',
  now() - ((g || ' hours')::interval)
FROM users u
CROSS JOIN generate_series(1, 500) AS g
WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'login');

-- ─── Creación de órdenes (últimos 30 días) ───────────────────────────
INSERT INTO audit_log (user_id, action, module, entity_type, entity_id, payload, ip_address, created_at)
SELECT
  (SELECT user_id FROM users WHERE role IN ('supervisor','planner','admin') ORDER BY random() LIMIT 1),
  'create_order',
  'orders',
  'order',
  mo.order_id::text,
  jsonb_build_object('requires_hitl', mo.requires_hitl, 'priority', mo.priority),
  ('10.0.0.' || (1 + (mo.order_id % 250)))::inet,
  mo.created_at
FROM maintenance_orders mo
WHERE mo.created_at >= now() - interval '30 days'
  AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'create_order');

-- ─── Aprobaciones HITL ───────────────────────────────────────────────
INSERT INTO audit_log (user_id, action, module, entity_type, entity_id, payload, ip_address, created_at)
SELECT
  mo.approved_by,
  'approve_order',
  'orders',
  'order',
  mo.order_id::text,
  jsonb_build_object('hitl', true),
  ('10.0.0.' || (1 + (mo.order_id % 250)))::inet,
  coalesce(mo.approved_at, mo.created_at + interval '1 hour')
FROM maintenance_orders mo
WHERE mo.approved_by IS NOT NULL
  AND mo.approved_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'approve_order');

-- ─── Cierres de orden ────────────────────────────────────────────────
INSERT INTO audit_log (user_id, action, module, entity_type, entity_id, payload, ip_address, created_at)
SELECT
  (SELECT user_id FROM users WHERE role = 'technician' ORDER BY random() LIMIT 1),
  'complete_order',
  'orders',
  'order',
  mo.order_id::text,
  jsonb_build_object('false_positive', mo.notes ILIKE '%[FALSO_POSITIVO]%'),
  ('10.1.0.' || (1 + (mo.order_id % 250)))::inet,
  mo.completed_at
FROM maintenance_orders mo
WHERE mo.status = 'completed'
  AND mo.completed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'complete_order');

-- ─── Ingesta de sensores (muestreada) ────────────────────────────────
INSERT INTO audit_log (user_id, action, module, entity_type, entity_id, payload, created_at)
SELECT
  NULL,
  'ingest_sensor',
  'sensors',
  'reading',
  r.reading_id::text,
  jsonb_build_object('quality', r.quality),
  r.recorded_at
FROM readings r
WHERE r.reading_id % 5000 = 0
  AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'ingest_sensor' AND entity_type = 'reading')
LIMIT 100;

-- ─── Escaneos de datos sucios (diarios) ──────────────────────────────
INSERT INTO audit_log (user_id, action, module, entity_type, payload, created_at)
SELECT
  NULL,
  'ingest_sensor',
  'sensors',
  'dirty_data_scan',
  jsonb_build_object('flagged', (random()*50)::int, 'windowHours', 24),
  now() - ((g || ' days')::interval)
FROM generate_series(1, 15) AS g
WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'ingest_sensor' AND entity_type = 'dirty_data_scan');

COMMIT;

-- ─── Verificación ────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Seed audit → entradas: % (login: %, create_order: %, approve_order: %, complete_order: %, ingest_sensor: %)',
    (SELECT count(*) FROM audit_log),
    (SELECT count(*) FROM audit_log WHERE action = 'login'),
    (SELECT count(*) FROM audit_log WHERE action = 'create_order'),
    (SELECT count(*) FROM audit_log WHERE action = 'approve_order'),
    (SELECT count(*) FROM audit_log WHERE action = 'complete_order'),
    (SELECT count(*) FROM audit_log WHERE action = 'ingest_sensor');
END $$;
