# Plan de cierre de brechas — MaintainPredict AI

**Fecha:** 18/10/2026
**Origen:** auditoría del proyecto contra la *Especificación completa — MaintainPredict AI* (18/10/2026 · @Luis).
**Objetivo:** llevar el repositorio al estado descrito por la especificación, sin romper lo que ya funciona.

Regla de oro (metodología ya usada en el proyecto): **cada tarea se valida antes de pasar a la siguiente**:

```bash
# Web
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsc --noEmit'
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/vitest run'
bash scripts/smoke-test.sh                      # 27 aserciones
bash scripts/check-links.sh                     # 80: navegación, matriz de rutas por rol y 404 de fichas
# n8n
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
docker compose exec -T n8n n8n update:workflow --all --active=true && docker compose restart n8n
# BD
docker compose exec -T postgres psql -U mp_user -d maintainpredict -f -
```

> [!IMPORTANT]
> Nota sobre `tsc`/`vitest`: dentro del contenedor hay que usar `./node_modules/.bin/...` (el `npx` del contenedor
> resuelve al binario equivocado). Tras cambiar variables de entorno: `docker compose up -d --force-recreate <svc>`.

---

## Estado de ejecución

**Decisiones tomadas (18/10/2026)**

| # | Decisión |
|---|---|
| D1 | **Sí**: los seeds se reescribirán a las cifras de la spec, con `reset-db.sh` + backup previo. |
| D2 | **LSTM ligero con PyTorch (CPU)** sobre ventanas de lecturas, en ensemble con el RandomForest. |
| D3 | Se mantienen `window_*`/`period_*` y se documenta la equivalencia con `ventana`/`periodo`. |
| D4 | El particionado de `readings` se deja escrito y se aplica al superar 10 M de filas. |
| D5 | Se mantiene el service worker manual (sin `next-pwa`) y se documenta la desviación. |
| D6 | 5 adaptadores: `erp-http`, `scada-http`, `sms-mock-gateway` (+ variante `log`), `sms-twilio`, `email-smtp`. |
| D7 | El streaming se mantiene en PDF y se documenta la limitación de XLSX/DOCX. |
| D8 | Se aplica la política de contraseña ≥10 con complejidad. |
| — | **`git init` queda aplazado** a petición del usuario (la tarea 0.1 no se ejecuta todavía). |

**Progreso**

| Fase | Estado | Notas |
|---|---|---|
| 0 — Preparación | ✅ Completada (salvo 0.1) | `backup-db.sh`, `restore-db.sh` y `reset-db.sh` hechos; baseline validada (`tsc` 0 errores, vitest 41/41, humo 18/18). **0.1 (`git init`) aplazado a petición del usuario.** |
| A — Objetos de BD | ✅ Completada | `03_views.sql` (5 vistas + 2 vistas materializadas), `04_functions.sql` (7 funciones), `05_procedures.sql` (6 procedimientos) y la tabla `maintenance_orders_archive`; más `btree_gin` y `pg_stat_statements` (con `shared_preload_libraries` en los dos compose). Todo aplicado **en caliente** sobre la base viva. **A.7 hecho**: `lib/rag/retriever.ts` usa `fn_kb_search_similar` (verificado con `agents:check`). **A.8 escrito y no aplicado** (D4). Dos desviaciones documentadas: las matviews viven en `03_views.sql` (no en `04_functions.sql`) y `sp_vacuum_hot_tables` hace `ANALYZE` + `scripts/vacuum-db.sh` porque el motor prohíbe `VACUUM` dentro de un procedimiento. `tsc` 0 · vitest **84/84** · humo **27/27** · `check-links` **80/80** · escrituras **20/20**. |
| B — Seeds + datasets | ✅ Completada | `02_seed.sql` sustituido por 6 seeds (`06_seed_core` → `11_seed_audit`): **7** usuarios · **500** equipos · **1.516** sensores · **606.096** lecturas (en **7,9 s**) · **800** predicciones · **571** órdenes · **30** docs de KB · **150** métricas · **155** KPIs · **4.830** entradas de bitácora — todas las cifras dentro del ±10 % de la tabla de la spec. Seeds idempotentes y con invariantes comprobadas (HITL ⇔ parada > 4 h; aprobador y fechas coherentes: **0** incoherencias). `data/README.md` (catálogo de 15 datasets) y `scripts/import/` (4 importadores con `--dry-run`; AI4I probado de extremo a extremo). |
| C — Integraciones | ✅ Completada | 5 adaptadores, `/api/integrations/health`, `mock-sms`, `integrations:check`, planner refactorizado. |
| D — Backend | ✅ Completada | 13 endpoints nuevos, política de contraseña, `logAuditSync`, `explanation` al 100 % (cabeceras en binarios) y 35 reglas de `middleware`. 3 fallos reales corregidos. |
| E — Agentes | ✅ Completada | `lib/agents/resilience.ts` (timeout + reintentos + backoff), respaldo del predictor citando el RAG, herramienta `schedule_order` (el código decide el HITL, no el LLM), `order_id`/`technician`/`status` en la salida. 1 bug real de Groq corregido. |
| F — ML (LSTM/SHAP/retrain) | ⬜ Pendiente | |
| G — Frontend | ✅ Completada | 6 páginas nuevas (`/users`, `/sensors`, `/integrations`, `/profile`, `/audit`, `/technician/checklists`), detalle de predicción, estados de Next, shadcn/Radix, accesibilidad con `axe-core` y navegación por rol. `tsc` 0 · vitest **80/80** · humo **27/27** · escrituras **20/20** · enlaces y matriz de rutas **80/80**. |
| H — Reportes/observabilidad | ⬜ Pendiente | |
| I — n8n | ✅ Completada (I.3 e I.4 bloqueadas) | HITL con **dos decisiones**: el correo trae «aprobar» y «rechazar», el endpoint acepta `decision`, y el rechazo deja la orden en `cancelled` sin firmar como aprobador. El *check-parts* del ERP se documenta donde vive (el planner). 4 workflows reimportados, activos y en `success`. Nueva prueba `scripts/e2e-hitl.mjs` (aprobar 14/14, rechazar 15/15). `tsc` 0 · vitest **80/80** · humo **27/27** · `check-links` **80/80**. I.3 e I.4 esperan a H.5 y F.4. |
| J — Infra | ⬜ Pendiente | |
| K — Documentación | ✅ Completo (8 de 8) | Tres tandas: (1) `SEGURIDAD.md` + `TROUBLESHOOTING.md`; (2) `MANUAL_INSTALACION.md` + `MANUAL_USUARIO.md`; (3) `PLAN_PRUEBAS.md` + `PLAN_CALIDAD.md` + diagramas de `ARCHITECTURE.md` + `README.md`. Los 7 hallazgos (H-K1…H-K7) corregidos y con prueba de regresión donde aplica. `tsc` 0 · vitest **84/84** (20 ficheros) · humo **27/27** · `check-links` **80/80** · escrituras **20/20** · 8 documentos con bloques balanceados y 16 enlaces del README sin roturas. |
| L — Calidad medible | ⬜ Pendiente | |

---

## 0. Decisiones previas (bloqueantes)

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | **Seeds**: la spec pide cifras distintas a las actuales (7 usuarios, 500 equipos, 1.600 sensores, 600.000 lecturas, 800 predicciones, 600 órdenes, 30 docs, 150 métricas, 155 KPIs, 5.000 auditorías) | (a) reescribir los seeds a esas cifras → **borra los datos actuales**; (b) mantener las cifras actuales y solo documentar la desviación | **(a)**, con `scripts/reset-db.sh` + backup previo. Requiere confirmación porque es destructivo |
| D2 | **LSTM** en el ML service | (a) implementarlo de verdad (PyTorch CPU, +~1 GB de imagen, +1-2 días); (b) mantener solo RandomForest y eliminar la mención de LSTM de docs/seed; (c) implementar un modelo secuencial ligero (GRU/LSTM en `torch` entrenado con ventanas de lecturas) | **(c)**, o **(b)** si el plazo aprieta. Nunca dejar la mención sin código |
| D3 | **`ventana` / `periodo`** en `model_metrics` / `business_kpis` | (a) renombrar a `ventana`/`periodo`; (b) mantener `window_start/end` y `period_start/end` y documentar | **(b)**: los nombres actuales son mejores; basta documentar la equivalencia |
| D4 | **Particionado de `readings`** | (a) particionar ahora (recrea la tabla + migra datos); (b) dejar la migración escrita y aplicarla al superar 10 M de filas | **(b)**: la spec misma lo condiciona a 10 M de filas |
| D5 | **PWA**: la spec dice `next-pwa` | (a) instalar `next-pwa`; (b) mantener el SW manual actual (`public/sw.js` + `PwaRegister`) | **(b)**: funciona y evita dependencia abandonada; documentar la desviación |
| D6 | **5.º adaptador de integraciones**: la spec dice "interfaces para ERP, SCADA, SMS y Email, con 5 adaptadores" | Definir cuál es el 5.º | **Propuesta**: `erp`, `scada`, `sms`, `email`, `storage` (adjuntos/fotos). Alternativa: ERP real + ERP mock. Confirmar |
| D7 | **Streaming en XLSX/DOCX** | `exceljs`/`docx` no tienen streaming real | Sirven en buffer; documentar la desviación (el PDF sí va en streaming) |
| D8 | **Contraseña de demo** | La spec exige política ≥10 con mayús/minús/dígito/símbolo | Aplicar la política; `Password123!` ya la cumple |

---

## 1. Fase 0 — Preparación

| Tarea | Detalle | Esfuerzo |
|---|---|---|
| 0.1 | `git init` + `.gitignore` revisado (`.env` debe quedar fuera) + commit inicial | S |
| 0.2 | `scripts/backup-db.sh` y `scripts/reset-db.sh` (dump/restore + recrear esquema y seeds) | S |
| 0.3 | Crear `docs/PLAN_CIERRE_BRECHAS.md` (este documento) y enlazarlo desde `HANDOFF.md` | S |
| 0.4 | Congelar baseline: `tsc`, vitest, smoke, `docker compose ps` y guardar la salida en `docs/BASELINE.md` | S |

**Aceptación:** repo inicializado, baseline verde registrada y comandos de backup/reset probados.

---

## 2. Fase A — Objetos de base de datos (spec §3)

Punto de partida: solo había `00_extensions.sql`, `01_schema.sql`, `02_seed.sql`, y faltaban **5 vistas, 2 vistas materializadas, 7 funciones y 6 procedimientos** (había una única función propia, `set_updated_at()`).

| Tarea | Entregable | Detalle | Esfuerzo | Estado |
|---|---|---|---|---|
| A.1 | `00_extensions.sql` | Añadir `btree_gin` y `pg_stat_statements`; en `docker-compose*.yml` añadir `command: postgres -c shared_preload_libraries=pg_stat_statements` | S | ✅ |
| A.2 | `03_views.sql` | 5 vistas: `v_equipment_health` (equipo + última lectura + probabilidad vigente), `v_open_orders` (órdenes no cerradas + técnico + equipo), `v_active_alerts` (predicciones > 0,70 sin orden completada), `v_technician_load` (carga por técnico), **`v_kb_search`** (búsqueda de la KB con vecindad) | M | ✅ |
| A.3 | `04_functions.sql` | Las 7 funciones de la spec: `fn_classify_reading(value, sensor)` (rango → `good/suspect`), `fn_audit(...)` (inserta en `audit_log`), `fn_calculate_kpis(start,end)`, `fn_priority_for(criticality, probability)`, `fn_flag_outliers(sensor_id, window)` (z-score), `fn_kb_search_similar(query_vec, k, category)` (pgvector), `fn_refresh_materialized_views()` | M | ✅ |
| A.4 | `05_procedures.sql` | 6 procedimientos: `sp_refresh_views()`, `sp_purge_old_readings(days)`, `sp_archive_completed_orders(days)`, `sp_recompute_kpis()`, `sp_flag_stale_predictions()`, `sp_vacuum_hot_tables()` | M | ✅ (con desviación, ver abajo) |
| A.5 | `04_functions.sql` → `03_views.sql` | 2 vistas materializadas `mv_daily_kpis` y `mv_equipment_health` + índices únicos (necesarios para `REFRESH ... CONCURRENTLY`) | M | ✅ (movidas de fichero, ver abajo) |
| A.6 | Migración en caliente | Los scripts deben ser **idempotentes** (`CREATE ... IF NOT EXISTS` / `DROP ... IF EXISTS`) y aplicarse sobre la BD existente con `psql -f`; documentar en `docs/DEPLOYMENT.md` | S | ✅ |
| A.7 | Integración (opcional) | Que `lib/rag/retriever.ts` use `fn_kb_search_similar` y que `lib/observability/kpis.ts` pueda leer `mv_daily_kpis` (o dejarlo como está y solo exponer los objetos) | S | ✅ (solo el retriever) |
| A.8 | `readings` particionada | Escribir `infra/postgres/migrations/partition_readings.sql` (RANGE mensual + partición por defecto + migración de datos) y **no aplicarla** hasta superar 10 M de filas (D4) | M | ✅ escrito · **no aplicado** |
| A.9 | `docs/DATA_DICTIONARY.md` | Documentar los objetos nuevos (vistas, matviews, funciones, procedimientos) y la equivalencia `ventana`/`periodo` (D3) | S | ✅ |

**Aceptación:** `\dv`, `\dm`, `\df`, `\dP` muestran los objetos; `SELECT * FROM mv_daily_kpis` funciona tras `CALL sp_refresh_views()`; `tsc` y tests siguen verdes.

**Resultado (19/10/2026).** Cumplida y verificada contra la base viva:

- `\dv` → 5 vistas · `\dm` → 2 vistas materializadas · 7 funciones y 6 procedimientos nuevos.
- `mv_daily_kpis` devuelve 9 días y `mv_equipment_health` 2 500 equipos; `REFRESH MATERIALIZED VIEW CONCURRENTLY` funciona (los índices únicos están).
- Las 7 funciones se ejecutaron con datos reales: `fn_kb_search_similar` da `similarity = 1` al propio documento y ordena el resto; `fn_flag_outliers` encontró 6 anomalías; `fn_calculate_kpis` y `sp_recompute_kpis` coinciden con el panel (3 h evitadas, 4 634,52 € de ahorro, disponibilidad 1,0).
- Los 6 procedimientos se invocaron; `sp_flag_stale_predictions(1)` marcó 3 predicciones (probado dentro de una transacción y deshecho).
- `agents:check` en verde usando `fn_kb_search_similar` de verdad en el RAG.

**Desviaciones (documentadas, no silenciadas):**

1. **A.5 → `03_views.sql`.** El plan situaba las vistas materializadas en `04_functions.sql`. Se
   movieron a `03_views.sql`: son relaciones, y las funciones y procedimientos de refresco las
   referencian, así que el orden de dependencias queda 03 → 04 → 05.
2. **A.4 · `sp_vacuum_hot_tables` hace `ANALYZE`, no `VACUUM`.** `VACUUM` **no** se puede ejecutar
   desde una función ni un procedimiento (el motor responde `VACUUM cannot be executed from a
   function`; no es una limitación transaccional que se salve con `COMMIT`). El procedimiento
   recalcula estadísticas (`ANALYZE`, sí permitido) y el `VACUUM` real vive en el nuevo
   `scripts/vacuum-db.sh`, que lo lanza por psql fuera de toda transacción. Probado: el script
   ejecuta `VACUUM (ANALYZE)` sobre las 7 tablas calientes.
3. **`v_kb_search` usa `word_similarity`, no `similarity`.** Con el operador `%` por defecto
   (umbral 0,3 sobre el texto completo) la búsqueda no devolvía nada: un documento largo diluye
   la puntuación. Comparar la consulta contra la mejor palabra del texto lo arregla; el umbral es
   configurable con `mp.search_min` (0,4 por defecto).


---

## 3. Fase B — Seeds a las cifras de la spec (spec §10)

Punto de partida: todo estaba en un único `02_seed.sql` y las cifras no cuadraban (de hecho creaba 2.500 equipos: `generate_series(1,500)` × 5 tipos).

| Fichero nuevo | Contenido | Cifra objetivo |
|---|---|---|
| `06_seed_core.sql` | usuarios (roles), equipos, sensores | 7 usuarios · 500 equipos · ~1.600 sensores |
| `07_seed_readings.sql` | lecturas con patrones de falla | ~600.000 (30 días × 6 h × ~330 sensores) |
| `08_seed_predictions.sql` | predicciones + órdenes | ~800 predicciones · ~600 órdenes |
| `09_seed_kb.sql` | documentos RAG (manual/histórico/normativa) | 30 documentos |
| `10_seed_observability.sql` | métricas + KPIs | 150 métricas · 155 KPIs |
| `11_seed_audit.sql` | bitácora | ~5.000 entradas |

| Tarea | Detalle | Esfuerzo |
|---|---|---|
| B.1 | Reescribir los 6 seeds con `generate_series` y volumen controlado por variable (`\set` o `:days`) | M |
| B.2 | Rendimiento: `07` debe insertar con `INSERT ... SELECT` (sin `VALUES` fila a fila); estimar < 30 s para 600 k filas | S |
| B.3 | Borrar `02_seed.sql` y ajustar `docker-compose`/CI/`docs` que lo referencien; idempotencia: `ON CONFLICT` donde hay clave única (`users.email`) y guarda `NOT EXISTS` en el resto | S |
| B.4 | `db:seed:users` → 7 usuarios con hash bcrypt real; `db:seed:kb` → 30 documentos vectorizados (Gemini, en lote) | S |
| B.5 | `scripts/reset-db.sh`: `dropdb/createdb` + aplicar `init/*.sql` en orden + `db:seed:users` + `db:seed:kb` | S |
| B.6 | Verificar que el dashboard/observabilidad siguen coherentes con las cifras nuevas (KPIs, top-5, alertas) | S |
| B.7 | `data/` + `data/README.md` (catálogo de datasets: NASA C-MAPSS, AI4I 2020, Azure PdM, CWRU, OSHA/NIOSH, Intel Lab, Mining, Wind SCADA, arXiv, Paderborn/MFPT/MIMII/Loghub/UCI/ASHRAE) con licencia, tamaño, uso y prioridad | M |
| B.8 | `scripts/import/`: `import-ai4i.py`, `import-azure-pdm.py`, `import-cmapss.py`, `import-osha-kb.py`, `README.md` (ruta mínima < 1 h) y `--dry-run`. Incluir la advertencia de la spec (el mapeo de AI4I torque→pressure, tool wear→current es de pruebas) | L |

**Aceptación:** tras `reset-db.sh`, los `COUNT(*)` coinciden con la tabla de arriba (±10 %); smoke 17/17; los reportes y `/observability` muestran datos.

### Resultado (19/10/2026)

Se probaron los seeds primero en una base desechable (`mp_seedtest`) y solo después se
ejecutó `scripts/reset-db.sh` sobre la base real (backup previo del 01:58:24). Cifras reales:

| Tabla | Objetivo (spec) | Real | Desvío |
|---|---|---|---|
| `users` | 7 | 7 | 0 % |
| `equipment` | 500 | 500 | 0 % |
| `sensors` | ~1.600 | 1.516 | −5,3 % |
| `readings` | ~600.000 | 606.096 | +1,0 % |
| `predictions` | ~800 | 800 | 0 % |
| `maintenance_orders` | ~600 | 571 | −4,8 % |
| `kb_maintenance` | 30 | 30 | 0 % |
| `audit_log` | ~5.000 | 4.830 | −3,4 % |
| `model_metrics` | 150 | 150 | 0 % |
| `business_kpis` | 155 | 155 | 0 % |

Los 6 seeds tardan **7,9 s** en total (B.2 pedía < 30 s solo para `07`). Invariantes
comprobadas sobre `maintenance_orders` a **0**: `requires_hitl` ⇔ `estimated_downtime_h > 4`;
ninguna `planned` con HITL; ninguna `approved`/`in_progress`/`completed` sin `approved_by`;
`completed_at` solo en `completed`; y ninguna fecha incoherente (aprobación antes de la
creación, cierre antes de la aprobación o fecha futura).

**Desviaciones y decisiones documentadas**

- **Lecturas (intervalo, no ventana).** El literal de la spec (30 días × cada 6 h × ~1.400
  sensores) da ~168.000 filas, no 600.000. Para cuadrar con la tabla se ajusta el **intervalo**
  (`mp_step_minutes`, 100 min por defecto) en lugar de la ventana de 30 días. Sobreescribible
  desde `psql -v mp_step_minutes=…` o con `SEED_DAYS`/`SEED_STEP_MINUTES` en `reset-db.sh`.
- **Métricas diarias.** `10_seed_observability.sql` genera 30 días × 5 métricas = 150 (la spec
  las ponía cada 6 h, que daría 605), para cuadrar con las 150 de la tabla.
- **Idempotencia.** `ON CONFLICT (email)` en `users`; en el resto, guarda `NOT EXISTS`, porque
  la mayoría de tablas no tienen clave única sobre la que resolver el conflicto.
- **Coherencia con la app.** `requires_hitl = (estimated_downtime_h > 4)` y una orden así nunca
  queda `planned` (pasa a `pending_approval`); `approved_by/at` en todas las que han pasado por
  aprobación; `completed_at` solo en `completed` y posterior a la aprobación. Las fechas derivan
  unas de otras (creación → aprobación +1 d → cierre +2 d).
- **Fechas de las órdenes históricas.** Se calculan en un CTE, no en un `LATERAL` sin
  correlacionar: Postgres evaluaba ese `LATERAL` una sola vez y las 332 órdenes históricas
  salían con la misma parada (5,93 h).
- **Importadores.** Solo los 4 del alcance (B.8). CWRU, Intel Lab, Mining, Wind SCADA, arXiv y
  Loghub quedan catalogados en `data/README.md` como trabajo futuro (formatos `.mat`, audio y
  logs que no aportan al cierre actual).

**Verificación completa con los datos nuevos:** `tsc` 0 errores · vitest 84/84 · humo 27/27 ·
`check-links` 80/80 · aceptación de escrituras 20/20 · `agents:check` OK · `integrations:check`
4/4 OK · `fn_kb_search_similar` devuelve 1,0000 al propio documento y vecinos con sentido
(0,82 / 0,81) · 30/30 documentos de KB vectorizados.

**Desviación de aceptación:** el humo creció de 17 a 27 comprobaciones (se le sumaron las de
las fases A/C/D/E/I), no por un fallo.

---

## 4. Fase C — Módulo de integraciones (spec §5) — *área inexistente*

Hoy no existe `apps/web/lib/integrations/`, no hay adaptadores, ni `/api/integrations/health`, ni mock de SMS; el planner llama al ERP con un `fetch` directo.

| Tarea | Entregable | Detalle | Esfuerzo |
|---|---|---|---|
| C.1 | `lib/integrations/types.ts` | Interfaces `ErpClient`, `ScadaClient`, `SmsClient`, `EmailClient` (+ `StorageClient` si D6) con `health()` y métodos de dominio | S |
| C.2 | `lib/integrations/adapters/http-erp.ts` | Adaptador real del ERP (`ERP_BASE_URL` + `ERP_API_KEY`), con timeout y mapeo de errores | S |
| C.3 | `lib/integrations/adapters/http-scada.ts` | Adaptador SCADA (`SCADA_BASE_URL`) con `getLatestReadings(equipmentId)` | S |
| C.4 | `lib/integrations/adapters/log-sms.ts` + `twilio-sms.ts` | SMS: `SMS_PROVIDER=log` (dev) y stub Twilio documentado | S |
| C.5 | `lib/integrations/adapters/smtp-email.ts` | Email vía SMTP (nodemailer) o delegando en n8n; `SMTP_*` ya existe en `env.ts` | M |
| C.6 | `lib/integrations/index.ts` | Factoría `getIntegrations()` según `.env` (mock vs real: "en producción solo cambian URL y credenciales") | S |
| C.7 | Refactor `lib/agents/planner.ts` | Sustituir el `fetch` directo al ERP por `getIntegrations().erp.checkParts()` | S |
| C.8 | `app/api/integrations/health/route.ts` | `GET` que agrega el estado de los 5 adaptadores (con `explanation` y permiso admin) | S |
| C.9 | `infra/mocks/sms/server.js` | Mock de SMS (Express, puerto 9002, `/sms/send` + log) y servicio `mock-sms` en `docker-compose.yml` con volumen `mock_sms_nm` | S |
| C.10 | `.env` / `.env.example` | `SMS_*`, `EMAIL_PROVIDER`, `INTEGRATIONS_MODE` (`mock`\|`real`) | S |
| C.11 | Tests | `tests/integrations.test.ts` con los adaptadores en modo mock | S |

**Aceptación:** `/api/integrations/health` devuelve los 5 adaptadores en `ok`; el planner sigue creando órdenes; smoke verde.

---

## 5. Fase D — Backend: endpoints, seguridad y auditoría (spec §7)

Faltan 9 endpoints y 3 requisitos de seguridad/auditoría.

| Tarea | Entregable | Detalle | Esfuerzo |
|---|---|---|---|
| D.1 | `POST /api/auth/change-password` | Sesión + `zod`; valida contraseña actual | S |
| D.2 | `lib/auth/password-policy.ts` | ≥10 caracteres con mayúscula, minúscula, dígito y símbolo; se aplica en cambio de contraseña y en alta/edición de usuarios + tests | S |
| D.3 | `GET/POST /api/sensors` | Listado paginado con filtros (`equipment_id`, `type`, `status`) + alta; permiso `sensors:ingest`/`equipment:write` | M |
| D.4 | `POST /api/equipment/[id]/sensors` | Alta de sensor ligada al equipo | S |
| D.5 | `PUT /api/equipment/[id]` | Edición (`equipment:write`) con `zod` | S |
| D.6 | `GET /api/predictions/[id]` | Detalle con equipo, features y órdenes derivadas | S |
| D.7 | `GET /api/orders/[id]` | Detalle con equipo, técnico, repuestos, predicción y auditoría de la orden | S |
| D.8 | `GET /api/dashboard/kpis` | KPIs para el dashboard (desde `business_kpis`/`mv_daily_kpis`) | S |
| D.9 | `GET/POST /api/users` + `PATCH /api/users/[id]` | CRUD de usuarios (`users:manage`), con política D.2 y sin exponer `password_hash` | M |
| D.10 | `GET /api/technicians` | Listado con carga de órdenes abiertas (hoy la herramienta del planner lo hace por SQL) | S |
| D.11 | `logAuditSync()` | Variante sincrónica en `lib/audit/log.ts` para jobs/scripts (añadir a `db:seed:*` y scripts de import) | S |
| D.12 | `explanation` en el 100 % | Añadirlo a `/api/health` y al export (o documentar la excepción del binario) | S |
| D.13 | `middleware.ts` | Reglas para todas las rutas nuevas hasta ~25 | S |
| D.14 | `docs/API.md` | Documentar los ~34 endpoints con permisos | S |

**Aceptación:** `docs/API.md` y el código coinciden; tests de RBAC por endpoint nuevo; `tsc` verde.

> **Estado: ✅ D.1–D.14 completadas (18/10/2026).** Resultado real: **38 métodos en 33 `route.ts`** y **35 reglas** de
> `middleware`. Desviaciones respecto a lo planeado:
> - D.3: el alta de sensores usa `equipment:write` (no `sensors:ingest`, que es solo admin) para que el supervisor
>   pueda gestionar sus sensores; lectura con `equipment:read`.
> - D.8: los KPIs se leen de `business_kpis`/`model_metrics` (último valor de cada uno); las matviews `mv_*` son de la
>   fase A y aún no existen.
> - D.12: en los binarios (XLSX/PDF/DOCX) la explicación viaja en cabeceras `x-explanation-*`.
> - D.13: se superó el objetivo (35 en vez de ~25) al cubrir también las páginas nuevas.
> - Extra: `lib/db/queries.ts` (consulta y columnas compartidas), `lib/validation/{users,sensors}.ts`,
>   `lib/reports/targets.ts` y `scripts/acceptance-writes.sh` (20 comprobaciones de escritura con limpieza propia).
> - **3 fallos reales corregidos**: anidado de rutas en Next (`[id]/sensors/route.ts`), exports no permitidos en
>   `route.ts` y la trampa de `z.coerce.boolean()` con `is_active=false`.

---

## 6. Fase E — Ajustes de los agentes (spec §5)

| Tarea | Detalle | Esfuerzo |
|---|---|---|
| E.1 | PredictorAgent: **timeout configurable + reintentos** (AbortController/`Promise.race` + backoff) en ML y LLM; nuevas variables `AGENT_TIMEOUT_MS`, `AGENT_RETRIES` | M |
| E.2 | PredictorAgent: el **fallback** también debe citar las fuentes RAG recuperadas (títulos/similitud) | S |
| E.3 | PlannerAgent: añadir la herramienta **`schedule_order`** (crea el borrador de orden y aplica la regla HITL) y dejar `get_production_windows` como consulta interna; renombrar en `TOOLS` (D: confirmar) | M |
| E.4 | Salida del Planner: incluir `order_id` y `technician` (además de `technician_id`/`technician_name`) para cumplir la forma de la spec | S |
| E.5 | Tests de los caminos nuevos (timeout, reintento, `schedule_order`, fallback con RAG) | M |

**Aceptación:** con el LLM caído el plan sigue generándose (fallback) y con timeout el ML no bloquea la petición.

> **Estado: ✅ E.1–E.5 completadas (18/10/2026).** Resultado real y desviaciones:
> - **E.1**: `lib/agents/resilience.ts` (`withTimeout`, `withRetry`, `withLlmTimeout`,
>   `TimeoutError`) + `lib/http/fetch.ts` (se movió `fetchWithTimeout` desde `lib/integrations`
>   porque no es específico de integraciones). El **servicio ML se reintenta** (es interno, rápido y su
>   número es imprescindible); el **LLM solo se corta por tiempo, sin reintentos**, para no encarecer ni
>   retrasar la ruta: si falla, se usa el respaldo al instante. Variables nuevas: `AGENT_TIMEOUT_MS`
>   (8000), `AGENT_RETRIES` (2) y `LLM_TIMEOUT_MS` (20000).
> - **E.2**: el relato de respaldo (`buildFallbackExplanation`, exportada para poder probarla) **cita las
>   fuentes RAG con su similitud**; si no hay documentación recuperada, lo dice explícitamente.
> - **E.3**: herramienta `schedule_order` para el LLM y **una única función de reglas**
>   (`sealDraftOrder`). El LLM *propone*; el **código decide**: `requires_hitl` y `status` nunca se toman
>   del JSON del modelo. `get_production_windows` pasa a consulta interna (las ventanas se le dan como
>   contexto de la petición), así que el LLM gasta menos rondas de herramienta.
> - **E.4**: `PlannerOutput` gana `order_id`, `technician` y `status`. El agente devuelve `order_id: null`
>   (no puede conocer un id que aún no existe) y `sealPlannerOutput()` lo sella con el id real una vez
>   insertada la orden; `/api/orders/auto-plan` ya no recalcula el estado, usa el que viene del agente.
> - **E.5**: `tests/agents.resilience.test.ts` (15 casos) y `scripts/check-agents.ts`
>   (`npm run agents:check`) para validar a mano los tres escenarios.

> [!IMPORTANT]
> **Bug real de interoperabilidad encontrado al validar:** Groq valida los argumentos de las herramientas
> contra el JSON Schema y **rechazaba la petición entera con un 400** (`tool call validation failed:
> /technician_id: expected integer, but got null`) porque el modelo mandaba `technician_id: null` en un
> campo declarado `type: "integer"`. El esquema de `schedule_order` ahora admite `null` en todos los
> campos y no marca ninguno como `required`: el modelo solo propone y `sealDraftOrder()` completa lo que
> falte. Detectado únicamente ejecutando el agente de verdad (el `tsc` y los tests no lo habrían visto).

**Validado (18/10/2026)** con `scripts/check-agents.ts` en tres escenarios reales:

| Escenario | Resultado |
|---|---|
| Normal (ML + LLM reales) | probabilidad 7.7 %, explicación del LLM citando ISO 10816 y SKF 6205, plan con técnico y repuestos del ERP |
| **ML caído** (IP inalcanzable, `AGENT_TIMEOUT_MS=700`, 2 reintentos) | **3 intentos con backoff de 250 y 500 ms** → respaldo analítico (`fallback-heuristic-v1`) sin bloquear la petición |
| **LLM caído** (clave inválida) | 986 ms el predictor (relato de respaldo **citando los 4 documentos RAG**) y 451 ms el plan determinista, con la forma de salida completa |

Y por HTTP: `POST /api/predict` → 201 (predicción 183) · `POST /api/orders/auto-plan` → 201 con
`order_id`, `technician`, `technician_id`, `status`, `requires_hitl`, `scheduled_date` y `parts` ·
camino HITL con equipos críticos: paradas de 5 y 6 h ⇒ `requires_hitl=true` y `status=pending_approval`
(órdenes **136, 137 y 138**) · `tsc` 0 errores · **vitest 67/67** (15 ficheros) · **humo 27/27**.

---

## 7. Fase F — ML service: LSTM, SHAP y reentrenamiento (spec §5)

| Tarea | Detalle | Esfuerzo |
|---|---|---|
| F.1 | **SHAP real**: añadir `shap` a `requirements.txt` y usar `TreeExplainer` sobre el RandomForest para poblar `features` con contribuciones reales (hoy solo son ratios) | M |
| F.2 | **LSTM**: según D2. Si (c): ventana de N lecturas por sensor, `torch` CPU, LSTM pequeño (~50 k parámetros), ensemble RF+LSTM y `model_version = "rf+lstm-v1.0.0"` | L–XL |
| F.3 | `POST /ml/retrain` | Reentrenamiento con muestras etiquetadas; los falsos positivos manuales entran como **negativos**; responde métricas nuevas y versiona el artefacto | M |
| F.4 | Hook de reentrenamiento | `lib/observability/false-positives.ts` dispara `/ml/retrain` cuando FP > 10 % en 7 días (lo notifica WF-04) | M |
| F.5 | Tests `pytest` para SHAP, retrain y (si F.2) LSTM | M |
| F.6 | Corregir el seed `'v1.0.0-rf+lstm'` para que coincida con la versión real del modelo | S |

**Aceptación:** `/ml/metrics` y `/ml/predict-failure` devuelven contribuciones SHAP; `pytest` verde; la versión del modelo del seed coincide con la real.

---

## 8. Fase G — Frontend: páginas, componentes y estados (spec §8)

| Tarea | Entregable | Detalle | Esfuerzo |
|---|---|---|---|
| G.1 | `/predictions/[id]` + `components/predictions/PredictionDetail.tsx` | Detalle con `ProbabilityGauge`, `ComponentView`, features (SHAP) y órdenes derivadas | M |
| G.2 | `/users` | CRUD de usuarios (admin) sobre D.9 | M |
| G.3 | `/sensors` | Listado con filtros, alta y últimas lecturas de cada sensor (supervisor) sobre D.3/D.4. **Sin edición ni borrado**: la API solo expone `GET`/`POST` sobre `/api/sensors` | M |
| G.4 | `/audit` | Tabla de bitácora con filtros (admin) sobre `/api/audit` | M |
| G.5 | `/integrations` | Estado de ERP, SCADA, SMS y Email sobre C.8 | S |
| G.6 | `/profile` | Cambio de contraseña sobre D.1 | S |
| G.7 | `app/error.tsx`, `app/global-error.tsx`, `app/(dashboard)/error.tsx`, `app/not-found.tsx`, `app/technician/loading.tsx` | Estados de Next (hoy no existe ninguno) + **404 real** de las fichas. Sin `loading.tsx` en `app/` ni en `(dashboard)`: su `Suspense` fuerza el 200 y anula el `notFound()` (ver nota) | S |
| G.8 | Ajustes de auditoría | `OrderDetail` → `/api/orders/[id]`, `KPICards` → `/api/dashboard/kpis`, `PredictionList` → enlace al detalle (los 3 sin aplicar) | S |
| G.9 | Enlaces roto | Sidebar/Topbar apuntan a `/audit` (no existía) y `MobileNav` a `/technician/checklists` (no existe): crear la página de checklists o corregir el enlace | S |
| G.10 | `ExplanationFooter` al 100 % | Revisar cada vista con tabla o gráfico (incluye `orders/[id]`, `predictions/[id]`, `/users`, `/sensors`, `/audit`, `/integrations`, `/profile`) | M |
| G.11 | shadcn/ui + Radix | Añadir `components.json` y usar de verdad `dialog`/`dropdown-menu`/`select` en los formularios (hoy solo se importa `react-slot`) | M |
| G.12 | PWA | Según D5: mantener SW manual y **documentar** la desviación, o migrar a `next-pwa` | S |
| G.13 | Accesibilidad WCAG AA | `aria-label` en controles, foco visible, contraste, `lang`, navegación por teclado; auditoría con `axe-core` en tests | M |
| G.14 | Sidebar | Revisar el nº de entradas por rol tras añadir las 6 páginas | S |

**Aceptación:** las 16 rutas de la spec responden 200 con el rol adecuado y 307/403 con el inadecuado; `axe` sin violaciones críticas.

> **G.9 ✅ completada antes del resto de la fase (18/10/2026).** El menú apuntaba a dos páginas que no existían:
> - **`/audit`** (Sidebar + Topbar): el `middleware` ya tenía su regla `audit:read` y el README ya la anunciaba,
>   pero la página nunca se creó. Ahora existe (`AuditTable` con filtros por módulo/acción/rango de fechas y
>   paginación sobre `GET /api/audit`) y **cubre también G.4**.
> - **`/technician/checklists`** (MobileNav): no está en la especificación; se resolvió reutilizando
>   `OrderView` con un filtro `onlyPending` en lugar de duplicar la lógica de completar órdenes.
>
> Nuevo **`lib/audit/catalog.ts`**: catálogo de acciones y módulos para la UI (sin BD ni `next/headers`, para
> poder usarlo en el cliente) con **garantía en tiempo de compilación** de que cubre todo lo que registra
> `log.ts`. Nuevo **`scripts/check-links.sh`**: extrae los `href` de los componentes de navegación y verifica
> que ninguno responde 404, que las fichas `/equipment/:id` y `/orders/:id` cargan y que el técnico recibe
> 307 en `/audit` — **18/18**. Se autoactualiza, así que un enlace nuevo a una página inexistente lo hace
> fallar. `tsc` 0 errores · vitest **70/70** (16 ficheros) · humo **27/27** · escrituras **20/20**.
>
> **No se tocaron** `/users`, `/sensors`, `/integrations` ni `/profile` (G.2, G.3, G.5, G.6): son páginas de
> la spec a las que aún no apunta ningún enlace, así que no hay nada roto.

> **G.1 ✅ detalle de predicción (18/10/2026).** `/predictions/[id]` + `PredictionDetail`: reutiliza
> `ProbabilityGauge` y `ComponentView`, y añade los tres bloques que explican la predicción a partir de
> `predictions.features` (**peso de cada señal**, **lecturas frente a sus umbrales** y **documentación RAG
> citada**), más las **órdenes derivadas** con enlace a su ficha. Degrada bien cuando no hay pesos (la 183,
> con componente `unknown`, lo dice explícitamente en vez de mostrar un panel vacío). **Cierra el tercer
> punto de G.8**: `PredictionList` ya enlaza al detalle (no se hizo antes porque la página no existía).
> Se extrajeron `orderStatusVariant`/`orderPriorityVariant` a `lib/ui/variants.ts` para no duplicar el
> mapeo de colores de `OrderList`. `tsc` 0 errores · vitest **73/73** (17 ficheros) · humo **27/27** ·
> escrituras **20/20** · enlaces **19/19**.
>
> **Resto de la fase G ✅ (18/10/2026).** Las 12 tareas que quedaban, con lo que cambió de verdad:

> **G.2 `/users`** y **G.3 `/sensors`** (`components/users/UserList.tsx`, `components/sensors/SensorList.tsx`):
> listado con filtros (`q`/`role`/`is_active` y `q`/`status`/`equipment_id`), alta en diálogo y, en usuarios,
> rol y activación por fila más restablecimiento de contraseña. **Dos diferencias con lo previsto, por el
> contrato real de la API:** (1) el CRUD de sensores es **alta + listado + detalle de lecturas**, porque
> `POST/PATCH /api/sensors/[id]` no existe (solo `GET`); el detalle reutiliza `GET /api/sensors/:id` para
> mostrar las últimas lecturas al desplegar la fila. (2) Los usuarios se **desactivan**, nunca se borran
> (`FK` de órdenes y auditoría), y la propia API impide auto-desactivarse o auto-cambiarse el rol: la UI
> deshabilita esos controles con el motivo en el `title`.
>
> **G.5 `/integrations`** (`components/integrations/IntegrationsView.tsx`): una tarjeta por adaptador
> (ERP, SCADA, SMS, Email) con modo, estado, latencia y detalle, más el resumen y un botón para reintentar
> (`refreshInterval` de 60 s sobre `GET /api/integrations/health`).
>
> **G.6 `/profile`** (`components/auth/ChangePasswordForm.tsx` + `PasswordChecklist.tsx`): la lista de
> requisitos se genera desde `PASSWORD_RULES`, **la misma fuente que valida el servidor**, así que la UI no
> puede prometer algo distinto de lo que la API acepta (`passwordPolicyErrors`).
>
> **G.7 estados de Next.** `app/global-error.tsx`, `app/error.tsx`, `app/(dashboard)/error.tsx` (mantiene la
> navegación, el raíz no) y `app/not-found.tsx` en español. **Y una retirada deliberada:** no hay
> `app/loading.tsx` ni `(dashboard)/loading.tsx`. Un límite de `Suspense` hace que Next envíe la cabecera
> **200 antes** de resolver la página, y con ello `notFound()` deja de devolver 404: al añadirlos,
> `/equipment/abc` pasó de 404 a **200**. Como el 404 es semántica (monitores, enlaces mal copiados) y no
> cosmética, y las listas ya tienen su esqueleto con `isLoading`, el estado de carga se movió a
> **`app/technician/loading.tsx`**, donde sí aporta (primera pantalla de la PWA en el móvil) y donde no hay
> `notFound()`. `global-error.tsx` usa **estilos en línea a propósito**: sustituye al layout raíz, así que
> `globals.css` no está cargado y los componentes del sistema de diseño saldrían sin estilo.
>
> **404 real de las fichas — se cierra la desviación de G.1.** Nuevo `lib/db/detail-guard.ts`
> (`parseId`, `equipmentExists`, `orderExists`, `predictionExists`): las tres páginas de detalle validan el
> id y **comprueban la existencia en el servidor** antes de renderizar. Antes, `/equipment/999999`
> respondía 200 con un aviso en pantalla. Es una lectura por clave primaria (~1 ms) y a cambio la respuesta
> HTTP dice la verdad: `/equipment/abc`, `/orders/abc`, `/predictions/abc`, `/equipment/999999`,
> `/orders/999999`, `/predictions/999999`, `/equipment/0` y `/orders/-3` dan **404**. El componente de
> cliente conserva su mensaje de error para cuando falla la propia petición (403/500).
>
> **G.8** los tres puntos: `PredictionList` → detalle (cerrado en G.1), `OrderDetail` → `GET /api/orders/:id`
> y `KPICards` → `GET /api/dashboard/kpis`. Los dos últimos **eran bugs, no cosmética**: `OrderDetail` pedía
> las **200 órdenes más recientes** y buscaba la suya en el cliente (con 116 órdenes funcionaba; a partir de
> 200 la ficha se habría quedado vacía), y `KPICards` descargaba **el informe semanal completo** para pintar
> cuatro números. El nuevo `KPICards` añade además los contadores operativos (equipos caídos, alertas de
> 7 días, órdenes abiertas y pendientes de aprobar) enlazados a su listado, y lee los objetivos de la API
> (`KPI_TARGETS`) en vez de duplicarlos.
>
> **G.10 `ExplanationFooter` al 100 %:** las 18 vistas con tabla o gráfico lo tienen, incluida la de error
> del panel y la ficha de orden (que no lo tenía).
>
> **G.11 shadcn/ui:** `components.json` + `components/ui/select.tsx`, `dialog.tsx`, `dropdown-menu.tsx`. Los
> paquetes Radix **ya estaban en `package.json`** (dialog, select, dropdown-menu, label, tabs, toast,
> tooltip) pero **sin usar**: no hubo que instalar nada. Se usan de verdad: filtros y rol con `Select`,
> altas de usuario y sensor en `Dialog` (foco atrapado, `Esc`, `aria-modal`), y el bloque de sesión de la
> barra lateral con `DropdownMenu`. Se añadió el color `popover` a `globals.css` y a `tailwind.config.ts`,
> que Radix necesita para las capas flotantes. Los `<select>` de la tabla de usuarios se dejan nativos a
> propósito: dentro de una celda aportan más que un listbox custom.
>
> **G.12 PWA:** nuevo **`docs/PWA.md`** con la decisión D5, cómo funciona el SW por dentro (precache,
> network-first en `/api`, cache-first en assets), **cómo invalidar** (subir la constante `CACHE`), las
> limitaciones asumidas (sin precache del build, sin escrituras offline, sin Background Sync) y los pasos
> para migrar a `next-pwa` sin tocar componentes.
>
> **G.13 accesibilidad:** `axe-core` como dependencia de desarrollo (`tests/components/a11y.test.tsx`, 5
> casos) exige **cero violaciones críticas o graves** en la tabla de auditoría, el detalle de predicción y
> la paginación; `color-contrast` se desactiva porque jsdom no calcula colores. Además: **enlace «Saltar al
> contenido»** y `tabIndex={-1}` en el `main` del panel y de la app del técnico, **`maximumScale` eliminado**
> del `viewport` (bloqueaba el zoom, WCAG 1.4.4) y la paginación unificada en
> `components/ui/pagination.tsx`: estaba copiada en tres tablas como `<button>` sueltos **sin foco visible**
> ni etiqueta, y ahora es un `<nav aria-label="Paginación de …">` con botones del sistema.
>
> **G.14 barra lateral por rol:** entradas nuevas con `perm` **opcional** (las personales no dependen de un
> permiso, solo de tener sesión) agrupadas en «principal» y «Administración», y el bloque de sesión con
> menú de cuenta. **Dos incoherencias corregidas** al comparar la navegación con las rutas reales: `/sensors`
> exigía `equipment:write` en el menú pero `equipment:read` en el `middleware` (un técnico podía entrar por
> URL y no veía el enlace) — se alinea a `equipment:read` y el alta sigue tras `RoleGuard`; y **`/reports` no
> tenía regla en el `middleware`**, así que un técnico veía el informe semanal de negocio escribiendo la URL
> — se añade `reports:read`.
>
> **Aceptación de la fase:** `scripts/check-links.sh` pasa de 19 a **80 comprobaciones**: la matriz completa
> de las **17 rutas × 3 roles** (admin responde 200 en todas; el supervisor recibe 307 en `/audit` y
> `/users`; el técnico, en `/reports`, `/observability`, `/integrations`, `/audit` y `/users`), las fichas
> dinámicas y los ocho casos de id inválido o inexistente. `tsc` 0 errores · vitest **80/80** (19 ficheros)
> · humo **27/27** · escrituras **20/20** · enlaces y rutas **80/80** · `restos_qa` 0/0.

---

## 9. Fase H — Reportes y observabilidad (spec §9)

| Tarea | Detalle | Esfuerzo |
|---|---|---|
| H.1 | `lib/reports/aggregate.ts`: **filtros por equipo y técnico** + **caché** (TTL en memoria, clave = rango+filtros) | M |
| H.2 | Excel: **autofiltros en las 5 hojas** (hoy en 3) | S |
| H.3 | Word: revisar "portada + KPIs + 3 tablas" (hoy KPI + 3 de datos) y dejar explícito qué se cuenta | S |
| H.4 | Streaming: mantener PDF en streaming y **documentar** la limitación de XLSX/DOCX (D7) | S |
| H.5 | Idempotencia de `metrics.ts` y `kpis.ts`: índice único (`model_version`,`metric_name`,`window_start`) + `onConflictDoUpdate` | M |
| H.6 | `dirty-data.ts`: añadir detección por **IQR** además de rango y z-score; recalcular `flaggedByQuality` (hoy siempre 0) | M |
| H.7 | Falsos positivos: **umbral configurable** (`FALSE_POSITIVE_THRESHOLD`, por defecto 0,70) expuesto en `/observability` con simulación (p. ej. 0,80) | M |
| H.8 | `docs/RISK_STRATEGY.md`: alinear con lo realmente implementado (hoy promete cosas que no existen) | S |

**Aceptación:** el reporte filtrado por equipo devuelve solo ese equipo; dos ejecuciones seguidas de `metrics/sync` no duplican filas.

---

## 10. Fase I — n8n (spec §6)

| Tarea | Detalle | Esfuerzo |
|---|---|---|
| I.1 | WF-02: email HITL con **botón "rechazar"** además de "aprobar" (`reject_url` → `/api/orders/[id]/approve?decision=reject`) | M |
| I.2 | WF-02: nodo **ERP check-parts** explícito (o documentar que vive en el planner) | S |
| I.3 | WF-04: idempotencia real (depende de H.5) | S |
| I.4 | WF-04: alerta de reentrenamiento cuando FP > 10 % en 7 días (depende de F.4) | S |
| I.5 | `docs/N8N_WORKFLOWS.md`: actualizar diagramas y nodos | S |
| I.6 | Reimportar + activar + **ejecutar los 4** y verificar `success` y emails en MailHog | S |

**Aceptación:** los 4 workflows `success`; el email HITL permite aprobar y rechazar; el rechazo deja la orden en `cancelled`.

> **Fase I ✅ cerrada (19/10/2026), con I.3 e I.4 explícitamente bloqueadas.** El HITL deja de ser una decisión
> única: el correo trae **dos botones** y el workflow distingue **tres salidas**.
>
> **I.1 — rechazo de punta a punta.** `POST /api/orders/[id]/approve` acepta ahora `decision=approve|reject`
> (por *query string* o por cuerpo JSON; sin ninguno de los dos se asume `approve`, así ninguna llamada previa
> se rompe). Rechazar lleva la orden de `pending_approval` a **`cancelled`** —estado que **ya existía** en el
> dominio (`OrderStatus`, `resolve()` de los mocks, `orderStatusVariant`), así que no hizo falta migración—, **no**
> rellena `approved_by`/`approved_at` (quien rechaza no firma como aprobador), deja el motivo y el autor en las
> notas de la propia orden y audita `reject_order`, que ya estaba en el catálogo desde la Fase D.
> En WF-02 el email gana `reject_url` y la rama negativa se **separa en dos**: `IF: rechazada` → «Email: HITL
> rechazado» (si alguien decidió) o «Email: HITL expirado» (si venció el Wait), de modo que un rechazo no se
> confunde con una espera agotada. Una sola ejecución de rechazo avisa al supervisor y **no** al técnico, porque
> no hay nada que ejecutar. En la interfaz, `/orders/:id` muestra las dos acciones (el rechazo, destructivo y con
> confirmación explícita) y, si se llega desde el correo, un aviso de qué decisión se venía a tomar.
> **El enlace del email no decide nada por sí solo**: abre la ficha y exige sesión con `orders:approve`, así que un
> correo reenviado no puede cancelar una parada.
>
> **I.2 — el *check-parts* se documenta donde vive, no se duplica.** Ya está en el planner
> (`lib/agents/planner.ts` → `tool_check_parts` → `ErpHttpAdapter`, con degradación al catálogo local si el ERP no
> responde). Se descarta el nodo «ERP check-parts» explícito: las reglas de negocio y los accesos a sistemas se
> quedan en código (versión, tests, auditoría) y n8n aporta la orquestación; duplicarlo daría dos fuentes de verdad
> para el mismo stock.
>
> **I.5/I.6.** `docs/N8N_WORKFLOWS.md` recoge el diagrama de secuencia con las tres salidas, la mecánica del
> `decision` y una trampa que costó un bug real: **todo parámetro de n8n que contenga `{{ … }}` debe empezar por
> `=`**; sin ese prefijo el cuerpo del correo de rechazo viajó al buzón con la expresión sin evaluar. Un escáner
> sobre los 4 ficheros de workflow revisó los 88 parámetros con `{{ }}`: ninguno más estaba afectado.
> Los **4 workflows** se reimportaron y activaron, y terminaron en `success` (WF-01 #36, WF-02 #35, WF-03 #37,
> WF-04 #38) con sus correos en MailHog.
>
> **Nueva prueba `scripts/e2e-hitl.mjs`** (la primera E2E real del HITL): dispara WF-02 de verdad, espera a que la
> orden nazca pendiente, **lee el correo que recibiría el supervisor** —descodificando *quoted-printable*, porque
> MailHog entrega el HTML con `=` como `=3D` y un `grep` directo no encuentra la URL— y resuelve la decisión por la
> misma API que usa la interfaz, con el `resume` real de la espera. Después comprueba estado, notas, auditoría,
> correo de cierre y ejecución de n8n: **aprobar 14/14** y **rechazar 15/15**.
>
> **Aceptación cumplida y verificada:** los 4 workflows `success`; el correo permite aprobar y rechazar; el rechazo
> deja la orden en `cancelled` (órdenes #153 rechazada y #155 aprobada). `tsc` 0 · vitest **80/80** ·
> humo **27/27** · `check-links` **80/80**. Las órdenes creadas por la prueba quedan como datos de demo, según la
> decisión de no limpiar registros de sesión.

---

## 11. Fase J — Infraestructura (spec §11)

| Tarea | Detalle | Esfuerzo |
|---|---|---|
| J.1 | **Backup cifrado**: `pg-backup` con cifrado (gpg AES-256 o `age`), claves por secreto, rotación y restauración documentada y **probada** | M |
| J.2 | `docs/KUBERNETES.md` (o sección en `DEPLOYMENT.md`): notas de despliegue en k8s | S |
| J.3 | Mock de SMS (va con C.9) | S |
| J.4 | `pg_stat_statements` con `shared_preload_libraries` (va con A.1) | S |
| J.5 | `docs/DEPLOYMENT.md`: incluir reset/backup/restore y el checklist actualizado | S |

**Aceptación:** un backup real se restaura en una BD limpia y los datos cuadran.

---

## 12. Fase K — Documentación entregable (spec §13)

| Documento | Contenido | Esfuerzo |
|---|---|---|
| `docs/MANUAL_INSTALACION.md` | Requisitos, instalación rápida y paso a paso, variables, verificación, producción, **problemas comunes** y **desinstalación** (hoy solo parcialmente en `DEPLOYMENT.md`) | M |
| `docs/MANUAL_USUARIO.md` | Acceso, roles, Dashboard, Equipos, Sensores, Predicciones, Órdenes, Reportes, Observabilidad, Auditoría, Usuarios, App Técnico y FAQ | M |
| `docs/PLAN_PRUEBAS.md` | Pirámide 60/30/10, casos, plantillas, pruebas de rendimiento/seguridad/regresión | M |
| `docs/PLAN_CALIDAD.md` | Objetivos y umbrales de la spec §12 + cómo se miden | S |
| `docs/TROUBLESHOOTING.md` | Autenticación, BD, agentes, n8n, reportes, despliegue, integraciones, ML, rendimiento y códigos HTTP | M |
| `docs/SEGURIDAD.md` | Política completa (13 secciones): principios, modelo de amenazas, seguridad de agentes IA, RGPD, gestión de incidentes, checklist | M |
| `docs/ARCHITECTURE.md` | Añadir **`stateDiagram`** de la máquina de estados de la orden (hoy solo texto) y diagrama de despliegue multi-entorno | S |
| `README.md` | Quick start actualizado y enlaces a todos los documentos | S |

**Aceptación:** todos los documentos existen, están enlazados desde el README y no contradicen al código.

**Estado (19/10/2026).** Se entrega en tres tandas:

| Tanda | Documentos | Estado |
|---|---|---|
| 1 | `SEGURIDAD.md`, `TROUBLESHOOTING.md` | ✅ Escritos · validados |
| 2 | `MANUAL_INSTALACION.md`, `MANUAL_USUARIO.md` | ✅ Escritos · pendientes de validación |
| 3 | `PLAN_PRUEBAS.md`, `PLAN_CALIDAD.md`, `ARCHITECTURE.md`, `README.md` | ✅ Escritos · pendientes de validación |

Criterio aplicado: **documentar lo que existe**. `SEGURIDAD.md` incluye una tabla de brechas conocidas (B1–B12)
con archivo y línea, en lugar de afirmar que el sistema cumple todo; `TROUBLESHOOTING.md` solo recoge fallos que
ocurrieron de verdad al levantar el stack; `PLAN_CALIDAD.md` marca en ámbar los objetivos de la spec §12 que aún
**no se miden** (cobertura, p95, auditoría de dependencias, complejidad), en vez de darlos por cumplidos.

Entregables de la tanda 3: `PLAN_PRUEBAS.md` (pirámide real 45/10/27 + 142 comprobaciones de sistema, 18 casos
clave y trazabilidad), `PLAN_CALIDAD.md` (objetivos §12, puertas de calidad, definición de «hecho» y gestión de
defectos), `ARCHITECTURE.md` (§9 `stateDiagram` de la orden, §10 diagrama de despliegue dev/prod y §11 índice de
documentación) y `README.md` (arranque corregido —incluida la importación de n8n que faltaba—, requisitos,
producción, pruebas y **enlaces a los 16 documentos**).

La aceptación de K («todos los documentos existen, están enlazados desde el README y no contradicen al código») se
verifica con la comprobación de estructura y enlaces: **8 documentos, bloques de código balanceados y 16 enlaces
locales del README sin roturas** (las dos referencias «no encontradas» son intencionadas: el ejemplo de estructura
incorrecta de `TROUBLESHOOTING.md` y el `scripts/bench-api.sh` que la fase L.2 tiene que crear).

**Hallazgos detectados al documentar (19/10/2026).** Los **siete** están corregidos y verificados en ejecución:

| # | Hallazgo | Dónde | Estado |
|---|---|---|---|
| H-K1 | Subir una foto desde la app del técnico **completaba la orden** sin esperar al checklist | `components/technician/OrderView.tsx` | ✅ La foto se acumula y viaja en el `PUT /complete`; regresión en `technician-order-view.test.tsx` |
| H-K2 | El estado de sensor `maintenance` que ofrece la UI/API **violaba el `CHECK`** de la base (`active/inactive/faulty`) → el alta fallaba | `lib/validation/sensors.ts:11` vs `infra/postgres/init/01_schema.sql:48` | ✅ `CHECK` ampliado a `active/inactive/maintenance/faulty` (init + `ALTER` en la BD) |
| H-K3 | El filtro de `/orders` no ofrecía `cancelled` | `components/orders/OrderList.tsx` | ✅ Opción añadida; `GET /api/orders?status=cancelled` devuelve 4 órdenes |
| H-K4 | Una orden `cancelled` contaba como «ya existe» y **bloqueaba el auto-plan** de su predicción | `app/api/predictions/[id]/route.ts` | ✅ `hasOrder` ignora las canceladas; verificado con la predicción 157 (solo la #163, cancelada → `hasOrder=false`) |
| H-K5 | `Equipos críticos` ordenaba `criticality` como texto (empezaba por `medium`) | `app/api/equipment/route.ts` | ✅ Orden por severidad con `CASE`; verificado `desc` = critical… y `asc` = low… |
| H-K6 | El pie del gráfico de sensores afirmaba comparar con los umbrales, pero no los dibujaba | `components/equipment/SensorChart.tsx` | ✅ `ReferenceLine` de mín/máx por sensor; regresión en `charts.test.tsx` |
| H-K7 | `in_progress` existía en el modelo pero ninguna ruta lo asignaba | nuevo `app/api/orders/[id]/start/route.ts` | ✅ `PUT /start` (planned/approved → in_progress, idempotente, auditoría `start_order`) + botón en la app del técnico |

Verificación de las correcciones (19/10/2026): `tsc` 0 errores · vitest **84/84** (20 ficheros) · humo **27/27** ·
`check-links` **80/80** · escrituras **20/20**, más las comprobaciones en vivo anteriores (inicio → `in_progress` →
completar, idempotencia, orden de criticidad y `hasOrder` con canceladas). Las órdenes de prueba de la sesión
(#154 completada, #163 cancelada) quedan como registro, según la decisión del 18/10.

Antes de la corrección se tomó un volcado (`infra/postgres/backups/maintainpredict_20261019_011046.sql.gz`) y el
`ALTER` se probó insertando un sensor `maintenance` dentro de una transacción con `ROLLBACK`.

---

## 13. Fase L — Calidad medible (spec §12)

| Tarea | Detalle | Esfuerzo |
|---|---|---|
| L.1 | **Cobertura ≥ 75 %**: `@vitest/coverage-v8`, umbral en `vitest.config` y en `ci.yml`; escribir los tests que falten | L |
| L.2 | **Latencia p95 < 500 ms**: `scripts/bench-api.sh` (o k6) que mida los endpoints principales y publique el resultado | M |
| L.3 | **0 vulnerabilidades HIGH/CRITICAL**: `pnpm audit --audit-level=high`, `pip-audit` y `trivy` en `ci.yml` | M |
| L.4 | **Complejidad ciclomática ≤ 10**: regla `complexity` de ESLint + refactor de las funciones que la superen | M |
| L.5 | **WCAG AA**: `axe-core` en los tests de componentes (va con G.13) | M |
| L.6 | **Disponibilidad ≥ 99,5 %**: healthcheck real en Compose + notas de monitorización | S |

**Aceptación:** CI rojo si no se cumplen los umbrales; informe de resultados en `docs/PLAN_CALIDAD.md`.

---

## 14. Matriz de trazabilidad brecha → fase

| Brecha de la auditoría | Fase |
|---|---|
| 0 vistas / 0 matviews / 7 funciones / 6 procedimientos | A |
| Extensiones `btree_gin`, `pg_stat_statements` | A.1 |
| `readings` sin particionar | A.8 |
| Seeds con cifras incorrectas (5 vs 7 usuarios, 60 k vs 600 k lecturas…) | B |
| `data/` y `scripts/import/` inexistentes | B.7, B.8 |
| `lib/integrations/`, 5 adaptadores, `/api/integrations/health`, mock SMS | C |
| 9 endpoints faltantes | D |
| Política de contraseña | D.2 |
| `logAuditSync` | D.11 |
| `explanation` en 100 % | D.12 |
| Middleware 20 → ~25 reglas | D.13 |
| Predictor sin timeout/reintentos; fallback sin RAG | E.1, E.2 |
| `schedule_order` inexistente; salida sin `order_id`/`technician` | E.3, E.4 |
| LSTM y SHAP inexistentes; sin reentrenamiento | F |
| 6 páginas y `PredictionDetail` ausentes | G.1–G.6 |
| `error/loading/not-found` ausentes | G.7 |
| 3 ajustes de auditoría sin aplicar; enlaces roto | G.8, G.9 |
| `ExplanationFooter` no al 100 % | G.10 |
| shadcn/Radix sin configurar | G.11 |
| `next-pwa` | G.12 (decisión D5) |
| aggregate sin filtros ni caché; autofiltros 3/5; streaming | H.1, H.2, H.4 |
| metrics/kpis no idempotentes; sin IQR; FP no configurable | H.5–H.7 |
| Email HITL sin "rechazar"; idempotencia WF-04 | I.1, I.3 |
| Backup sin cifrar; sin notas k8s | J.1, J.2 |
| Manuales, planes, troubleshooting, política de seguridad, máquina de estados | K |
| Cobertura, p95, vulnerabilidades, complejidad, WCAG | L |
| Repositorio Git | 0.1 |

---

## 15. Orden recomendado (3 olas)

**Ola 1 — "cuadra la spec sin riesgo" (S/M, sin datos en juego) — ✅ completada**
`0` → `C` (integraciones) → `D` (endpoints + seguridad) → `E` (agentes) → `G` (frontend) → `I` (n8n) → `K` (documentación).
Resultado: la API, la UI y los workflows cubren la spec; la BD y los seeds siguen como están.

**Ola 2 — "datos y objetos de BD" (M/L, requiere backup)** — *tras confirmar D1*
`A` (objetos de BD) ✅ → `B` (seeds + datasets) ✅ → **`H`** (reportes/observabilidad) → **`J`** (infra) → **`L`** (calidad).
Lo que queda de la ola es H → J → L, en ese orden.

**Ola 3 — "modelo de IA" (L/XL, requiere confirmar D2)**
**`F`** (LSTM + SHAP + reentrenamiento) → revisión final de la spec completa. Pendiente.

---

## 16. Checklist final de aceptación

- [ ] `tsc --noEmit` = 0 errores · vitest con cobertura ≥ 75 % · `pytest` verde
- [ ] Smoke 27/27 · 8/8 servicios arriba · 4/4 workflows `success`
- [x] 10 tablas + 5 vistas + 2 matviews + 7 funciones + 6 procedimientos + `v_kb_search` *(Fase A)*
- [x] Seeds con las cifras de la spec (desviación documentada y aprobada) *(Fase B)*
- [ ] 34 endpoints y 16 páginas operativos con RBAC correcto
- [ ] `/api/integrations/health` con los 5 adaptadores en `ok`
- [ ] `ExplanationFooter` en todas las vistas con tabla/gráfico
- [ ] `docs/` completo (incluidos manuales, planes, troubleshooting y seguridad)
- [ ] Backup cifrado restaurado con éxito · CI con umbrales de calidad
