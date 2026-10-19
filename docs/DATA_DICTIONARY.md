# Diccionario de Datos — MaintainPredict AI

Este documento describe la estructura relacional, tipos de datos, restricciones y reglas de negocio del sistema de base de datos PostgreSQL con `pgvector`.

---

## 1. `users` (Usuarios y Control de Acceso RBAC)

Tabla principal de autenticación y asignación de roles.

| Campo | Tipo | Nulo | Restricciones | Descripción |
|---|---|---|---|---|
| `user_id` | SERIAL | NO | PRIMARY KEY | Identificador único del usuario |
| `email` | VARCHAR(180) | NO | UNIQUE | Correo electrónico de inicio de sesión |
| `password_hash` | VARCHAR(255) | NO | — | Hash de contraseña con algoritmo bcrypt |
| `full_name` | VARCHAR(200) | NO | — | Nombre y apellidos del usuario |
| `role` | VARCHAR(20) | NO | CHECK (`technician`, `supervisor`, `planner`, `admin`) | Rol para control de acceso RBAC |
| `phone` | VARCHAR(30) | SÍ | — | Teléfono de contacto para alertas por SMS |
| `is_active` | BOOLEAN | SÍ | DEFAULT TRUE | Estado de la cuenta (activo/inactivo) |
| `last_login_at` | TIMESTAMPTZ | SÍ | — | Registro del último inicio de sesión |
| `created_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de registro |
| `updated_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de última actualización |

---

## 2. `equipment` (Activos y Maquinaria Industrial)

Catálogo de activos industriales monitorizados.

| Campo | Tipo | Nulo | Restricciones | Descripción |
|---|---|---|---|---|
| `equipment_id` | SERIAL | NO | PRIMARY KEY | Identificador único del equipo |
| `name` | VARCHAR(200) | NO | — | Código/nombre visible (ej. `EQ-00045-Pump`) |
| `type` | VARCHAR(100) | NO | — | Tipo de máquina (`Pump`, `Motor`, `Compressor`, `Conveyor`, `CNC`) |
| `location` | VARCHAR(200) | SÍ | — | Ubicación física (Planta / Línea de producción) |
| `criticality` | VARCHAR(20) | NO | CHECK (`low`, `medium`, `high`, `critical`) | Nivel de criticidad para el proceso productivo |
| `installation_date`| DATE | SÍ | — | Fecha de puesta en marcha |
| `status` | VARCHAR(20) | SÍ | CHECK (`operational`, `maintenance`, `down`, `retired`) | Estado operativo actual |
| `downtime_cost_eur_h` | NUMERIC(10,2) | SÍ | DEFAULT 0 | Coste estimado por hora de parada no planificada |
| `created_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de registro |
| `updated_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de última modificación |

---

## 3. `sensors` (Sensores de Telemetría)

Instrumentación montada sobre cada equipo.

| Campo | Tipo | Nulo | Restricciones | Descripción |
|---|---|---|---|---|
| `sensor_id` | SERIAL | NO | PRIMARY KEY | Identificador único del sensor |
| `equipment_id` | INT | NO | FK `equipment(equipment_id)` ON DELETE CASCADE | Equipo al que pertenece |
| `type` | VARCHAR(50) | NO | — | Magnitud física (`vibration`, `temperature`, `pressure`, `current`, `rpm`) |
| `unit` | VARCHAR(20) | SÍ | — | Unidad de medida (`mm/s`, `°C`, `bar`, `A`, `rpm`) |
| `status` | VARCHAR(20) | SÍ | CHECK (`active`, `inactive`, `maintenance`, `faulty`) | Estado operativo del sensor |
| `min_threshold` | NUMERIC(12,4) | SÍ | — | Umbral mínimo operativo aceptable |
| `max_threshold` | NUMERIC(12,4) | SÍ | — | Umbral máximo antes de disparo de alarma |
| `created_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de alta |

---

## 4. `readings` (Series Temporales de Telemetría)

Valores de muestreo enviados por SCADA o n8n.

| Campo | Tipo | Nulo | Restricciones | Descripción |
|---|---|---|---|---|
| `reading_id` | BIGSERIAL | NO | PRIMARY KEY | Identificador único de la lectura |
| `sensor_id` | INT | NO | FK `sensors(sensor_id)` ON DELETE CASCADE | Sensor que capturó la muestra |
| `value` | NUMERIC(12,4) | NO | — | Valor numérico medido |
| `quality` | VARCHAR(10) | SÍ | CHECK (`good`, `suspect`, `bad`) | Clasificación de calidad (detección de datos sucios) |
| `recorded_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Marca temporal de la captura |

---

## 5. `predictions` (Inferencia Predictiva)

Resultados generados por los modelos de Machine Learning y el PredictorAgent.

| Campo | Tipo | Nulo | Restricciones | Descripción |
|---|---|---|---|---|
| `prediction_id` | SERIAL | NO | PRIMARY KEY | Identificador único de la predicción |
| `equipment_id` | INT | NO | FK `equipment(equipment_id)` ON DELETE CASCADE | Equipo analizado |
| `component` | VARCHAR(100) | SÍ | — | Componente en riesgo (`bearing`, `motor`, `pump`, `valve`, `belt`) |
| `failure_probability`| NUMERIC(4,3) | NO | CHECK (0.000 a 1.000) | **Probabilidad de falla. Alerta si > 0.700** |
| `window_days` | INT | SÍ | — | Horizonte temporal de falla (por defecto 7 días) |
| `model_version` | VARCHAR(50) | SÍ | — | Versión del modelo ML empleado |
| `explanation` | TEXT | SÍ | — | Explicación en lenguaje natural generada por el agente IA |
| `features` | JSONB | SÍ | — | Importancia de características (valores SHAP / pesos) |
| `created_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de inferencia |

---

## 6. `maintenance_orders` (Órdenes de Mantenimiento)

Órdenes de trabajo generadas de forma automática o manual.

| Campo | Tipo | Nulo | Restricciones | Descripción |
|---|---|---|---|---|
| `order_id` | SERIAL | NO | PRIMARY KEY | Identificador único de la orden |
| `equipment_id` | INT | NO | FK `equipment(equipment_id)` | Equipo a intervenir |
| `prediction_id` | INT | SÍ | FK `predictions(prediction_id)` | Predicción que originó la orden |
| `scheduled_date` | TIMESTAMPTZ | SÍ | — | Fecha y hora planificada |
| `technician_id` | INT | SÍ | FK `users(user_id)` | Técnico asignado |
| `parts` | JSONB | SÍ | DEFAULT `'[]'` | Lista de repuestos necesarios con SKUs y cantidades |
| `estimated_downtime_h` | NUMERIC(6,2) | SÍ | — | Horas estimadas de parada de la máquina |
| `status` | VARCHAR(20) | SÍ | CHECK (`planned`, `pending_approval`, `approved`, `in_progress`, `completed`, `cancelled`) | Estado de la orden |
| `priority` | VARCHAR(10) | SÍ | CHECK (`low`, `medium`, `high`, `critical`) | Prioridad según criticidad y probabilidad |
| `notes` | TEXT | SÍ | — | Observaciones del planificador o del agente |
| `requires_hitl` | BOOLEAN | SÍ | DEFAULT FALSE | **Human-In-The-Loop: TRUE si estimated_downtime_h > 4h** |
| `approved_by` | INT | SÍ | FK `users(user_id)` | Supervisor que autorizó la parada prolongada |
| `approved_at` | TIMESTAMPTZ | SÍ | — | Momento de la aprobación |
| `completed_at` | TIMESTAMPTZ | SÍ | — | Momento del cierre por el técnico |
| `created_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de actualización |

### 6.1 `maintenance_orders_archive` (archivo de órdenes cerradas)

Mismas columnas que `maintenance_orders` más `archived_at`. La rellena
`sp_archive_completed_orders()` con las órdenes `completed`/`cancelled` antiguas, para que la
tabla viva no crezca sin límite. **Sin claves foráneas a propósito**: una fila archivada debe
sobrevivir al borrado de su equipo, técnico o predicción. Rango de fechas de archivado, no de
consulta diaria.

---

## 7. `kb_maintenance` (Base de Conocimiento y RAG)

Artículos técnicos, manuales y normativas vectorizados para Retrieval-Augmented Generation.

| Campo | Tipo | Nulo | Restricciones | Descripción |
|---|---|---|---|---|
| `doc_id` | SERIAL | NO | PRIMARY KEY | Identificador único del documento |
| `title` | VARCHAR(300) | NO | — | Título del manual o procedimiento |
| `category` | VARCHAR(80) | SÍ | — | `manual`, `historico_falla`, `normativa` |
| `content` | TEXT | NO | — | Contenido técnico o extracto |
| `metadata` | JSONB | SÍ | DEFAULT `'{}'` | Metadatos (tipo de equipo, componente, norma) |
| `embedding` | VECTOR(1536) | SÍ | Índice `ivfflat (lists=100)` | Vector de embedding del RAG (`gemini-embedding-001`, 1536 dims; antes `text-embedding-3-small`) |
| `created_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha de inserción |

---

## 8. `audit_log` (Bitácora de Trazabilidad y Seguridad)

Registro inmutable de acciones realizadas en el sistema.

| Campo | Tipo | Nulo | Restricciones | Descripción |
|---|---|---|---|---|
| `audit_id` | BIGSERIAL | NO | PRIMARY KEY | Identificador del log |
| `user_id` | INT | SÍ | FK `users(user_id)` | Usuario responsable de la acción |
| `action` | VARCHAR(60) | NO | — | Acción (`login`, `logout`, `create_order`, `approve_order`, etc.) |
| `module` | VARCHAR(60) | NO | — | Módulo (`auth`, `equipment`, `orders`, etc.) |
| `entity_type` | VARCHAR(60) | SÍ | — | Entidad afectada (`user`, `equipment`, `order`) |
| `entity_id` | VARCHAR(60) | SÍ | — | ID de la entidad afectada |
| `payload` | JSONB | SÍ | — | Datos modificados o detalles |
| `ip_address` | INET | SÍ | — | Dirección IP del cliente |
| `user_agent` | TEXT | SÍ | — | Agente de navegación del usuario |
| `created_at` | TIMESTAMPTZ | SÍ | DEFAULT NOW() | Fecha y hora exacta del suceso |

---

## 9. `model_metrics` y `business_kpis` (Observabilidad)

Tablas para auditoría de precisión de los modelos ML y KPIs de negocio.

* **`model_metrics`**: Guarda `precision`, `recall`, `f1`, `auc`, `false_positives` con ventanas temporales.
* **`business_kpis`**: Guarda `downtime_avoided_h`, `cost_savings_eur` y `availability`.

---

## 10. Vistas (`infra/postgres/init/03_views.sql`)

Vistas de lectura creadas en la Fase A. No guardan datos: son consultas con nombre.
Se pueden usar desde SQL, desde los informes y desde grafana/cualquier cliente.

| Vista | Qué devuelve | Detalle |
|---|---|---|
| `v_equipment_health` | Equipo + su última lectura + su predicción más reciente + un campo calculado `health` (`alert` / `watch` / `ok` / `unknown`) | Una fila por equipo |
| `v_open_orders` | Órdenes no cerradas (`status NOT IN ('completed','cancelled')`) con equipo y técnico | Una fila por orden abierta |
| `v_active_alerts` | Predicciones `> 0.70` **sin** ninguna orden completada, con el estado de su última orden | Es la definición de «falso positivo auto» que usa `lib/observability/kpis.ts` |
| `v_technician_load` | Carga por técnico activo: órdenes abiertas, en espera de aprobación, con vencimiento hoy y horas de parada acumuladas | El orden coincide con el que consume el planner (menos carga primero) |
| `v_kb_search` | Búsqueda léxica de respaldo sobre la KB con `pg_trgm` | Necesita `SET mp.search_query = '…'`; umbral configurable con `mp.search_min` (def. 0,4) |

```sql
-- Ejemplos
SELECT * FROM v_equipment_health WHERE health = 'alert' ORDER BY failure_probability DESC;
SELECT * FROM v_active_alerts ORDER BY failure_probability DESC;
SET mp.search_query = 'rodamiento';
SELECT doc_id, title, round(score::numeric, 3) FROM v_kb_search ORDER BY score DESC;
```

## 11. Vistas materializadas (`03_views.sql`)

A diferencia de las vistas, **sí guardan** el resultado y hay que refrescarlas. Ambas tienen
índice único (obligatorio para `REFRESH … CONCURRENTLY`).

| Vista materializada | Contenido | Clave única |
|---|---|---|
| `mv_daily_kpis` | Serie diaria: órdenes creadas/completadas/canceladas, predicciones, alertas, probabilidad media y lecturas | `day` |
| `mv_equipment_health` | Foto de `v_equipment_health` + `refreshed_at` | `equipment_id` |

```sql
CALL sp_refresh_views();                                   -- refresco normal (bloquea)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_kpis;      -- sin bloquear la lectura
```

## 12. Funciones (`04_functions.sql`)

| Función | Devuelve | Qué hace |
|---|---|---|
| `fn_classify_reading(value, sensor_id)` | `good` / `suspect` | Compara el valor con `min_threshold`/`max_threshold` del sensor. Sin umbrales → `good` |
| `fn_audit(user_id, action, module, entity_type, entity_id, payload, ip, ua)` | id de la fila | Inserta en `audit_log`. Para disparadores y procedimientos que no usan el logger de TypeScript |
| `fn_calculate_kpis(inicio, fin)` | una fila con 9 KPIs | **Copia exacta** de `syncBusinessKpis()`: paradas evitadas, ahorro, disponibilidad, falsos positivos auto y manual |
| `fn_priority_for(probabilidad, criticidad)` | prioridad | **Copia exacta** de `sealDraftOrder()`: `>0.9 → critical`, `>0.7 → high`, resto `medium`. La criticidad se acepta pero hoy no altera el resultado |
| `fn_flag_outliers(sensor_id, ventana)` | lecturas anómalas | z-score > 3 respecto a la media de la ventana (por defecto 7 días) |
| `fn_kb_search_similar(vector, k, categoria)` | documentos con `similarity` | Búsqueda semántica pgvector (`1 - distancia coseno`). La usa `lib/rag/retriever.ts` |
| `fn_refresh_materialized_views()` | — | Refresca las dos vistas materializadas (sin `CONCURRENTLY`: no está permitido dentro de una función) |

## 13. Procedimientos (`05_procedures.sql`)

Se invocan con `CALL` y emiten un `NOTICE` con lo que han hecho.

| Procedimiento | Parámetro | Efecto |
|---|---|---|
| `sp_refresh_views()` | — | Refresca `mv_daily_kpis` y `mv_equipment_health` |
| `sp_purge_old_readings(dias)` | 90 | Borra de `readings` lo anterior a N días |
| `sp_archive_completed_orders(dias)` | 365 | Mueve órdenes cerradas antiguas a `maintenance_orders_archive` |
| `sp_recompute_kpis(dias)` | 7 | Recalcula KPIs y los escribe en `business_kpis` (idempotente por ventana) |
| `sp_flag_stale_predictions(dias)` | 3 | Marca en la bitácora (`flag_stale_prediction`) las alertas `> 0.70` sin planificar. Idempotente |
| `sp_vacuum_hot_tables()` | — | `ANALYZE` de las tablas calientes. El `VACUUM` real lo hace `scripts/vacuum-db.sh`: el motor lo prohíbe dentro de una función o procedimiento |

## 14. Convención de nombres: `window_*` y `period_*` (decisión D3)

En el esquema conviven dos prefijos para lo mismo —una ventana de tiempo— y **se mantienen**
tal cual, porque renombrarlos rompería compatibilidad con la especificación §18.4 y con el
código ya escrito:

| Prefijo | Dónde | Significa |
|---|---|---|
| `window_days`, `window_start`, `window_end` | `predictions`, `model_metrics` | Ventana de la predicción o de la métrica |
| `period_start`, `period_end` | `business_kpis` | Ventana del KPI de negocio |

No son dos conceptos distintos: son dos nombres del mismo. Al escribir SQL nuevo, usa el que
corresponda a la tabla y no mezcles ambos en una misma consulta.

## 15. Reglas de Negocio Clave

1. **Umbral de Alerta Predictiva:** Si `failure_probability > 0.70`, se genera alerta y el `PlannerAgent` planifica automáticamente una orden de mantenimiento.
2. **Human-In-The-Loop (HITL):** Si `estimated_downtime_h > 4.0`, la orden queda en estado `pending_approval` y `requires_hitl = TRUE`, enviando notificación al supervisor para su aprobación explícita antes de la ejecución.
3. **Control RBAC:**
   - `technician`: visualiza sus órdenes asignadas y reporta ejecución.
   - `planner`: planifica y edita órdenes, consulta repuestos en ERP.
   - `supervisor`: aprueba paradas prolongadas (HITL), revisa KPIs.
   - `admin`: control total, gestión de usuarios y bitácora de auditoría.

## 16. Datos de ejemplo (seeds de `infra/postgres/init/`)

El sistema arranca con datos realistas de demostración. No vienen de un único `02_seed.sql`
(se eliminó en la Fase B) sino de seis scripts **idempotentes** que el contenedor aplica en
orden la primera vez, con el volumen vacío:

| Script | Tablas que llena | Volumen por defecto |
|---|---|---|
| `06_seed_core.sql` | `users`, `equipment`, `sensors` | 7 usuarios · 500 equipos · ~1.500 sensores |
| `07_seed_readings.sql` | `readings` | ~600.000 lecturas en 30 días |
| `08_seed_predictions.sql` | `predictions`, `maintenance_orders` | ~800 predicciones · ~600 órdenes |
| `09_seed_kb.sql` | `kb_maintenance` | 30 documentos (`embedding` NULL hasta vectorizar) |
| `10_seed_observability.sql` | `model_metrics`, `business_kpis` | 150 métricas · 155 KPIs |
| `11_seed_audit.sql` | `audit_log` | ~5.000 entradas |

Notas de lectura de estos datos:

- **`users`**: el seed SQL inserta el `password_hash` como *placeholder*; `pnpm db:seed:users`
  lo regenera con bcrypt real (7 usuarios demo, ver `README.md`). Por eso el seed SQL no
  depende de bcrypt y es reproducible.
- **`readings`**: el volumen lo controla el intervalo entre lecturas
  (`mp_step_minutes`, 100 min por defecto), no la ventana de 30 días. Se puede sobreescribir
  con `psql -v mp_step_minutes=…` o con `SEED_DAYS`/`SEED_STEP_MINUTES` en `reset-db.sh`. La
  calidad (`quality`) respeta la misma regla que `fn_classify_reading` (§12).
- **`maintenance_orders`**: los seeds respetan las reglas de la §15 — `requires_hitl` es
  exactamente `estimated_downtime_h > 4`, una orden con HITL nunca queda `planned`, las
  aprobadas/en curso/completadas tienen `approved_by`/`approved_at`, y `completed_at` solo
  aparece en `completed` y siempre después de la aprobación.
- **`kb_maintenance`**: los 30 documentos se vectorizan con Gemini mediante `pnpm db:seed:kb`
  (rellena los que tienen `embedding IS NULL`).
- **Datos reales**: para sustituir la semilla por datasets públicos (AI4I 2020, Azure PdM,
  NASA C-MAPSS, OSHA) están los importadores de `scripts/import/` y el catálogo de
  `data/README.md`.
