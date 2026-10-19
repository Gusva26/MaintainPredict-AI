# API REST — MaintainPredict AI

Todas las respuestas exitosas siguen el formato:
```json
{ "data": { ... }, "explanation": { "what": "...", "how": "...", "decision": "..." } }
```
Los errores:
```json
{ "error": "Mensaje", "details": { ... } }
```
Autenticación: cookie `mp_access` (JWT) o header `x-internal-token` (n8n).

## Autenticación

### POST /api/auth/login
Body: `{ email, password }` · Público · **Establece cookies** `mp_access` y `mp_refresh`.

### POST /api/auth/logout
Sin body · Autenticado · **Limpia cookies** + auditoría.

### GET /api/auth/me
Sin body · Autenticado · Devuelve `{ id, email, name, role }`.

### POST /api/auth/refresh
Sin body · Cookie refresh · Emite nuevo access.

### POST /api/auth/change-password
Autenticado · Body: `{ current_password, new_password }` · Aplica la **política de contraseñas**
(mínimo 10 caracteres con mayúscula, minúscula, dígito y símbolo, sin espacios; máx. 72).
Valida la contraseña actual (401 si no coincide), exige que la nueva sea distinta (422) y
reemite las cookies de sesión para no expulsar al usuario.

## Sensores

### GET /api/sensors
Permiso: `equipment:read` · Query: `page, pageSize, equipment_id, type, status, q` · Listado paginado con el equipo de cada sensor.

### POST /api/sensors
Permiso: `equipment:write` · Body: `{ equipment_id, type, unit?, status?, min_threshold?, max_threshold? }` ·
`min_threshold` debe ser menor que `max_threshold`.

### POST /api/sensors/data
Headers: `x-sensor-key: <SENSOR_API_KEY>` · Body: `{ sensor_id, value, recorded_at? }` · **Rate limit 600/min**.
Fuera de rango `[min_threshold, max_threshold]` ⇒ `quality="suspect"`.

### GET /api/sensors/:id
Permiso: `equipment:read` o header `x-internal-token` · Devuelve `{ sensor, lastReadings }`.
`sensor.equipmentId` resuelve `sensor_id → equipment_id` (lo usa **WF-01** cuando el webhook solo recibe
`{ sensor_id, value }`).

## Equipos

### GET /api/equipment
Permiso: `equipment:read` · Query: `page, pageSize, q, type, criticality, status, sort, order`.

### POST /api/equipment
Permiso: `equipment:write` · Body: `{ name, type, location?, criticality, installationDate?, downtimeCostEurH? }`.

### GET /api/equipment/:id
Permiso: `equipment:read` · Devuelve `{ equipment, sensors, lastReadings, lastPredictions }`.

### PUT /api/equipment/:id
Permiso: `equipment:write` · Actualización parcial: `{ name?, type?, location?, criticality?, installation_date?, status?, downtime_cost_eur_h? }`.

### POST /api/equipment/:id/sensors
Permiso: `equipment:write` · Alta de un sensor colgado de este equipo: `{ type, unit?, status?, min_threshold?, max_threshold? }`.

## Predicciones

### GET /api/predictions
Permiso: `predictions:read` · Query: `page, pageSize, equipment_id, min_prob, since, component`.

### GET /api/predictions/:id
Permiso: `predictions:read` · Devuelve `{ prediction, equipment, orders, hasOrder }` con `alert`
(`failure_probability > 0.70`) y las órdenes derivadas.

### POST /api/predict
Permiso: `predict:run` · Body: `{ equipment_id }` · Ejecuta **PredictorAgent** (ML + RAG + LLM).
Respuesta: `{ prediction_id, failure_probability, window, component, model_version, explanation, top_features, rag_sources, alert }`.

## Órdenes

### GET /api/orders
Permiso: `orders:read` · Query: `page, pageSize, status, equipment_id, technician_id, priority`.

### GET /api/orders/:id
Permiso: `orders:read` · Devuelve `{ order, equipment, technician, prediction, approvedBy }`.

### POST /api/orders
Permiso: `orders:create` · Body: `{ equipment_id, prediction_id?, scheduled_date?, technician_id?, parts?, estimated_downtime_h?, priority?, notes? }`.
**Regla HITL**: `estimated_downtime_h > 4` ⇒ status=`pending_approval`.

### POST /api/orders/auto-plan
Permiso: `orders:create` · Body: `{ prediction_id }` · Ejecuta **PlannerAgent** (function calling + RAG).
Devuelve la salida sellada del agente, con la forma de la especificación §5:
```json
{ "order_id": 135, "scheduled_date": "2026-10-20T02:00:00.000Z",
  "technician": "Marta Técnica", "technician_id": 5, "technician_name": "Marta Técnica",
  "parts": [{ "sku": "BRG-6205", "qty": 12 }], "estimated_downtime_h": 3,
  "priority": "medium", "requires_hitl": false, "status": "planned",
  "reasoning": "…", "rag_sources": [{ "doc_id": 3, "title": "…", "similarity": 0.67 }] }
```
- `status` y `requires_hitl` los decide el **código**, nunca el LLM: la herramienta `schedule_order`
  aplica la regla HITL (parada > 4 h) y valida técnico, ventana de parada y repuestos.
- `order_id` llega `null` desde el agente y se sella con el id real al insertar la orden.
- Si el LLM falla (clave inválida, cuota, timeout) el plan se genera igualmente en modo determinista.

### POST /api/orders/:id/approve
Permiso: `orders:approve` · Sin body · Solo si status=`pending_approval`.

### PUT /api/orders/:id/complete
Permiso: `orders:complete` · Body: `{ notes?, photos?, false_positive? }` · Técnico solo sus órdenes.
Permite completar desde `planned`, `approved` o `in_progress`; `completed`/`cancelled` devuelven 409.

### PUT /api/orders/:id/start
Permiso: `orders:complete` · Sin body · `planned`/`approved` → `in_progress`; técnico solo sus órdenes.
Idempotente sobre una orden ya en curso. Registra `start_order` en auditoría. `pending_approval` devuelve 409.

## Agentes (resiliencia)

| Variable | Defecto | Efecto |
|---|---|---|
| `AGENT_TIMEOUT_MS` | `8000` | Corte por intento de cada llamada al microservicio ML. |
| `AGENT_RETRIES` | `2` | Reintentos adicionales del ML (2 ⇒ 3 intentos) con backoff de 250/500 ms. |
| `LLM_TIMEOUT_MS` | `20000` | Corte de cada llamada al LLM. El LLM **no** se reintenta: si falla, se usa el respaldo. |

Un proveedor caído nunca rompe la petición: el predictor cae a su heurística analítica y el plan a su
versión determinista, ambos con la misma forma de salida.

```bash
npm run agents:check                                   # diagnóstico de los dos agentes
docker compose exec -T -e OPENAI_API_KEY=sk-invalida web \
  sh -lc 'cd /app/apps/web && npm run agents:check'     # fuerza el respaldo del LLM
```

## Dashboard

### GET /api/dashboard/kpis
Permiso: `equipment:read` · Devuelve el **último valor** de cada KPI de negocio y métrica del modelo, más contadores operativos:
```json
{ "businessKpis": { "downtime_avoided_h": 12, "cost_savings_eur": 5400, "availability": 0.98 },
  "modelMetrics": { "precision": 0.86, "recall": 0.79, "f1": 0.82 },
  "counts": { "equipment": 2500, "equipmentDown": 3, "alertsLast7d": 12, "ordersOpen": 40, "ordersPendingApproval": 3 },
  "byStatus": { "equipment": {…}, "orders": {…} },
  "targets": { "precision": 0.85, "downtime_reduction": 0.6, "cost_reduction": 0.3, "availability": 0.995 } }
```
Portada del Dashboard: evita descargar el reporte semanal completo para pintar 4 tarjetas.

## Usuarios

### GET /api/users
Permiso: `users:manage` · Query: `page, pageSize, role, is_active, q` · **Nunca** devuelve `password_hash`.

### POST /api/users
Permiso: `users:manage` · Body: `{ email, full_name, role, password, phone? }` · 409 si el email ya existe ·
`password` se valida con la política de contraseñas.

### PATCH /api/users/:id
Permiso: `users:manage` · Body: `{ full_name?, role?, phone?, is_active?, password? }` ·
Un administrador no puede desactivarse ni cambiarse el rol a sí mismo (bloqueo anti-bloqueo).

## Técnicos

### GET /api/technicians
Permiso: `orders:read` · Técnicos ordenados por menor carga de órdenes abiertas
(`planned`, `approved`, `in_progress`). Misma consulta que usa el **PlannerAgent**.

## Reportes

### GET /api/reports/weekly
Permiso: `reports:read` · Query: `start?, end?, equipmentId?, technicianId?, format=json|pdf|xlsx|docx` · **ETag cache**.
- `json` (default): datos agregados + `counts` (qué se ha contado) y `filters` (los aplicados)
- `pdf`: PDF A4 con membrete + 4 tablas
- `xlsx`: Excel con 5 hojas, **todas con autofiltro**
- `docx`: Word con portada + «Qué incluye este informe» + KPIs + 3 tablas

Los filtros `equipmentId` y `technicianId` restringen **órdenes y predicciones** (no las métricas
del modelo ni los KPIs, que son agregados de planta). Un valor no numérico se ignora. El informe
se **cachea en memoria 60 s** por rango+filtros (`REPORT_CACHE_TTL_MS`), lo que además mantiene
estable el `ETag`.

> **Streaming (D7).** Solo el **PDF** se sirve en *streaming*; XLSX y DOCX se generan completos en
> memoria porque sus librerías cierran el ZIP al terminar y no exponen un flujo incremental. Con
> los límites actuales (≤ 200 órdenes y ≤ 100 predicciones de detalle) son unos cientos de KB.

### GET /api/reports/orders/export
Permiso: `orders:read` · Query: `start?, end?, status?, equipment_id?, technician_id?, format=xlsx`.

## Observabilidad

### GET /api/observability/summary
Permiso: `reports:read` · Query: `windowDays=7|30|90`, `fpThreshold?` (0–1).
Devuelve métricas, KPIs y falsos positivos con el umbral configurado
(`FALSE_POSITIVE_THRESHOLD`). Si se pasa `fpThreshold`, añade `falsePositivesSimulated` con el
resultado de ese umbral **sin** cambiar la configuración (simulación desde el panel).

### POST /api/observability/metrics/sync
Permiso: `reports:read` o `x-internal-token` · Body: `{ windowDays?, includeDirtyScan? }`.
Idempotente: el snapshot se ancla a la hora en curso, así que repetirlo en la misma hora
**actualiza** las filas de `model_metrics`/`business_kpis` en lugar de duplicarlas.

### POST /api/observability/dirty-data/scan
Permiso: `equipment:write` · Body: `{ windowHours?, zThreshold? }`.

## RAG / KB

### POST /api/kb
Permiso: `users:manage` (admin) · Body: `{ title, category?, content, metadata? }` · Vectoriza con OpenAI.

## Auditoría

### GET /api/audit
Permiso: `audit:read` (admin) · Query: `page, pageSize, user_id, action, module, since`.

## Uploads

### POST /api/uploads
Permiso: `orders:complete` · multipart/form-data `file` · ≤5 MB, solo imágenes.

## Integraciones

### GET /api/integrations/health
Permiso: `integrations:read` (supervisor, admin) · Sonda en vivo de los 4 adaptadores (ERP, SCADA, SMS, Email).
Devuelve `{ data: { mode, summary: { total, ok, failed[], slowestMs }, adapters: HealthStatus[] } }`, donde cada
`HealthStatus` es `{ kind, adapter, mode, ok, latencyMs, checkedAt, detail? }`. Nunca falla la petición si un
proveedor está caído: se informa con `ok: false`.

## Health

### GET /api/health
Público · Devuelve `{ status, db, timestamp, explanation }` · 200 = web + BD operativas, 503 = BD caída.

## ML Service (interno, no expuesto públicamente)

### POST /ml/predict-failure
Header: `x-api-key: <ML_SERVICE_API_KEY>` · Body: `{ equipment_id, equipment_type?, criticality?, signals: [{type, value, min, max}] }`.

### GET /ml/metrics · GET /ml/health
Header: `x-api-key`.

## Contrato de respuesta

Todas las respuestas JSON usan el sobre `{ data, explanation }`, donde `explanation` es
`{ what, how, decision }` (o `null`). Los endpoints **binarios** (PDF/XLSX/DOCX) no pueden llevar
el sobre sin corromper el fichero, así que exponen la misma información en las cabeceras
`x-explanation-what`, `x-explanation-how` y `x-explanation-decision`.

## Matriz de permisos

| Endpoint | technician | supervisor | planner | admin |
|---|---|---|---|---|
| /api/auth/change-password POST | ✓ | ✓ | ✓ | ✓ |
| /api/equipment GET | ✓ | ✓ | ✓ | ✓ |
| /api/equipment POST | — | ✓ | — | ✓ |
| /api/equipment/:id PUT | — | ✓ | — | ✓ |
| /api/equipment/:id/sensors POST | — | ✓ | — | ✓ |
| /api/sensors GET | ✓ | ✓ | ✓ | ✓ |
| /api/sensors POST | — | ✓ | — | ✓ |
| /api/predictions GET | ✓ | ✓ | ✓ | ✓ |
| /api/predictions/:id GET | ✓ | ✓ | ✓ | ✓ |
| /api/predict POST | — | ✓ | — | ✓ |
| /api/orders GET | ✓ | ✓ | ✓ | ✓ |
| /api/orders/:id GET | ✓ | ✓ | ✓ | ✓ |
| /api/orders POST | — | ✓ | ✓ | ✓ |
| /api/orders/:id/approve | — | ✓ | ✓ | ✓ |
| /api/orders/:id/complete | ✓ | — | — | ✓ |
| /api/orders/:id/start | ✓ | — | — | ✓ |
| /api/technicians GET | ✓ | ✓ | ✓ | ✓ |
| /api/dashboard/kpis GET | ✓ | ✓ | ✓ | ✓ |
| /api/users GET/POST/PATCH | — | — | — | ✓ |
| /api/reports/weekly | — | ✓ | ✓ | ✓ |
| /api/integrations/health | — | ✓ | — | ✓ |
| /api/audit | — | — | — | ✓ |
