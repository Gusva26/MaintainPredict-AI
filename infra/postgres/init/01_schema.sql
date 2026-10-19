-- =====================================================================
-- MaintainPredict AI — Esquema principal (18.4 ampliado)
-- =====================================================================

-- ─── USERS (RBAC: technician | supervisor | planner | admin) ─────────
CREATE TABLE IF NOT EXISTS users (
  user_id        SERIAL PRIMARY KEY,
  email          VARCHAR(180) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(200) NOT NULL,
  role           VARCHAR(20)  NOT NULL
                 CHECK (role IN ('technician','supervisor','planner','admin')),
  phone          VARCHAR(30),
  is_active      BOOLEAN DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ─── EQUIPMENT ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment (
  equipment_id        SERIAL PRIMARY KEY,
  name                VARCHAR(200) NOT NULL,
  type                VARCHAR(100) NOT NULL,
  location            VARCHAR(200),
  criticality         VARCHAR(20) NOT NULL DEFAULT 'medium'
                      CHECK (criticality IN ('low','medium','high','critical')),
  installation_date   DATE,
  status              VARCHAR(20) DEFAULT 'operational'
                      CHECK (status IN ('operational','maintenance','down','retired')),
  downtime_cost_eur_h NUMERIC(10,2) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_criticality ON equipment(criticality);
CREATE INDEX IF NOT EXISTS idx_equipment_status      ON equipment(status);

-- ─── SENSORS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensors (
  sensor_id     SERIAL PRIMARY KEY,
  equipment_id  INT NOT NULL REFERENCES equipment(equipment_id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL,   -- vibration | temperature | pressure | current | rpm
  unit          VARCHAR(20),
  status        VARCHAR(20) DEFAULT 'active'
                CHECK (status IN ('active','inactive','maintenance','faulty')),
  min_threshold NUMERIC(12,4),
  max_threshold NUMERIC(12,4),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensors_equipment ON sensors(equipment_id);

-- ─── READINGS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS readings (
  reading_id   BIGSERIAL PRIMARY KEY,
  sensor_id    INT NOT NULL REFERENCES sensors(sensor_id) ON DELETE CASCADE,
  value        NUMERIC(12,4) NOT NULL,
  quality      VARCHAR(10) DEFAULT 'good'
               CHECK (quality IN ('good','suspect','bad')),  -- detección de datos sucios
  recorded_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_sensor    ON readings(sensor_id);
CREATE INDEX IF NOT EXISTS idx_readings_time      ON readings(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_sensor_t  ON readings(sensor_id, recorded_at DESC);

-- ─── PREDICTIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions (
  prediction_id       SERIAL PRIMARY KEY,
  equipment_id        INT NOT NULL REFERENCES equipment(equipment_id) ON DELETE CASCADE,
  component           VARCHAR(100),         -- bearing | motor | pump | valve | belt ...
  failure_probability NUMERIC(4,3) NOT NULL
                      CHECK (failure_probability >= 0 AND failure_probability <= 1),
  window_days         INT,
  model_version       VARCHAR(50),
  explanation         TEXT,                 -- explicabilidad en lenguaje natural
  features            JSONB,                -- contribución de features (SHAP)
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_equipment ON predictions(equipment_id);
CREATE INDEX IF NOT EXISTS idx_predictions_created   ON predictions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_prob      ON predictions(failure_probability DESC);

-- ─── MAINTENANCE ORDERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_orders (
  order_id             SERIAL PRIMARY KEY,
  equipment_id         INT NOT NULL REFERENCES equipment(equipment_id),
  prediction_id        INT REFERENCES predictions(prediction_id),
  scheduled_date       TIMESTAMPTZ,
  technician_id        INT REFERENCES users(user_id),
  parts                JSONB DEFAULT '[]'::jsonb,
  estimated_downtime_h NUMERIC(6,2),
  status               VARCHAR(20) DEFAULT 'planned'
                       CHECK (status IN ('planned','pending_approval','approved','in_progress','completed','cancelled')),
  priority             VARCHAR(10) DEFAULT 'medium'
                       CHECK (priority IN ('low','medium','high','critical')),
  notes                TEXT,
  requires_hitl        BOOLEAN DEFAULT FALSE,   -- parada > 4h
  approved_by          INT REFERENCES users(user_id),
  approved_at          TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_equipment ON maintenance_orders(equipment_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON maintenance_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled ON maintenance_orders(scheduled_date);

-- ─── MAINTENANCE ORDERS — ARCHIVO (soporte de A.4) ───────────────────
-- Destino de `sp_archive_completed_orders()`: órdenes cerradas antiguas que ya no se
-- consultan a diario. Mismas columnas que `maintenance_orders` + `archived_at`, y sin
-- claves foráneas a propósito: una fila archivada tiene que sobrevivir al borrado de su
-- equipo, técnico o predicción.
CREATE TABLE IF NOT EXISTS maintenance_orders_archive (
  order_id             INT PRIMARY KEY,
  equipment_id         INT NOT NULL,
  prediction_id        INT,
  scheduled_date       TIMESTAMPTZ,
  technician_id        INT,
  parts                JSONB DEFAULT '[]'::jsonb,
  estimated_downtime_h NUMERIC(6,2),
  status               VARCHAR(20),
  priority             VARCHAR(10),
  notes                TEXT,
  requires_hitl        BOOLEAN DEFAULT FALSE,
  approved_by          INT,
  approved_at          TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ,
  archived_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_archive_status    ON maintenance_orders_archive(status);
CREATE INDEX IF NOT EXISTS idx_orders_archive_equipment ON maintenance_orders_archive(equipment_id);

-- ─── KNOWLEDGE BASE (RAG) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_maintenance (
  doc_id     SERIAL PRIMARY KEY,
  title      VARCHAR(300) NOT NULL,
  category   VARCHAR(80),                   -- manual | historico_falla | normativa
  content    TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}'::jsonb,
  embedding  VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_maintenance_embedding
  ON kb_maintenance USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_kb_category ON kb_maintenance(category);

-- ─── AUDIT LOG (bitácora de trazabilidad) ───────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id     BIGSERIAL PRIMARY KEY,
  user_id      INT REFERENCES users(user_id),
  action       VARCHAR(60) NOT NULL,   -- login | logout | create_order | approve_order | update_status
  module       VARCHAR(60) NOT NULL,   -- auth | dashboard | equipment | predictions | orders
  entity_type  VARCHAR(60),
  entity_id    VARCHAR(60),
  payload      JSONB,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_log(created_at DESC);

-- ─── OBSERVABILITY (KPIs de modelo y negocio) ────────────────────────
CREATE TABLE IF NOT EXISTS model_metrics (
  metric_id     BIGSERIAL PRIMARY KEY,
  model_version VARCHAR(50),
  metric_name   VARCHAR(60),   -- precision | recall | f1 | auc | false_positives
  metric_value  NUMERIC(10,4),
  window_start  TIMESTAMPTZ,
  window_end    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_kpis (
  kpi_id       BIGSERIAL PRIMARY KEY,
  kpi_name     VARCHAR(80),   -- downtime_avoided_h | cost_savings_eur | availability
  kpi_value    NUMERIC(14,4),
  period_start TIMESTAMPTZ,
  period_end   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Idempotencia de la observabilidad (H.5) ─────────────────────────
-- Un snapshot se identifica por (model_version, metric_name, window_start) y un KPI por
-- (kpi_name, period_start): repetir la sincronización dentro del mismo cubo de tiempo
-- ACTUALIZA la fila en lugar de duplicarla (los syncs anclan la ventana a la hora en curso).
CREATE UNIQUE INDEX IF NOT EXISTS uq_model_metrics_snapshot
  ON model_metrics(model_version, metric_name, window_start);
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_kpis_period
  ON business_kpis(kpi_name, period_start);

-- ─── TRIGGERS updated_at ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_updated ON equipment;
CREATE TRIGGER trg_equipment_updated
  BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON maintenance_orders;
CREATE TRIGGER trg_orders_updated
  BEFORE UPDATE ON maintenance_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
