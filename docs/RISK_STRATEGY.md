# Estrategia de riesgos — MaintainPredict AI (punto 28 de la especificación)

Documento de **lo que está implementado hoy**, con marcas explícitas de lo que queda pendiente.
Criterio de lectura: cada mitigación dice **dónde vive en el código** o, si no existe, se marca
**[pendiente]** indicando de qué fase depende. No se promete nada que la aplicación no haga.

---

## Riesgo 1 — Datos sucios

### Detección

**Implementado** en `apps/web/lib/observability/dirty-data.ts` (`scanDirtyData`). Se lanza:

- Automáticamente cada **6 h** por **WF-04** (`POST /api/observability/metrics/sync` con
  `includeDirtyScan: true`).
- A mano desde `/observability` o con `POST /api/observability/dirty-data/scan`.

Se detectan cuatro motivos, por este orden de prioridad:

1. **Fuera de rango**: `value < min_threshold` o `value > max_threshold` del sensor → `quality='suspect'`.
2. **Outlier por z-score**: `|z| > 3` (configurable) frente a la media/desviación de la ventana del mismo sensor.
3. **Outlier por IQR** (fase H): fuera de `[Q1 − 1,5·IQR, Q3 + 1,5·IQR]`. Detecta colas que el
   z-score no ve cuando la desviación estándar sale inflada por los propios outliers.
4. **Ya marcadas**: las lecturas que llegaron `suspect`/`bad` desde el ingesta se cuentan aparte
   (`flaggedByQuality`) y no se vuelven a marcar.

El panel muestra `flaggedTotal` y el desglose por motivo, y cada escaneo queda en `audit_log`
(`action='ingest_sensor'`, `entity_type='dirty_data_scan'`).

### Mitigación

- Los `suspect` y `bad` **se excluyen** del pipeline de predicción: `/api/predict` descarta toda
  lectura con `quality !== 'good'` (`apps/web/app/api/predict/route.ts`), así que las señales que
  llegan al modelo ya vienen limpias. El clasificador de ingesta está en `fn_classify_reading`
  (`infra/postgres/init/04_functions.sql`) y lo aplica `/api/sensors/data`.

### Escalado

- **[pendiente]** La alerta «un sensor acumula > 20 % de lecturas `suspect` en 7 días» no está
  programada. Es una condición fácil de añadir a WF-04 (ya tiene nodo de decisión y de email).
- **[pendiente]** No hay acción en la UI/API para marcar una lectura como `bad` a mano: el sistema
  solo marca `suspect` automáticamente. `bad` existe en el esquema y lo respeta el pipeline, pero
  hoy no se puede escribir desde la aplicación.

---

## Riesgo 2 — Falsos positivos

### Detección

- **Automática** (por ventana) — `apps/web/lib/observability/false-positives.ts`
  (`detectFalsePositives`): predicción con `failure_probability >= umbral` **sin** orden
  `completed` asociada en la ventana. El resultado se persiste en
  `model_metrics.metric_name='false_positives'`.
- **Manual** (por el técnico): al cerrar una orden se puede marcar «no se encontró falla real»;
  se añade `[FALSO_POSITIVO]` a `maintenance_orders.notes` y se contabiliza como
  `false_positives_manual` (en `business_kpis` y en el panel).

### Mitigación

1. **Umbral configurable** — **implementado (fase H)**: `FALSE_POSITIVE_THRESHOLD` (0,70 por
   defecto) alimenta el cálculo, y desde `/observability` se puede **simular** otro umbral
   (p. ej. 0,80) sin cambiar el despliegue. El panel indica cuál es el valor configurado.
2. **RAG en la explicación**: `PredictorAgent` cita manuales y normativa, así el supervisor puede
   contrastar la lógica antes de aprobar.
3. **HITL**: las predicciones que implican una parada > 4 h exigen aprobación humana, lo que da
   una oportunidad de rechazar un falso positivo antes de intervenir.
4. **Alerta por email**: **implementado**. WF-04 evalúa cada sincronización (cada 6 h) y, si
   `falsePositiveRate > 10 %` (o la precisión < 85 %), envía un correo al supervisor. Ojo: es
   sobre la ventana de 7 días de *esa* ejecución, no «durante 7 días seguidos».
5. **Reentrenamiento automático con datos etiquetados** — **[pendiente]**. Depende de la fase F
   (LSTM + SHAP + reentrenamiento). Hoy no existe ni el reentrenamiento ni el *feedback loop*.
6. **Feedback loop** (usar los FP manuales como muestras negativas) — **[pendiente]**, misma fase F.

### Objetivos

| Indicador | Objetivo | Comprobado en |
|---|---|---|
| Precisión | ≥ 85 % | tarjeta «Precisión» de `/observability` |
| Tasa de FP | ≤ 10 % | tarjeta «Falsos positivos» |
| Recall | ≥ 75 % | tarjeta «Recall» |
| AUC | ≥ 0,90 | tarjeta «AUC» |

---

## Riesgo 3 — Deriva del modelo (drift)

### Detección

- Serie temporal de precisión en `/observability` (últimos 30 snapshots de `model_metrics`).
- **[pendiente]** La comparación de distribución de features entre ventanas consecutivas no está
  implementada; hoy solo se vigilan las métricas agregadas (precisión/recall/F1/AUC/FP).

### Mitigación

- Snapshot periódico de `model_metrics` por WF-04 cada 6 h — **implementado**, e **idempotente**
  (fase H): repetir la sincronización dentro de la misma hora actualiza el mismo registro en lugar
  de duplicarlo (índice único + `ON CONFLICT DO UPDATE`).
- Versionado de modelo: `model_version` en `predictions` y `model_metrics` — **implementado**.
- **[pendiente]** Reentrenamiento automático al caer la precisión: depende de la fase F.

---

## Riesgo 4 — Indisponibilidad de servicios externos

### Detección

- Healthcheck de los cuatro adaptadores con `GET /api/integrations/health`
  (ERP, SCADA, SMS, email) y `GET /api/health` para web + base de datos.

### Mitigación (**implementado**)

- **PredictorAgent**: si el ML service falla → *fallback* heurístico local (desviación > 70 % del span).
- **PlannerAgent**: si el LLM falla → `fallbackPlan` determinista (técnicos, repuestos y ventanas).
- **RAG**: si fallan los embeddings remotos → embedding determinista local de 1536 dimensiones.
- **Adaptadores de integración**: reintentos con *timeout* (`INTEGRATION_TIMEOUT_MS`) y estado
  `degraded` en lugar de romper la petición.
- Errores envueltos con `handleError` y códigos HTTP correctos.

---

## Riesgo 5 — Seguridad

### Mitigación (**implementado**, salvo lo marcado)

- RBAC en `middleware.ts` + `requirePermission`/`requirePermissionOrInternal` por endpoint.
- JWT en cookie httpOnly (8 h acceso / 7 d refresco).
- Bitácora completa en `audit_log` (login, logout, CRUD, aprobaciones, rechazos).
- Validación de entrada con Zod en todos los endpoints.
- **Rate limit** en `/api/sensors/data` por clave de sensor (600 req/min → 429).
- Contraseñas con **bcrypt cost 10** y política de longitud/complejidad.
- **[pendiente]** Endurecimiento de producción: HSTS, secretos en *vault*, rotación periódica de
  `JWT_SECRET`, mTLS con el SCADA y borrado/anonimizado RGPD. Ver `docs/SEGURIDAD.md` (brechas B1–B12)
  y las fases J y L.

---

## Riesgo 6 — Volumen de datos

### Mitigación

- Índices estratégicos: `idx_readings_sensor_t` (sensor, tiempo DESC), `idx_predictions_prob`,
  `idx_orders_status`.
- pgvector con `ivfflat` para el RAG.
- `sp_purge_old_readings(días)` **existe** (90 días por defecto) para podar `readings`, pero
  **[pendiente]** no hay ninguna tarea programada que lo invoque; la política de retención
  definitiva (y su programación) es trabajo de la fase J.
- **[pendiente]** Particionado de `readings` por mes: el script existe
  (`infra/postgres/migrations/partition_readings.sql`) pero **no se ha aplicado** (decisión D4:
  se difiere hasta superar las ~10 M de filas).
