# HANDOFF — MaintainPredict AI

> **Documento de traspaso entre sesiones de IA / desarrolladores.**
> Última sesión de trabajo: **16/10/2026** — **Fases 6, 7, 8 y 9** implementadas y validadas con OpenCode
> (stack dev y **imagen de producción** pasando la prueba de humo 16/16). El roadmap del `.docx` queda cerrado.
> Reconstruido cruzando el **plan maestro `MaintainPredict AI.docx`** (roadmap por Fases 0–9), las fechas de
> modificación y las dependencias entre archivos. El proyecto **no tiene repositorio Git** (`no existe .git`).

**Regla de oro:** al terminar tu trabajo, **actualiza las secciones §2 y §4** de este archivo. Así ninguna
sesión futura tendrá que adivinar dónde se quedó.

---

## 1. Qué es el proyecto

Plataforma de **predicción de fallas industriales** (7 días de anticipación) que genera órdenes de
mantenimiento automáticamente con **arquitectura agéntica** (PredictorAgent + PlannerAgent), **RAG** sobre
manuales/normativa (ISO 9001/45001/10816), **orquestación n8n** y **PostgreSQL 16 + pgvector**.

**Monorepo pnpm:** `apps/web` (Next.js 14), `apps/ml-service` (FastAPI), `packages/shared-types`, `infra/`.

> 📘 **El `.docx` de la raíz es la fuente de verdad del roadmap.** Contiene las Fases 0–9 con el **código
> propuesto completo** de cada una. A 16/10/2026 las **Fases 0–9 están implementadas** y el roadmap queda
> cerrado. Ojo: el código del `.docx` es **aspiracional** y varios fragmentos no compilan tal cual (p. ej. el
> `Dockerfile.prod` de la Fase 9); lo que manda es **lo que está en disco y validado** (ver §2 y §5).

---

## 2. Estado actual (mapa vs. Fases del `.docx`)

| Fase | Contenido | Estado en disco |
|---|---|---|
| **0** | Bootstrap monorepo + Docker Compose + CI base | ✅ Hecho |
| **1** | PostgreSQL DDL + pgvector + seeds + diccionario | ✅ Hecho (`infra/postgres/init/*`, `docs/DATA_DICTIONARY.md`) |
| **2** | Backend Next.js: JWT + RBAC + auditoría + Drizzle | ✅ Hecho (`lib/auth/*`, `lib/db/*`, `middleware.ts`) |
| **3** | APIs REST completas + reglas de negocio + tests | ✅ Hecho (`app/api/**`) |
| **4** | Agentes IA + RAG + ML Service | ✅ Hecho (`lib/agents/*`, `lib/rag/*`, `apps/ml-service`) |
| **5** | Workflows n8n WF-01/02/03 exportables | ✅ Hecho (paso **5.9** 16/10/2026; **WF-01..04 probados E2E** 18/10/2026) |
| **6** | Frontend React/TS: 6 módulos + PWA + tests | ✅ Hecho (16/10/2026) — 51 archivos en `apps/web` |
| **7** | Reportes PDF/Word/Excel + streaming + ETag | ✅ Hecho (16/10/2026) — `lib/reports/*`, `?format=pdf\|xlsx\|docx` |
| **8** | Observabilidad + estrategia de riesgos | ✅ Hecho (16/10/2026) — `lib/observability`, `/api/observability/*`, `/observability` |
| **9** | Documentación + Docker prod + CI/CD + checklist | ✅ Hecho (16/10/2026) — `docs/{ARCHITECTURE,API,DEPLOYMENT}.md`, `infra/caddy/Caddyfile`, `apps/web/Dockerfile.prod`, `.github/workflows/{ci,deploy}.yml` |

**Lo que SÍ existe y funciona hoy:** backend API completo, agentes, RAG, ML service, DB, mocks, los 4
workflows n8n escritos (`WF-01`…`WF-04` — ya **no** quedan "colgando"), el **frontend Next.js completo**
(Fase 6), los **reportes PDF/Word/Excel** (Fase 7), la **observabilidad** (Fase 8) y **toda la Fase 9**
(documentación, Docker de producción con Caddy, CI/CD y checklist).

> ✅ **Proyecto completo (16/10/2026).** El stack dev y la **imagen de producción** (`Dockerfile.prod`,
> `output: standalone`, `NODE_ENV=production`) arrancan y pasan la **prueba de humo 16/16**
> (`scripts/smoke-test.sh` — ver §5). Se cerró además la Fase 9 según el `.docx`.

---

## 3. El punto exacto donde se cortó

> **19/10/2026 — dónde está el proyecto ahora.** Las fases **G** (frontend) e **I** (n8n) están cerradas y
> validadas. La **Fase K (documentación entregable)** está **completa en sus 8 entregables** (pendiente de tu visto
> bueno): `SEGURIDAD.md`, `TROUBLESHOOTING.md`, `MANUAL_INSTALACION.md`, `MANUAL_USUARIO.md`, `PLAN_PRUEBAS.md`,
> `PLAN_CALIDAD.md`, los diagramas de `ARCHITECTURE.md` y el `README.md`. Al documentar aparecieron 7 hallazgos
> (H-K1…H-K7 en `docs/PLAN_CIERRE_BRECHAS.md`) y **los siete están corregidos y verificados en ejecución**: la foto
> ya no cierra la orden, el sensor `maintenance` se puede crear, el filtro de órdenes ofrece `cancelled`, un rechazo
> ya no bloquea el auto-plan, la criticidad se ordena por severidad, el gráfico dibuja los umbrales y `in_progress`
> se alcanza con `PUT /api/orders/:id/start`.
> Validación tras las correcciones: `tsc` 0 errores · vitest **84/84** (20 ficheros) · humo **27/27** ·
> `check-links` **80/80** · escrituras **20/20** · los 8 servicios arriba.
>
> Lo siguiente son las olas: **Ola 2** (**A → B → H → J → L**) y **Ola 3** (**F**,
> LSTM/SHAP/reentrenamiento). Fuera de fase siguen: revocar la clave de OpenRouter comprometida
> y el `git init`, aplazados a petición del usuario.
>
> **19/10/2026 — Fase A (objetos de base de datos) ✅ completada.** Volcado previo tomado:
> `infra/postgres/backups/maintainpredict_20261019_015824.sql.gz` (+ el de n8n). Nuevos
> `03_views.sql` (5 vistas + 2 vistas materializadas), `04_functions.sql` (7 funciones),
> `05_procedures.sql` (6 procedimientos) y la tabla `maintenance_orders_archive`; `btree_gin` y
> `pg_stat_statements` con `shared_preload_libraries` en los dos compose. Todo aplicado en
> caliente y probado con datos reales. `lib/rag/retriever.ts` ya usa `fn_kb_search_similar`
> (A.7, verificado con `agents:check`). `infra/postgres/migrations/partition_readings.sql`
> queda escrito y **sin aplicar** (D4). Tres desviaciones documentadas en el plan: matviews en
> `03_views.sql`, `sp_vacuum_hot_tables` hace `ANALYZE` + `scripts/vacuum-db.sh` (el motor
> prohíbe `VACUUM` en procedimientos) y `v_kb_search` usa `word_similarity`.
>
> **19/10/2026 — Fase B (seeds + datasets) ✅ completada.** `02_seed.sql` se sustituyó por seis
> seeds idempotentes (`06_seed_core` → `11_seed_audit`): 7 usuarios · 500 equipos · 1.516
> sensores · **606.096 lecturas** (7,9 s, `INSERT … SELECT`) · 800 predicciones · 571 órdenes ·
> 30 documentos de KB · 150 métricas · 155 KPIs · 4.830 entradas de bitácora (todo dentro del
> ±10 % de la tabla de la spec). Antes del reset real se validaron en una base desechable
> (`mp_seedtest`) y con las invariantes de la app a 0 (HITL ⇔ parada > 4 h, aprobador y fechas
> coherentes). Desviaciones documentadas en el plan: el intervalo de lecturas pasa a ser la
> variable (`mp_step_minutes`, 100 min) en vez de la ventana, métricas diarias, y guardas
> `NOT EXISTS` en lugar de `ON CONFLICT`. También entraron **`data/README.md`** (catálogo de 15
> datasets con licencia, tamaño, uso y prioridad) y **`scripts/import/`** (4 importadores con
> `--dry-run`; AI4I probado de extremo a extremo contra la base y limpiado después).
> Validación tras B: `tsc` 0 · vitest **84/84** · humo **27/27** · `check-links` **80/80** ·
> escrituras **20/20** · `agents:check` y `integrations:check` OK.
>
> **Lo siguiente, por este orden:** Fase **H** (frontend/páginas que faltan) → **J** (backup
> cifrado, retención, mTLS y el resto de la Ola 2) → **L** (RGPD/borrado) y, por último, la
> **Ola 3** (Fase **F**: LSTM, SHAP y reentrenamiento). Fuera de fase siguen la clave de
> OpenRouter comprometida y el `git init`, aplazados a petición del usuario.
>
> El resto de esta sección es el corte original del **16/10/2026**, conservado como histórico.

La sesión terminó **en la Fase 5 (n8n)**: los archivos más recientes son `docs/N8N_WORKFLOWS.md` (16:52) y
`infra/n8n/workflows/WF-04_metrics-sync.json` (16:51). La Fase 5 se dio por buena, pero **quedaron cabos
sueltos** que la propia Fase 5 debía cerrar:

1. ✅ **Paso 5.9 RESUELTO (16/10/2026)** — se añadieron `APP_BASE_URL`, `INTERNAL_TOKEN`,
   `N8N_WEBHOOK_BASE_URL`, `SUPERVISOR_EMAIL` y `SENSOR_API_KEY` a `.env.example`, `.env` y al
   `environment:` del servicio `n8n` en `docker-compose.yml` (antes faltaban en todos ellos).
2. ✅ **WF-04 RESUELTO (16/10/2026)** — los endpoints que llamaba ya existen (Fase 8):
   `POST /api/observability/metrics/sync` y `POST /api/observability/dirty-data/scan`.
3. ✅ **WF-03 RESUELTO (16/10/2026)** — `app/api/reports/weekly` ahora soporta `?format=json|pdf|xlsx|docx`
   (con `ETag` y streaming), usando `lib/reports/{aggregate,pdf,xlsx,docx}.ts`. Además el middleware deja
   pasar las llamadas internas con `x-internal-token` (si no, WF-01..04 daban 401).
4. ✅ **Bugs corregidos al levantar el stack (16/10/2026)**:
   - **PDF 500**: `pdfkit` quedaba empaquetado por webpack y no encontraba sus fuentes `.afm`
     (`vendor-chunks/data/Helvetica.afm`). Solución: `experimental.serverComponentsExternalPackages: ['pdfkit']`
     en `next.config.mjs`.
   - **SQL crudo con `Date`**: `db.execute(sql\`…\`)` con parámetros `Date` rompía `postgres.js`
     (`ERR_INVALID_ARG_TYPE`) en `lib/observability/{dirty-data,kpis}.ts` → ahora se pasan `.toISOString()`.
   - **`dotenv` faltante**: los scripts de seed lo importan pero no estaba en `apps/web/package.json`.
   - **Login robusto**: `POST /api/auth/login` devolvía 500 con JSON malformado → ahora 4xx
     (`.catch(() => ({}))`).
   - **`docker-compose.yml`**: override para `web` de `DATABASE_URL`/`ML_SERVICE_URL`/`REPORTS_OUTPUT_DIR`/
     `UPLOAD_DIR`; volumen `web_app_node_modules` (el paquete del workspace tiene su propio `node_modules`);
     volúmenes para los `node_modules` de los mocks; `.dockerignore` con `**/node_modules` y `**/.next`.

---

## 4. A dónde seguir (en el orden de las Fases)

### ✅ Fase 6 — Frontend (completada 16/10/2026)
Implementada según el plan (6 módulos + PWA + tests) → **51 archivos nuevos** en `apps/web`. Resumen y desviaciones:

- **Módulos/rutas**: `/login`, `/dashboard`, `/equipment(/[id])`, `/predictions`, `/orders(/[id])`,
  `/reports`, `/observability`, `/audit`, `/technician` y `/technician/checklists`. Root `app/layout.tsx` + `globals.css` (tema shadcn en variables HSL),
  `components/ui/{button,card,badge,table,input}.tsx`, y `ExplanationFooter` en las vistas.
- **PWA — desviación intencional**: en vez de `next-pwa` (legacy y frágil en Next 14) se usó un
  **service worker manual** (`public/sw.js` + `components/PwaRegister.tsx`). `next.config.mjs` **no** se tocó.
  Los iconos `public/icons/*.png` son placeholders generados (reemplazar por reales).
- **Datos**: `lib/api/{client,types}.ts` (fetch tipado + `ApiError` + `fetcher`), hooks `useSession`/`useRbac` (SWR).
- **`middleware.ts`**: rutas públicas PWA ampliadas (`/manifest.json`, `/sw.js`, `/icons/`, `/workbox-*`) y
  **corregido un bucle de redirección** (rol sin permiso de página → `/technician`, antes `/dashboard`).
- **Tests**: `vitest.config.ts` con `environmentMatchGlobs` (jsdom para `tests/components/**`),
  `setupFiles` incluye `tests/setup.dom.ts`, `include` acepta `.tsx`. Deps añadidas a `apps/web/package.json`:
  `@testing-library/{jest-dom,react,user-event}`, `jsdom`.
- **Infra Docker (arreglo necesario, preexistente)**: `apps/web/Dockerfile` no instalaba nada (copiaba solo el
  `package.json` raíz antes de `pnpm install`) y la etapa `builder` no encontraba `next` (en pnpm **cada
  workspace tiene su propio `node_modules`**). Corregido: `deps` copia los manifiestos del workspace;
  `dev`/`builder` copian el `/app` completo desde `deps`. `docker-compose.yml`: servicio `web` con
  `target: dev`, `working_dir: /app/apps/web`, `pnpm install` al arrancar, y volúmenes nombrados
  `web_node_modules`/`web_next`. Eliminado el atributo obsoleto `version:`.
- **Errores de tipos preexistentes corregidos** (impedían `next build`): `lib/agents/planner.ts`
  (`tool_check_parts` infería `any` → se le dio tipo de retorno explícito) y `lib/http/internal-auth.ts`
  (`SYSTEM_USER` no cumplía `AppJwtPayload`: faltaban `name` y `typ`). Y `app/(auth)/login/page.tsx`
  envuelve ahora `LoginForm` en `<Suspense>` (Next 14 lo exige por `useSearchParams`).
- **Validado con Docker** (16/10/2026): `tsc --noEmit` limpio (exit 0) y `next build` OK en la etapa `builder`.

> ⚠️ **Pendiente de validar por el usuario** (el entorno del agente no tiene `node_modules` ni `pnpm`):
> ```bash
> cd apps/web && pnpm install
> pnpm dev                 # http://localhost:3000/login  (admin@mp.ai / Password123!)
> pnpm test -- --run tests/components
> ```

### ✅ Fase 7 — Reportes PDF / Word / Excel + streaming + ETag (completada 16/10/2026)
- `apps/web/lib/reports/{aggregate,pdf,xlsx,docx}.ts` (agregador único para JSON/PDF/XLSX/DOCX).
- `GET /api/reports/weekly?format=json|pdf|xlsx|docx` (ETag → 304, `content-disposition`, streaming del PDF
  de PDFKit) y `GET /api/reports/orders/export?format=xlsx` (export filtrado de órdenes).
- `POST /api/uploads` (fotos PWA, ≤5 MB, solo imágenes) + `GET /uploads/[name]` para servirlas;
  `PhotoUpload` conectado al endpoint real. Nuevas vars `UPLOAD_DIR` y volumen `uploads_data`.
- Cierra **WF-03**. **Validado**: `tsc --noEmit` + `next build` OK.

### ✅ Fase 8 — Observabilidad + estrategia de riesgos (completada 16/10/2026)
- `apps/web/lib/observability/{metrics,kpis,dirty-data,false-positives}.ts` (métricas del modelo →
  `model_metrics`, KPIs de negocio → `business_kpis`, escaneo de datos sucios, detección de falsos positivos).
- Endpoints: `POST /api/observability/metrics/sync` (n8n, `requirePermissionOrInternal(req, 'reports:read')`),
  `GET /api/observability/summary` y `POST /api/observability/dirty-data/scan` → **cierra WF-04**.
- Página `app/(dashboard)/observability/page.tsx` + `components/observability/ObservabilityView.tsx`
  (Recharts + `ExplanationFooter`); entrada en `Sidebar`/`Topbar` y regla `reports:read` para `/observability`.
- `docs/RISK_STRATEGY.md` (riesgo 28: datos sucios, FP, drift, indisponibilidad, seguridad, volumen).
- Cierre de orden marca falso positivo: `false_positive` en `PUT /api/orders/[id]/complete`
  (+ checkbox en `CompletionPanel`). El `WF-04` en disco ya era más completo que el del `.docx`.
- Tests `apps/web/tests/observability.test.ts`. **Validado**: `tsc --noEmit` + `next build` OK (exit 0).

### ✅ Fase 9 — Documentación + producción + CI/CD (completada 16/10/2026)
- **Docs nuevos** (según el `.docx`): `docs/ARCHITECTURE.md` (C4 + secuencia + decisiones),
  `docs/API.md` (endpoints + matriz de permisos) y `docs/DEPLOYMENT.md` (guía + checklist §8).
  `docs/DATA_DICTIONARY.md` y `docs/N8N_WORKFLOWS.md` **ya existían y eran más completos** que el `.docx`
  (10 tablas + RBAC / WF-01..04 + HITL) → no se sobreescribieron.
- **Docker producción**: `apps/web/Dockerfile.prod` (multi-stage, `output: standalone`).
  **Arreglo clave respecto al `.docx`** (era aspiracional y no compilaba):
  - `deps` debe copiar **`pnpm-workspace.yaml`** (si no, pnpm no resuelve el workspace).
  - El `standalone` de un **monorepo** deja el entrypoint en **`apps/web/server.js`** (no en la raíz):
    se ajustó `WORKDIR`/`CMD` y las rutas de `public` → `apps/web/public` y `.next/static` → `apps/web/.next/static`.
  - Se añadieron `wget` (healthcheck) y `tini`, y `HOSTNAME=0.0.0.0`.
- `infra/caddy/Caddyfile` (TLS + HSTS + reverse-proxy a `web:3000` y `n8n:5678`). Añadido `env_file: .env`
  al servicio `caddy` de `docker-compose.prod.yml` (Caddy sustituye `{$APP_DOMAIN}/{$DOMAIN}/{$N8N_HOST_EXTERNAL}`
  desde el entorno; el `.docx` no lo incluía). Quitado el `version:` obsoleto.
- `.github/workflows/ci.yml` actualizado al diseño del `.docx` (jobs `web` + `ml` + `docker`, aplica esquema y
  envs) y nuevo `.github/workflows/deploy.yml` (build & push a ghcr.io; CD SSH comentado).
- `README.md` final (se añadieron rutas principales, estructura y prueba de humo; el resto ya estaba).
- `.env.example`/`.env`: nueva sección de **producción** (`APP_DOMAIN`, `DOMAIN`, `N8N_HOST_EXTERNAL`,
  `GITHUB_REPOSITORY_OWNER`, `TAG`).
- **Validado**: `docker compose -f docker-compose.prod.yml config` OK; imagen prod construida y
  **prueba de humo 16/16 contra la imagen de producción** (incluye PDF en *standalone*).

### 🔧 Correcciones de integración frontend/agentes (16/10/2026)
Motivo: al abrir el detalle de equipo la consola mostraba un error de React; y la revisión de "todo bien
conectado" sacó a la luz dos fallos de base. Todo corregido y validado.

- **Recharts `2.12.7` → `3.10.1`.** El aviso `Warning: XAxis/YAxis: Support for defaultProps will be removed
  from function components` (Recharts 2.x usa `defaultProps` en componentes de función) desaparece: Recharts 3
  ya no usa `defaultProps` de React (`resolveDefaultProps`). Revisada la guía de migración 3.0 → no usamos nada
  eliminado (`Customized`, `activeIndex`, estado interno, `alwaysShow`, `isFront`, `blendStroke`).
- **Tests de componentes que nunca corrían.** `vitest` usaba el transform JSX clásico y los `.test.tsx` no
  importan `React` → `ReferenceError: React is not defined` (fallaban `ProbabilityGauge`, `RoleGuard`,
  `LoginForm`, `ExplanationFooter`). Arreglado con `esbuild: { jsx: 'automatic' }` en `apps/web/vitest.config.ts`.
- **`PlannerAgent` sin *fallback*.** Si el LLM fallaba (clave de OpenAI no válida, red, cuota) lanzaba 401 y
  rompía `/api/orders/auto-plan` (n8n WF-01/02). Ahora la llamada al LLM va en `try/catch` y cae al
  `fallbackPlan` determinista. El `PredictorAgent` ya lo hacía.
- **`embed()` sin *fallback*.** `lib/rag/embeddings.ts` ahora cae al embedding determinista ante cualquier error
  de OpenAI (no solo cuando no hay cliente), así el RAG y el *seeding* de KB no se rompen sin cuota.
- **Test nuevo**: `apps/web/tests/components/charts.test.tsx` (render en jsdom de `SensorChart`/`FailureChart` y
  de un `LineChart` equivalente al de Observabilidad; verifica `<svg>` montado y **cero** avisos `defaultProps`).

**Validación (16/10/2026)**: `tsc --noEmit` 0 errores · **vitest 26/26** (10 archivos) · prueba de humo **16/16**
· imagen de producción reconstruida con Recharts 3 · páginas `/equipment/[id]`, `/predictions`, `/dashboard` y
`/observability` → 200 con sesión.

### 🔧 Contrato API↔UI y consola limpia (16/10/2026)
Motivo: la consola del navegador mostraba un `404` y `Warning: Each child in a list should have a unique "key"`
en `OrderList`. Al investigarlo apareció un **bug real de contrato** entre la API y la UI.

- **`GET /api/orders` devolvía los items ANIDADOS** (`{ order: {…}, equipment, technician }`), mientras el
  frontend espera órdenes **planas** (`orderId`/`status`/`priority` en la raíz), como sí hacen
  `/api/predictions` y `/api/equipment`. Consecuencias: la tabla pintaba `#undefined`, badges y estado vacíos,
  el botón de aprobar nunca aparecía (el `status` leía `undefined`), `key={o.orderId}` era `undefined`
  → **el aviso de React**, y `OrderDetail`/`OrderView` (técnico) decían "Orden no encontrada" porque
  `items.find(o => o.orderId === id)` no casaba nunca. **Arreglado** aplanando la respuesta en
  `app/api/orders/route.ts` (`rows.map((r) => ({ ...r.order, equipment: r.equipment, technician: r.technician }))`).
- **`key` en filas condicionales** de `OrderList`, `PredictionList` y `EquipmentList`
  (`<TableRow key="loading">`, `<TableRow key="empty">`): necesario en cuanto un elemento condicional convive
  con un `.map()` y satisface `react/jsx-key`.
- **404 de consola**: era `GET /.well-known/appspecific/com.chrome.devtools.json`, una sonda automática de
  **Chrome DevTools** (no de la app). El middleware devuelve ahora **204** para esa ruta.
- **Config de tests**: en `apps/web/vitest.config.ts` se sustituyó `esbuild: { jsx: 'automatic' }` por el plugin
  oficial **`@vitejs/plugin-react`** (devDep nueva en `apps/web`), la forma soportada de compilar JSX en Vitest.
- **Tests**: `tests/components/lists.test.tsx` verifica el **contrato de forma** (renderiza con items planos,
  igual que los devuelve la API, y exige que **no** aparezca `undefined`); el smoke test añade la comprobación
  **12** (items planos en `/api/orders`).

**Validación (16/10/2026)**: `tsc --noEmit` 0 errores · **vitest 29/29** (11 archivos) · prueba de humo
**17/17** · páginas `/orders`, `/orders/93`, `/predictions`, `/equipment/1`, `/technician`, `/dashboard`,
`/observability`, `/reports` → 200 · export `/api/reports/orders/export?format=xlsx` → `PK`.

### 🔧 Tag de n8n corregido (18/10/2026)
`docker compose up -d` fallaba con `failed to resolve reference "docker.io/n8nio/n8n:1.62.0": not found`:
el tag **`1.62.0` no está publicado** en Docker Hub (la serie 1.62 empieza en `1.62.1`). Se fijó
**`n8nio/n8n:1.62.6`** (último patch de esa serie) en `docker-compose.yml`, `docker-compose.prod.yml` e
`infra/n8n/README.md`. Verificado: n8n 1.62.6 arranca, aplica sus migraciones y responde **200** en `:5678`.

La importación de los workflows necesitó un segundo arreglo: el importador de la CLI de n8n 1.62 **no reutiliza
una tag repetida** entre workflows (fallaba con `duplicate key … "idx_…" (tag_entity.name)` y revertía los 4).
Los JSON definían `maintainpredict` + `wf-0X`; se retiró la tag común y se importaron **sin API key** con
`docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/` → **4/4 importados** y asignados
al proyecto personal del owner. Se activaron con `n8n update:workflow --all --active=true` + reinicio de n8n.

### 🔧 WF-01 depurado y probado de extremo a extremo (18/10/2026)
Con los 4 workflows activos se lanzó la prueba real de WF-01 (`POST http://localhost:5678/webhook/sensor-data`
con `{ "sensor_id": 2, "value": 10.7 }`). La primera ejecución devolvió **500** y destapó **tres** fallos reales,
todos corregidos:

- **Nodo "Resolver equipment_id" roto (WF-01).** Leía `$json.equipment_id` / `$json.sensor_id`, pero su entrada
  es la **respuesta** del nodo `HTTP: POST /api/sensors/data` (`{ data: { sensorId, … } }`): el id salía
  `undefined` y llamaba a `GET /api/sensors/undefined` → `AxiosError … 404`. Ahora lee `$json.data.sensorId`
  (o el payload normalizado) y `sensorId` se declara en el ámbito exterior (declararlo `const` dentro del `if`
  causaba `ReferenceError: sensorId is not defined`).
- **Endpoint inexistente `GET /api/sensors/:id`.** WF-01 lo necesita para traducir `sensor_id → equipment_id`
  cuando el payload no trae `equipment_id`, y no existía (solo estaba `POST /api/sensors/data`). Creado
  `apps/web/app/api/sensors/[id]/route.ts` (permiso `equipment:read` **o** `x-internal-token`) →
  `{ sensor, lastReadings }`, con `sensor.equipmentId` (lo que espera el nodo).
- **Credencial SMTP ausente.** Los 4 workflows referencian la credencial `mp_smtp` ("MaintainPredict SMTP"),
  que no existía en n8n → `CredentialNotFoundError` y **cualquier** nodo de correo fallaba. Se añadió
  `infra/n8n/credentials/smtp.json` (MailHog: `mailhog:1025`, sin auth, `secure:false`) y se importó con
  `n8n import:credentials --input=…` (la CLI cifra el `data` plano con la `N8N_ENCRYPTION_KEY`).

> **Reimportar workflows**: cada JSON lleva ya su `id` de n8n, así que el *upsert* por `id` **actualiza en sitio**
> (no duplica) y conserva proyecto y tags. Basta con:
> `n8n import:workflow --separate --input=/workflows/` → `n8n update:workflow --all --active=true` → `docker compose restart n8n`.

**Resultado (18/10/2026)**:

```
POST /webhook/sensor-data → 200
{ "ok": true, "prediction": { "prediction_id": 155, "equipment_id": 2,
  "failure_probability": 0.753, "component": "bearing", "model_version": "rf-v1.0.0", "alert": true } }
```

- lectura `60007` (sensor 2, `vibration=10.7 mm/s`, quality `good`) ingestada por `/api/sensors/data`;
- predicción **155** (RF `rf-v1.0.0`, 75.3 % ⇒ `alert=true`);
- orden **98** (equipment 2, `status=planned`, `priority=high`, 2.5 h, técnico 5) vía PlannerAgent;
- **correo** "Nueva orden #98 (auto-aprobada)" en MailHog (`supervisor@mp.ai`);
- ejecución n8n **#5 = success**.

> Con `estimated_downtime_h ≤ 4 h` el planner **no** exige HITL (regla `> 4 h`), así que se tomó la rama
> *auto-aprobada*.

### 🔧 WF-02/WF-03/WF-04 depurados y probados de extremo a extremo (18/10/2026)

Se crearon las credenciales que faltaban (`mp_postgres` tipo `postgres` y `mp_openai` tipo `openAiApi`, con
`infra/n8n/import-credentials.sh` generándolas desde el `.env` sin versionar secretos) y se ejecutaron los tres
workflows leyendo el error real. Fallos encontrados y corregidos:

- **WF-02 · credencial `mp_pg` inexistente.** El workflow referenciaba `mp_pg` y no `mp_postgres`; se alineó el
  `id` con el documentado. Sin ella, el nodo Postgres fallaba con `CredentialNotFoundError`.
- **WF-02 · IF con tipos incompatibles.** `IF: prediccion existe` comparaba `prediction_id` (número) con el
  operador de texto `notEmpty` y `typeValidation: strict` →
  `FilterError: Wrong type: '156' is a number but was expecting a string`. Ahora es una condición booleana
  (`{{ !!$json.prediction_id }}`), y el nodo Postgres lleva `alwaysOutputData: true` para que una predicción
  inexistente llegue igualmente al `Respond 404`.
- **WF-02 · HITL irresumible (dos bugs encadenados).**
  1. El nodo `Wait` tenía `options.webhookSuffix: "wf02-hitl-wait"`, y eso **rompe el enrutado** de reanudación
     de n8n: la ruta real es `/webhook-waiting/<executionId>` (con sufijo, n8n intenta parsear el sufijo como
     id → `invalid input syntax for type integer: "NaN"`, o devuelve 404).
  2. El `Wait` no definía `httpMethod`, y por defecto es **GET**: el `POST` del backend daba 404
     *«does not contain a waiting webhook with a matching path/method»*.
  Solución: sin `webhookSuffix`, `httpMethod: POST` y `limitWaitTime` real de 30 min (antes esperaba
  indefinidamente pese a que el email decía 30 min). El nodo de código construye el `resume_url` a partir de
  `$execution.resumeUrl` reescribiendo el host a `N8N_WEBHOOK_BASE_URL` (localhost del navegador ≠ red interna).
- **WF-02 · el frontend no reenviaba `?resume=`.** El email HITL enlaza a `/orders/<id>?resume=…`, pero
  `OrderDetail`/`OrderList` aprobaban sin ese parámetro ⇒ el `Wait` nunca se reanudaba. Ahora
  `services/web` lo reenvía (`window.location.search`).
- **WF-02 · respuesta del webhook con el resultado SMTP.** El `Respond to Webhook` hacía `$json.data ?? $json` y
  su entrada era la salida del nodo de email; ahora referencia explícitamente
  `$('HTTP: POST /api/orders/auto-plan').item.json.data` y devuelve la orden.
- **WF-03 · nodo huérfano + binario perdido.** `Generar alertas destacadas` no tenía conexión entrante pero el
  email lo referenciaba (`$('Generar alertas destacadas')`) → *Referenced node is unexecuted*; además el email
  adjuntaba el binario `data` (PDF) que no estaba en su item. Se encadenó
  `Resumen (fallback) → HTTP PDF → FS: guardar PDF → Generar alertas → Email` (cadena lineal, orden determinista)
  y el nodo de alertas propaga el binario del PDF. El XLSX queda como rama lateral de persistencia.
- **WF-03 · `/data/reports` no existía en n8n.** Los nodos de escritura fallaban con `EACCES` (el volumen se crea
  `root:root` y n8n corre como `node`). Se monta `reports_data:/data/reports` en `n8n` y un servicio one-shot
  `reports-init` hace `chown 1000:1000` antes de arrancar (en `docker-compose.yml` y `.prod.yml`).
- **WF-04 · rama muerta y nodo no ejecutado.** El nodo HTTP declaraba 2 salidas y solo tiene una, así que
  `HTTP: escaneo datos sucios dedicado` nunca corría y `Analizar y detectar drift` lo referenciaba
  (`$('HTTP: escaneo datos sucios dedicado').item`) → *Unexecuted node*. Ahora la salida 0 hace *fan-out* a las
  dos ramas, la rama dedicada es solo-reporte y el análisis usa `sync.dirty` (el sync ya envía
  `includeDirtyScan: true`).
- **WF-03/WF-04 · `n8n execute` no arrancaba.** La CLI exige un disparador manual (`STARTING_NODES`) y el cron no
  lo es → `Missing node to start execution`. Se añadió un **Manual Trigger** (bajo demanda) a ambos, útil además
  para lanzarlos desde la UI.
- **`PUBLIC_APP_URL`.** Los emails usaban `APP_BASE_URL` (`http://web:3000`), irresoluble desde el navegador, en
  los enlaces «Ver orden / App técnico / Observabilidad». Se añadió `PUBLIC_APP_URL=http://localhost:3000`
  (prod: `https://<APP_DOMAIN>`) con caída a `APP_BASE_URL`.

**Resultado (18/10/2026)**:

| Workflow | Prueba | Resultado |
|---|---|---|
| WF-02 (auto) | `POST /webhook/generate-order {"prediction_id":154}` | **200** `{"ok":true,"order":{…"requires_hitl":false…}}` → orden 107 `planned` 2.5 h + email al técnico |
| WF-02 (HITL) | `{"prediction_id":130}` (prob 0.878 ⇒ 4.5 h) | orden 104 `pending_approval` + email «HITL requerido»; aprobado con `?resume=` → ejecución **#13 success** + «Nueva orden #104 asignada» |
| WF-02 (expirado) | resume sin `approved:true` | ejecución **#10 success** + email «HITL expirado» |
| WF-03 | `n8n execute --id=2kDq2Dn152FFO7pe` | **exit 0**, `weekly_2026-10-05_2026-10-11.pdf` (3.3 KB) y `.xlsx` (9.8 KB) en `/data/reports`, email al supervisor con el PDF adjunto; el 401 del LLM (clave placeholder) cae al resumen sintético |
| WF-04 | `n8n execute --id=6sAtitcvR5cxiwo2` | **exit 0** (ejecución #11 `success`), sync de métricas/KPIs/FP/datos sucios + email «1 alerta(s) de modelo» |

> La rama HITL mantiene la conexión HTTP abierta hasta la aprobación o el timeout de 30 min (el webhook usa
> `responseMode: responseNode`): un cliente debe usar timeout corto o no bloquear. La rama auto responde al
> instante.

**Limpieza y avisos de la instancia**:
- Se eliminaron **6 órdenes residuales** creadas por el test antiguo (ids `90, 91, 94, 95, 99, 106`: sin
  `prediction_id`, 6.00 h, casi todas `pending_approval`) que ensuciaban la UI; respaldo previo en
  `%TEMP%\opencode\phantom_orders_backup.csv`. No había FKs apuntando a `maintenance_orders`.
- Se silenció el banner de "nueva versión disponible" de n8n con `N8N_VERSION_NOTIFICATIONS_ENABLED=false` +
  `N8N_DIAGNOSTICS_ENABLED=false` (dev y prod). Decisión: **no** actualizar de versión (1.62.6 sigue siendo
  válida y estable para estos workflows).

**Extra detectado y corregido**: `apps/web/tests/api.smoke.test.ts` escribía predicciones/órdenes/lecturas en la
BD de **desarrollo** y no las borraba (cada `vitest run` dejaba una orden fantasma `pending_approval` de 6.00 h y
sin `prediction_id`). Ahora registra los ids creados y los elimina en `afterAll`.

**Validación (18/10/2026)**: `tsc --noEmit` 0 errores · **vitest 29/29** (11 archivos) · prueba de humo **17/17**.

### 🔧 Proveedores LLM: chat con Groq + embeddings con Gemini (18/10/2026)

El chat es independiente del proveedor: la app usa un cliente único en `apps/web/lib/ai/openai.ts` (lo comparten
`agents/predictor.ts`, `agents/planner.ts` y `rag/embeddings.ts`), que aplica `baseURL` cuando `OPENAI_BASE_URL` está
definida (`lib/env.ts` la valida y normaliza la cadena vacía a `undefined`).

- **Chat (web + WF-03) → Groq**: `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_CHAT_MODEL=openai/gpt-oss-120b`.
  El nodo de WF-03 es un `httpRequest` a `{{$env.OPENAI_BASE_URL}}/chat/completions` autenticado con la credencial
  `mp_openai` (`predefinedCredentialType`) y se llama **`LLM: resumen ejecutivo`**; su Code node lee
  `choices[0].message.content`. Se usa `httpRequest` y no `n8n-nodes-base.openAi` porque en n8n 1.62.6 esa credencial
  fija `api.openai.com` y no admite URL base.
- **Embeddings del RAG → Google Gemini**: `gemini-embedding-001` con salida de 1536 dimensiones y `taskType`
  (`RETRIEVAL_DOCUMENT` para la KB, `RETRIEVAL_QUERY` para las consultas). Groq **no ofrece embeddings**, así que
  `rag/embeddings.ts` resuelve en cascada **Gemini → proveedor compatible con OpenAI → embedding determinista local**,
  y normaliza a norma 1 (Gemini no garantiza vectores unitarios al truncar dimensiones).
- **Ajustes para modelos de razonamiento** (los `gpt-oss` gastan tokens «pensando» antes de responder):
  `max_tokens: 600` en el Predictor, `1200` en el Planner y `1500` en WF-03. El bucle del Planner pasó de 3 a
  `MAX_ROUNDS = 5` y fuerza `tool_choice: 'none'` en la última ronda: el modelo pide **una herramienta por turno**, así
  que con 3 rondas se quedaba sin redactar el JSON y caía al plan determinista.
- **Corrección del guard**: `lib/ai/openai.ts` ya no exige el prefijo `sk-` (las claves de Groq son `gsk_`); ahora solo
  descarta los valores de ejemplo de `.env.example`.
- **RAG vectorizado**: los 5 documentos de `kb_maintenance` tienen vectores reales. Al cambiar de proveedor hay que
  regenerarlos (`embedding` no es comparable entre proveedores), para lo que existe `KB_RESEED=1`:

  ```bash
  docker compose exec -T -e KB_RESEED=1 web sh -lc \
    'cd /app/apps/web && ./node_modules/.bin/tsx scripts/seed-kb-embeddings.ts'
  ```

**Validado (18/10/2026)**: `tsc --noEmit` 0 errores · **vitest 29/29** · prueba de humo **17/17** · 7/7 servicios arriba ·
4/4 workflows activos · WF-01 → el PredictorAgent explica el fallo citando ISO 10816-3 y el manual SKF 6205 (texto del
LLM, no *fallback*) · **RAG real**: `retrieve()` devuelve 4 documentos con similitud 0,64–0,71 (Gemini 1536 dims) ·
la orden creada lleva el `reasoning` del LLM en `notes` · WF-03 `success` con email de resumen ejecutivo del LLM.

> [!NOTE]
> El catálogo de la cuenta de Groq es `openai/gpt-oss-120b`, `openai/gpt-oss-20b` y `qwen/qwen3.8-27b`
> (`llama-3.3-70b-versatile` devuelve 404) y no incluye ningún modelo de embeddings.
> La clave de OpenRouter usada en pruebas anteriores quedó **comprometida** al pegarla en un chat: conviene revocarla
> en <https://openrouter.ai/keys>.

### 🔎 G.1: detalle de predicción (18/10/2026)

`/predictions/[id]` + `components/predictions/PredictionDetail.tsx`. Hasta ahora el listado mostraba la
probabilidad pero **no había forma de ver por qué** el modelo la había calculado.

- Reutiliza `ProbabilityGauge` y `ComponentView` (explicabilidad) y añade tres bloques nuevos que se
  alimentan de `predictions.features` (jsonb, con datos reales en 161 de 167 predicciones):
  **peso de cada señal** (`top_features`, en barras ordenadas), **lecturas que entraron al modelo**
  (`inputs`, cada valor frente a sus umbrales) y **documentación RAG citada** (`rag_sources`).
- **Órdenes derivadas** con enlaces a su ficha, y botón **auto-plan** solo si aún no existe ninguna
  (`hasOrder`). Sigue siendo `POST /api/orders/auto-plan` el único que escribe.
- Degrada bien: las predicciones sin pesos (p. ej. la 183, componente `unknown`) dicen explícitamente
  que el modelo no devolvió pesos en vez de pintar un panel vacío.
- **G.8 (tercer punto) queda hecho**: `PredictionList` ya enlaza al detalle. No se hizo antes
  precisamente porque la página no existía.
- Se extrajeron `orderStatusVariant`/`orderPriorityVariant` a **`lib/ui/variants.ts`**: la tabla de
  órdenes derivadas habría duplicado el mapeo de colores de `OrderList`.

**Validado (18/10/2026):** `/predictions/173` (con 2 órdenes derivadas), `/predictions/183` (sin pesos) y
`/predictions/abc` → **404** · `tsc` 0 errores · **vitest 73/73** (17 ficheros, +3) · humo **27/27** ·
escrituras **20/20** · enlaces **19/19**.

> **Resuelto en G.7 (18/10/2026).** Un id válido pero inexistente respondía 200 con un aviso en pantalla y
> esto último **se corrigió**: ahora las tres fichas (`/equipment/[id]`, `/orders/[id]`, `/predictions/[id]`)
> comprueban la existencia en el servidor con `lib/db/detail-guard.ts` antes de renderizar, así que
> `/predictions/999999` devuelve **404**. El motivo de que no se hiciera antes, y por qué importa, está en la
> sección de cierre de la fase G.

### ✅ Fase I cerrada: el HITL sabe rechazar (19/10/2026)

La especificación pedía que el correo de aprobación humana también permitiera **rechazar**, y hasta ahora el
sistema solo sabía aprobar: `POST /api/orders/[id]/approve` hacía `pending_approval → approved` y nada más.

**El rechazo, de punta a punta**

- **API.** El endpoint acepta `decision=approve|reject` (por *query string* o por cuerpo JSON). Sin ninguno de
  los dos se asume `approve`, así que ninguna llamada anterior cambia de comportamiento. Rechazar deja la orden
  en **`cancelled`** y **no** rellena `approved_by`/`approved_at`: quien rechaza no firma como aprobador. Su
  identidad y el motivo quedan en las notas de la propia orden y en la auditoría (`reject_order`, que ya existía
  en el catálogo desde la Fase D). No hubo migración: `cancelled` ya estaba en el dominio.
- **Workflow.** El email HITL pasa de un botón a **dos** (`approve_url` y `reject_url`). Y la rama negativa se
  **separa en dos**, porque antes un rechazo y una espera agotada acababan en el mismo correo: ahora
  `IF: rechazada` distingue «alguien decidió rechazar» de «se agotaron los 30 minutos». El correo de rechazo va
  al supervisor y **no** al técnico: no hay nada que ejecutar.
- **Interfaz.** `/orders/:id` muestra las dos acciones a quien tenga `orders:approve`. El rechazo es destructivo,
  así que pide confirmación explícita y explica qué implica. Si se llega desde el correo, un aviso recuerda qué
  decisión se venía a tomar. **El enlace del email no decide nada por sí solo**: abre la ficha y exige sesión, de
  modo que un correo reenviado no puede cancelar una parada.

**Dos cosas que se resolvieron documentando, no programando**

- **El *check-parts* del ERP no es un nodo de n8n.** Ya vive en el planner (`tool_check_parts` →
  `ErpHttpAdapter`, que degrada al catálogo local si el ERP no responde). Añadirlo como nodo daría dos fuentes de
  verdad para el mismo stock; las reglas de negocio se quedan en código y n8n aporta la orquestación.
- **Idempotencia real de WF-04 (I.3) y alerta de reentrenamiento (I.4)** dependen de H.5 y F.4, que aún no están.
  Se dejan **documentadas como bloqueadas** en vez de dar por hechas cosas sin verificar.

**Un bug real, encontrado al leer el correo enviado**

El cuerpo del correo de rechazo llegó con la expresión **sin evaluar** (`#{{$('HTTP: …').item… }}` literal). La
causa: en n8n **todo parámetro que contenga `{{ … }}` debe empezar por `=`**; sin ese prefijo se trata como texto
plano. El `subject` sí lo llevaba y llegaba bien, así que el fallo solo se veía en el cuerpo. Se corrigió y,
para no repetirlo, un escáner revisó los **88 parámetros con `{{ }}`** de los cuatro ficheros de workflow:
ninguno más estaba afectado.

**Los workflows, reejecutados**

Reimportados y activos, los cuatro terminaron en `success` (WF-01 #36, WF-02 #35, WF-03 #37, WF-04 #38) con sus
correos en MailHog: informe semanal, alerta de salud del modelo y las notificaciones de orden.

**Prueba nueva: `scripts/e2e-hitl.mjs`**

La primera prueba end-to-end real del HITL. Dispara WF-02 de verdad, espera a que la orden nazca pendiente,
**lee el correo que recibiría el supervisor** y resuelve la decisión por la misma API que usa la interfaz, con el
`resume` real de la espera. Después comprueba estado, notas, auditoría, correo de cierre y ejecución de n8n.
Dos detalles que costaron tiempo y quedan explicados en el propio script: MailHog entrega el HTML en
*quoted-printable* (`=` viaja como `=3D`, así que un `grep` de la URL no encuentra nada) y el `Subject` va en
MIME *encoded-word*, donde los espacios son guiones bajos. Resultado: **aprobar 14/14** y **rechazar 15/15**.

`tsc` 0 errores · vitest **80/80** · humo **27/27** · `check-links` **80/80**. Las órdenes que crea la prueba
(#150–#155) se quedan como datos de demo, según la decisión de no limpiar registros de sesión.

### ✅ Fase G cerrada: seis páginas nuevas, estados de Next y accesibilidad (18/10/2026)

Con G.9 (enlaces) y G.1 (detalle de predicción) ya hechas, quedaban doce tareas. Estas son, agrupadas por
lo que aportan — y con lo que **no** salió como decía el plan, que suele ser lo interesante.

**Páginas que faltaban**

- **`/users`** (G.2, `components/users/UserList.tsx`): filtros `q`/`role`/`is_active`, alta en diálogo y por
  fila cambio de rol, activación y restablecimiento de contraseña. La API **impide** auto-desactivarse y
  auto-cambiarse el rol, así que esos dos controles se deshabilitan con el motivo en el `title` en vez de
  dejar que el usuario se choque contra un 422.
- **`/sensors`** (G.3, `components/sensors/SensorList.tsx`): listado con filtros, alta y **últimas lecturas**
  al desplegar una fila. El plan decía «CRUD» pero **la API solo ofrece `GET` y `POST`** sobre `/api/sensors`
  (no hay `PATCH`/`DELETE`): en lugar de inventar endpoints se aprovechó `GET /api/sensors/:id`, que ya
  devolvía el detalle con lecturas, y la página quedó listado + alta + detalle.
- **`/integrations`** (G.5): tarjeta por adaptador con modo, estado, latencia y detalle, resumen y botón de
  reintentar (refresco automático cada 60 s).
- **`/profile`** (G.6): formulario de cambio de contraseña con lista de requisitos en vivo. La lista se
  genera desde `PASSWORD_RULES`, **la misma que valida el servidor**: si mañana cambia la política, la UI
  cambia sola y no puede prometer algo distinto de lo que la API acepta.

**Estados de Next (G.7) — y una retirada deliberada**

- `app/global-error.tsx` (sustituye al layout raíz: por eso usa **estilos en línea a propósito**, porque
  `globals.css` no está cargado), `app/error.tsx`, `app/(dashboard)/error.tsx` (conserva la navegación) y
  `app/not-found.tsx` en español.
- **No hay `app/loading.tsx` ni `(dashboard)/loading.tsx`.** Se escribieron, y al probarlos
  `/equipment/abc` pasó de **404 a 200**: un límite de `Suspense` hace que Next envíe la cabecera 200 antes
  de resolver la página, así que `notFound()` ya no puede cambiar el estado. El 404 es semántica
  (monitores, enlaces mal copiados) y las listas ya tienen esqueleto con `isLoading`, así que el estado de
  carga se movió a **`app/technician/loading.tsx`**, donde sí aporta (primera pantalla de la PWA en el móvil)
  y donde no hay `notFound()`.

**404 real de las fichas — la desviación que venía de G.1**

- Nuevo **`lib/db/detail-guard.ts`** (`parseId` + `equipmentExists`/`orderExists`/`predictionExists`): las
  tres páginas de detalle son ahora componentes de servidor que validan el id y **comprueban la existencia
  antes de renderizar**. Es una lectura por clave primaria (~1 ms); a cambio la respuesta HTTP dice la
  verdad. `/equipment/abc`, `/orders/abc`, `/predictions/abc`, `/equipment/999999`, `/orders/999999`,
  `/predictions/999999`, `/equipment/0` y `/orders/-3` → **404**. El mensaje de error del cliente se
  conserva para cuando falla la petición en sí (403/500).

**G.8: dos bugs de escala, no cosmética**

- **`OrderDetail`** pedía `GET /api/orders?pageSize=200` y **buscaba su orden en el cliente**. Con 116
  órdenes funcionaba; a partir de 200 la ficha se habría quedado vacía sin explicar por qué. Ahora usa
  `GET /api/orders/:id` y la ficha muestra equipo, técnico, predicción de origen (enlazada), repuestos,
  quién aprobó y el `ExplanationFooter` que le faltaba.
- **`KPICards`** descargaba el **informe semanal completo** (órdenes, predicciones y métricas de 7 días)
  para pintar cuatro números. Ahora usa `GET /api/dashboard/kpis`, lee los objetivos de `KPI_TARGETS` en
  vez de duplicarlos y añade los contadores operativos (equipos caídos, alertas de 7 días, órdenes abiertas
  y pendientes de aprobar) enlazados a su listado.

**G.11: shadcn/ui estaba instalado pero sin usar**

`components.json` + `components/ui/{select,dialog,dropdown-menu}.tsx`. Los paquetes Radix **ya estaban en
`package.json`** (dialog, select, dropdown-menu, label, tabs, toast, tooltip) y no se importaba ninguno: no
hubo que instalar nada. Ahora se usan de verdad: filtros y rol con `Select`, altas de usuario y sensor en
`Dialog` (foco atrapado, `Esc`, `aria-modal`), bloque de sesión con `DropdownMenu`. Se añadió el color
`popover` a `globals.css` y `tailwind.config.ts`, que Radix necesita para las capas flotantes. Los
`<select>` de la tabla de usuarios se quedan **nativos a propósito**: dentro de una celda aportan más que
un listbox custom.

**G.13: accesibilidad medida, no declarada**

- **`axe-core`** como dependencia de desarrollo y `tests/components/a11y.test.tsx` (5 casos): **cero
  violaciones críticas o graves** en la tabla de auditoría, el detalle de predicción y la paginación.
  `color-contrast` se desactiva porque jsdom no calcula colores; eso se mira en el navegador.
- **Enlace «Saltar al contenido»** + `tabIndex={-1}` en el `main` del panel y de la app del técnico.
- **`maximumScale` eliminado** del `viewport`: bloqueaba el zoom y eso incumple WCAG 1.4.4.
- **`components/ui/pagination.tsx`**: la paginación estaba copiada en tres tablas como `<button>` sueltos
  **sin foco visible ni etiqueta**. Ahora es un único `<nav aria-label="Paginación de …">` con botones del
  sistema, y las tres tablas lo comparten.

**G.14: navegación por rol, y dos incoherencias que aparecieron al compararla con las rutas**

Entradas nuevas con `perm` **opcional** (las personales no dependen de un permiso, solo de tener sesión),
agrupadas en «principal» y «Administración», y menú de cuenta en el bloque de sesión. Al contrastar el menú
con el `middleware` salieron dos fallos reales:

1. **`/sensors`** pedía `equipment:write` en el menú pero `equipment:read` en el `middleware`: un técnico
   podía entrar por URL y no veía el enlace. Se alinea el menú a `equipment:read` (el alta sigue tras
   `RoleGuard`).
2. **`/reports` no tenía regla en el `middleware`**: un técnico veía el informe semanal de negocio
   escribiendo la URL. Se añade `reports:read`.

**G.12: la PWA, documentada**

Nuevo **`docs/PWA.md`**: la decisión D5, cómo funciona el service worker por dentro (precache,
*network-first* en `/api`, *cache-first* en assets), **cómo invalidar** (subir la constante `CACHE`), las
limitaciones asumidas (sin precache del build, sin escrituras offline, sin Background Sync) y los pasos para
migrar a `next-pwa` sin tocar componentes.

**Aceptación**

`scripts/check-links.sh` pasa de 19 a **80 comprobaciones**: la **matriz de las 17 rutas × 3 roles** (admin
200 en todas; supervisor 307 en `/audit` y `/users`; técnico 307 en `/reports`, `/observability`,
`/integrations`, `/audit` y `/users`), las fichas dinámicas y ocho casos de id inválido o inexistente.
`tsc` 0 errores · **vitest 80/80** (19 ficheros) · humo **27/27** · escrituras **20/20** · enlaces y rutas
**80/80** · `restos_qa` 0/0.

### 🔗 Enlaces de navegación: dos páginas nuevas y un comprobador automático (18/10/2026)

Auditoría de la navegación (tarea **G.9** del plan): el menú llevaba tiempo apuntando a páginas que no
existían, así que se arregló **antes** de seguir con las páginas que faltan (fase G).

- **`/audit`** (menú lateral y título del Topbar) → **404**. El `middleware.ts` ya tenía su regla
  `audit:read` y el README ya la anunciaba, pero la página nunca se creó. Ahora existe: `AuditTable`
  con filtros por **módulo**, **acción** y **rango de fechas** (24 h / 7 / 30 días) y paginación, sobre
  `GET /api/audit`, más `ExplanationFooter`.
- **`/technician/checklists`** (barra móvil del técnico) → **404**. No es una página de la especificación,
  así que se creó reutilizando `OrderView` con un filtro `onlyPending`, en vez de duplicar la lógica de
  completar órdenes y subir fotos.
- **`lib/audit/catalog.ts`** — catálogo de acciones y módulos para la UI. Vive aparte de `lib/audit/log.ts`
  porque aquel importa la base de datos y `next/headers` (no puede acabar en el paquete del navegador);
  este solo tiene datos y un `import type`. Incluye una **garantía en tiempo de compilación**: si `log.ts`
  gana una acción o un módulo nuevos, el catálogo deja de cubrirlos y **no compila** hasta añadirlos.
- **`scripts/check-links.sh`** — extrae los `href` de `Sidebar.tsx` y `MobileNav.tsx` y comprueba que
  ninguno responde 404, además de verificar los enlaces a fichas concretas (`/equipment/:id`,
  `/orders/:id`) y que la navegación respeta los roles (el técnico recibe 307 en `/audit`). Se
  **autoactualiza**: si alguien añade una entrada a una página que no existe, el script falla solo.

**Resultado:** 11 enlaces de navegación + 2 fichas + 3 comprobaciones de rol, **18/18 en verde**. `tsc` 0
errores · **vitest 70/70** (16 ficheros, +3 de `AuditTable`) · humo **27/27** · escrituras **20/20**.

> **Deliberadamente sin tocar.** `/users`, `/sensors`, `/integrations` y `/profile` son páginas de la
> especificación a las que **todavía no apunta ningún enlace** (fases G.2, G.3, G.5 y G.6: no hay enlace
> roto). Y `PredictionList` sigue sin enlazar al detalle porque `/predictions/[id]` aún no existe (G.1):
> enlazarlo ahora sería crear el enlace roto a mano.

### 🔧 Fase E: resiliencia de los agentes y reglas fuera del LLM (18/10/2026)

Un proveedor externo (ML o LLM) no puede dejar colgada una petición, y **las reglas de negocio no pueden
depender de lo que "diga" el modelo**.

- **`lib/agents/resilience.ts`** — `withTimeout`, `withRetry` (backoff exponencial), `withLlmTimeout` y
  `TimeoutError`. Variables nuevas: `AGENT_TIMEOUT_MS` (8000), `AGENT_RETRIES` (2) y `LLM_TIMEOUT_MS` (20000).
  El **ML se reintenta** (es interno, rápido y su número es imprescindible); el **LLM no**: se corta por
  tiempo y, si falla, se pasa al respaldo en el acto (reintentarlo encarecería y retrasaría la ruta).
- **`lib/http/fetch.ts`** — `fetchWithTimeout` se movió aquí desde `lib/integrations` (no tenía nada que
  ver con integraciones) y ahora lo comparten adaptadores y agentes.
- **PredictorAgent** — el relato de respaldo **cita los documentos RAG con su similitud**
  (`buildFallbackExplanation`, exportada para poder probarla); si no hay documentación, lo dice.
- **PlannerAgent** — nueva herramienta **`schedule_order`** y una **única función de reglas**
  (`sealDraftOrder`). El LLM *propone*; el **código decide**: `requires_hitl` y `status` se calculan
  siempre aquí, también cuando el modelo responde con JSON. `get_production_windows` pasa a consulta
  interna (las ventanas viajan como contexto), lo que además ahorra rondas de herramienta.
- **Salida de la spec §5** — `PlannerOutput` gana `order_id`, `technician` y `status`.
  `sealPlannerOutput()` sella el `order_id` real tras insertar, y `/api/orders/auto-plan` ya **no
  recalcula** el estado: usa el del agente, así el agente, la respuesta y la BD no pueden discrepar.

> [!IMPORTANT]
> **Bug real de interoperabilidad (solo detectable ejecutando el agente):** Groq valida los argumentos de
> las herramientas contra el JSON Schema y **rechazaba la petición completa con un 400**
> (`/technician_id: expected integer, but got null`) porque el modelo enviaba `technician_id: null` en un
> campo declarado `type: "integer"`. El esquema de `schedule_order` ahora admite `null` en todos los campos
> y no exige ninguno: el modelo propone y `sealDraftOrder()` completa. Ni `tsc` ni los tests unitarios lo
> habrían visto.

**Validado (18/10/2026)** con `apps/web/scripts/check-agents.ts` (`npm run agents:check`) en tres escenarios:

| Escenario | Resultado |
|---|---|
| Normal (ML + LLM reales) | 7.7 % de probabilidad; explicación del LLM citando ISO 10816 y el manual SKF 6205 |
| **ML caído** (IP inalcanzable, timeout 700 ms) | **3 intentos con backoff de 250 y 500 ms** y respaldo analítico; la petición no se bloquea |
| **LLM caído** (clave inválida) | predictor en 986 ms citando los **4 documentos RAG**; plan determinista en 451 ms con la forma completa |

Por HTTP: `POST /api/predict` → 201 · `POST /api/orders/auto-plan` → 201 con `order_id`, `technician`,
`technician_id`, `status`, `requires_hitl`, `scheduled_date` y `parts` · equipos críticos con paradas de
5 y 6 h ⇒ `requires_hitl=true` y `status=pending_approval` (órdenes **136, 137, 138**). Además: `tsc` 0
errores · **vitest 67/67** (15 ficheros, +17) · **humo 27/27** (18 originales + 9 de la fase D).

### 🔧 Fase D: endpoints que faltaban, seguridad y contrato de respuesta (18/10/2026)

Cierre del bloque de backend del [`plan de cierre de brechas`](docs/PLAN_CIERRE_BRECHAS.md). Se pasa de
**25 métodos en 23 `route.ts`** a **38 métodos en 33 `route.ts`**, y las reglas del `middleware` de 22 a **35**
(la especificación pedía ~25 endpoints y ~25 reglas).

**Endpoints nuevos**

| Endpoint | Permiso | Para qué |
|---|---|---|
| `POST /api/auth/change-password` | sesión | Cambio de contraseña con validación de la actual |
| `GET /api/sensors` | `equipment:read` | Listado paginado de sensores |
| `POST /api/sensors` | `equipment:write` | Alta de sensor indicando `equipment_id` |
| `POST /api/equipment/:id/sensors` | `equipment:write` | Alta de sensor anidada bajo el equipo |
| `PUT /api/equipment/:id` | `equipment:write` | Actualización parcial del activo |
| `GET /api/predictions/:id` | `predictions:read` | Detalle: equipo, `features` y órdenes derivadas |
| `GET /api/orders/:id` | `orders:read` | Detalle: equipo, técnico, predicción y aprobador |
| `GET /api/dashboard/kpis` | `equipment:read` | KPIs + métricas + contadores y objetivos |
| `GET`/`POST /api/users`, `PATCH /api/users/:id` | `users:manage` | Administración de usuarios (nunca devuelve el hash) |
| `GET /api/technicians` | `orders:read` | Técnicos por carga de trabajo |

**Seguridad y contrato**

- `lib/auth/password-policy.ts`: política de **≥10 caracteres con mayúscula, minúscula, dígito y símbolo, sin
  espacios** (máx. 72, el límite real de bcrypt). Se aplica al alta y al cambio de contraseña. `Password123!` ya cumple.
- `lib/audit/log.ts` refactorizado en tres piezas: `insertAudit` (inserción pura), `logAudit` (petición HTTP: añade
  IP y user-agent, **nunca lanza**) y **`logAuditSync`** (scripts y jobs, sin depender de `next/headers`).
- **`explanation` en el 100 % de las respuestas**: `/api/health` la incluye en el cuerpo; los endpoints binarios
  (XLSX/PDF/DOCX) la exponen en cabeceras `x-explanation-what/how/decision`, porque meterla en el cuerpo
  corrompería el fichero. Documentado en `docs/API.md` («Contrato de respuesta»).
- `lib/db/queries.ts`: `technicianAvailability()` y `userPublicColumns` compartidos entre endpoints y agentes, para
  que la UI y el PlannerAgent no discrepen y sea imposible filtrar el hash por descuido.

> [!IMPORTANT]
> **Tres fallos reales detectados y corregidos en esta fase:**
> 1. **Rutas anidadas de Next**: `POST /api/equipment/:id/sensors` devolvía **404** porque el handler estaba en
>    `app/api/equipment/[id]/route.ts`. Un segmento dinámico de Next cubre **un solo nivel**: la ruta necesita su
>    propio `[id]/sensors/route.ts`. Se detectó validando de verdad (el `tsc` no lo habría visto nunca).
> 2. **Next solo permite exportar handlers desde `route.ts`**: exportar `ROLES` y `KPI_TARGETS` desde el route hacía
>    fallar la generación de tipos (`.next/types`). Se movieron a `lib/validation/users.ts` y `lib/reports/targets.ts`.
> 3. **`z.coerce.boolean()` con query strings**: `is_active=false` llegaba como la cadena `"false"`, que es *truthy*,
>    así que el filtro se invertía. Ahora se compara explícitamente (`z.enum(['true','false']).transform(...)`).

**Validado (18/10/2026)**: `tsc --noEmit` 0 errores · **vitest 50/50** (14 ficheros; +9) · **prueba de humo 28/28** ·
`docker compose config` válido en dev y prod · y **`scripts/acceptance-writes.sh`**, una batería de **20
comprobaciones de escritura** versionada en el repo (el humo no puede cubrir estas rutas porque crea datos) con
limpieza automática: alta de sensores y usuarios, duplicado 409, contraseña débil 422, **login real con el usuario
creado**, cambio de contraseña, comprobación de que la contraseña antigua deja de servir, desactivación y bloqueo
del login, técnico sin acceso a `/api/users` y autoprotección del admin (no puede auto-degradarse). Restos de QA en
la BD al terminar: **0 usuarios / 0 sensores**.

> [!NOTE]
> La FK `audit_log.user_id → users` impide borrar usuarios con historial: por eso la API usa **desactivación**
> (`is_active=false`) y no borrado, que además es lo correcto en un sistema auditado.

### 🔧 Fase 0 + Fase C: infra de datos e integraciones (18/10/2026)

Cierre de las brechas detectadas en la auditoría contra la especificación completa. Plan completo en
[`docs/PLAN_CIERRE_BRECHAS.md`](docs/PLAN_CIERRE_BRECHAS.md).

**Fase 0 — preparación**

- `scripts/backup-db.sh` / `scripts/restore-db.sh`: volcado comprimido de la base de la app **y** de la de n8n
  (`infra/postgres/backups/`), y restauración por nombre de fichero.
- `scripts/reset-db.sh`: recrea la base de la aplicación aplicando en orden todos los `infra/postgres/init/*.sql`
  (la imagen de Postgres solo los ejecuta en el primer arranque del volumen) y siembra usuarios + KB. Destructivo:
  pide confirmación y avisa de hacer backup antes.

**Fase C — módulo de integraciones** (`apps/web/lib/integrations/`)

| Dominio | Adaptador | Interfaz |
|---|---|---|
| ERP | `ErpHttpAdapter` | `ErpClient` |
| SCADA | `ScadaHttpAdapter` | `ScadaClient` |
| SMS | `MockSmsGatewayAdapter`, `TwilioSmsAdapter` | `SmsClient` |
| Email | `SmtpEmailAdapter` | `EmailClient` |

- Todo el dominio habla contra las interfaces de `types.ts`; pasar de simulado a real es cambiar `.env`
  (`INTEGRATIONS_MODE=real`, `SMS_PROVIDER=twilio`). Detalle en [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).
- `support.ts` aporta `fetchWithTimeout()` (ninguna llamada externa cuelga la petición) y `probe()`, que convierte
  cualquier excepción en `{ ok: false, detail }`: **`health()` nunca lanza**.
- El ERP **degrada al catálogo local** (`LOCAL_PARTS_CATALOG`, `source: 'catalog'`) si el proveedor falla, así que la
  planificación no se rompe por un sistema externo caído.
- Nuevo endpoint `GET /api/integrations/health` (permiso `integrations:read`: supervisor y admin) con el estado y la
  latencia de los 4 adaptadores.
- Nuevo servicio `mock-sms` (`infra/mocks/sms/server.js`, puerto 9002) y script de diagnóstico
  `pnpm --filter web integrations:check` (`apps/web/scripts/check-integrations.ts`).
- `lib/agents/planner.ts` ya no hace `fetch` directo al ERP: usa `getIntegrations().erp.checkParts()`.

**Diagnósticos disponibles** (`apps/web/scripts/`, todos con `tsx`):

| Comando | Para qué |
|---|---|
| `pnpm --filter web integrations:check` | Estado de los 4 adaptadores y una consulta real de repuestos al ERP. |
| `pnpm --filter web agents:check` | Ejercita PredictorAgent y PlannerAgent y comprueba las reglas (HITL, forma de salida). Acepta `ML_SERVICE_URL`/`OPENAI_API_KEY` por entorno para forzar los respaldos. |

> [!IMPORTANT]
> **Fallo real corregido**: `.env` tenía `ERP_BASE_URL`, `SCADA_BASE_URL` y `SMTP_HOST` apuntando a `localhost`.
> Dentro de un contenedor, `localhost` es el propio contenedor, así que esas integraciones **nunca funcionaban** y el
> planner caía silenciosamente al catálogo local. El `docker-compose.yml` de desarrollo ahora fija las direcciones de
> la red de Compose (`mock-erp`, `mock-scada`, `mock-sms`, `mailhog`) con el patrón `*_INTERNAL`, de modo que `.env`
> puede seguir usando `localhost` para scripts del host.

**Validado (18/10/2026)**: `tsc --noEmit` 0 errores · **vitest 41/41** (12 ficheros; +12 de integraciones) ·
prueba de humo **18/18** · 8/8 servicios arriba · `GET /api/integrations/health` → **4/4 adaptadores OK** ·
`auto-plan` creó la orden 128 con repuestos reales del ERP (`BRG-6205`×12, `LUB-EP2`×25) y `reasoning` del LLM
con 3 fuentes RAG.

### ✅ Fase 5 cerrada
El paso 5.9 quedó aplicado: `.env.example`, `.env` y el servicio `n8n` de `docker-compose.yml` ya incluyen
`APP_BASE_URL`, `PUBLIC_APP_URL`, `INTERNAL_TOKEN`, `SENSOR_API_KEY`, `SUPERVISOR_EMAIL` y `N8N_WEBHOOK_BASE_URL`.
La infraestructura de n8n está lista para probarse una vez existan los endpoints de las Fases 7 y 8.

---

## 5. Cómo levantar el entorno

```bash
cp .env.example .env          # ajustar OPENAI_API_KEY (chat) y GEMINI_API_KEY (embeddings del RAG)
docker compose up -d --build postgres web ml-service mock-scada mock-erp mailhog
docker compose up -d n8n      # opcional

docker exec -it mp_web pnpm db:seed:users
docker exec -it mp_web pnpm db:seed:kb        # requiere GEMINI_API_KEY (o OPENAI_API_KEY)

# n8n: workflows + credenciales (CLI, sin API key — los workflows ya están montados en /workflows)
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
docker compose exec -T n8n sh -c 'cat > /tmp/smtp.json' < infra/n8n/credentials/smtp.json
docker compose exec -T n8n n8n import:credentials --input=/tmp/smtp.json
bash infra/n8n/import-credentials.sh          # mp_postgres + mp_openai desde .env
docker compose exec -T n8n n8n update:workflow --all --active=true
docker compose restart n8n                    # imprescindible: sin reinicio los webhooks dan 404
```

> **Notas (16/10/2026):**
> - El `.env` local usa `DATABASE_URL=…@localhost:5432` y `ML_SERVICE_URL=http://localhost:8000`, válidos
>   en el host pero **no** dentro de los contenedores. El servicio `web` de `docker-compose.yml` los
>   **sobreescribe** a los nombres de servicio (`postgres`, `ml-service:8000`) y fija
>   `REPORTS_OUTPUT_DIR=/data/reports` y `UPLOAD_DIR=/data/uploads`.
> - El seed SQL trae un hash de contraseña **placeholder**; hay que ejecutar `db:seed:users`.

### Prueba E2E del HITL (n8n)

```bash
node scripts/e2e-hitl.mjs approve    # rama aprobada
node scripts/e2e-hitl.mjs reject     # rama rechazada (la orden queda en cancelled)
```

Dispara WF-02 de verdad, espera a que la orden nazca pendiente de aprobación, lee el **correo que recibiría el
supervisor** en MailHog y resuelve la decisión por la misma API que usa la interfaz, con el `resume` real de la
espera; después comprueba estado, notas, auditoría, correo de cierre y ejecución de n8n. Requiere el stack
levantado y **Node en el host** (no es un `scripts/*.sh` porque necesita leer JSON de dos APIs y descodificar
*quoted-printable*, cosa que en shell quedaría ilegible).

> ⚠️ **Crea órdenes reales y no las borra**: es la única forma de disparar el HITL, ya que la espera del workflow
> necesita una orden `pending_approval` de verdad. Resultado del 19/10/2026: **aprobar 14/14 · rechazar 15/15**.

### Prueba de humo

```bash
./scripts/smoke-test.sh                       # desde el host → http://localhost:3000
# o contra la red de Compose (equivalente):
docker run --rm --network maintainpredict-ai_mp_net \
  -e BASE_URL=http://web:3000 -e INTERNAL_TOKEN="$INTERNAL_TOKEN" \
  -v "$PWD/scripts:/scripts:ro" alpine:latest \
  sh -c "apk add --no-cache bash curl >/dev/null && bash /scripts/smoke-test.sh"
```

Cubre: health, login, RBAC (401 / 307 / 200), reportes `json|pdf|xlsx|docx` (verificando *magic bytes*),
observabilidad, sync con `x-internal-token` y el **contrato de forma de `/api/orders`** (items planos).
**Resultado 17/17 en verde el 16/10/2026** en dev (la **imagen de producción** validó 16/16 con el set
anterior; el check nuevo es de forma de JSON y aplica igual). Hoy el script cubre **27/27**
(`GET /api/sensors`, `/api/technicians`, `/api/dashboard/kpis`, las dos fichas `:id` y el alta de sensor).

### Tests unitarios

```bash
docker compose exec -T web pnpm exec tsc --noEmit   # tipos
docker compose exec -T web pnpm exec vitest run     # 84 tests (20 archivos)
```

`tests/components/**` corre en jsdom, con el plugin oficial **`@vitejs/plugin-react`** en `vitest.config.ts`
(compila JSX automático). Los tests de `agents`, `reports`, `observability` y `api.smoke` golpean la BD real
→ requieren el stack levantado y los seeds aplicados.

**Accesibilidad** (`tests/components/a11y.test.tsx`, G.13): audita con **`axe-core`** (dependencia de
desarrollo) la tabla de auditoría, el detalle de predicción y la paginación, y exige **cero violaciones
críticas o graves**. `color-contrast` va desactivada porque jsdom no calcula colores. Nota: en este
proyecto **no hay limpieza automática de Testing Library** (vitest corre sin `globals`), así que los tests
que consultan el DOM global deben llamar a `cleanup()` en `afterEach`.

### Validar la imagen de producción (`Dockerfile.prod`)

```bash
docker build -f apps/web/Dockerfile.prod -t mp_web_prod .
docker run -d --name mp_web_prod_test --network maintainpredict-ai_mp_net -p 3100:3000 \
  --env-file .env \
  -e DATABASE_URL="postgresql://mp_user:mp_pass_change_me@postgres:5432/maintainpredict" \
  -e ML_SERVICE_URL="http://ml-service:8000" \
  -e REPORTS_OUTPUT_DIR=/data/reports -e UPLOAD_DIR=/data/uploads mp_web_prod
# smoke-test con BASE_URL=http://mp_web_prod_test:3000 (ver bloque anterior)
```

| Servicio | URL | Credenciales |
|---|---|---|
| Web / Dashboard | http://localhost:3000 | ver tabla demo |
| n8n | http://localhost:5678 | `admin` / `admin_change_me` |
| MailHog | http://localhost:8025 | — |
| ML Service | http://localhost:8000/docs | header `x-api-key: $ML_SERVICE_API_KEY` |
| Mock SCADA | http://localhost:9000 | `scada_key` |
| Mock ERP | http://localhost:9001 | `erp_key` |

**Credenciales demo** (todas `Password123!`): `admin@mp.ai`, `supervisor@mp.ai`, `planner@mp.ai`,
`tec1@mp.ai`, `tec2@mp.ai`.

---

## 6. Convenciones del código (respetar para no romper el estilo)

- **Envelope de respuesta**: `ok(data, explanation)` / `created(...)` de `lib/http/response.ts`.
  `explanation = { what, how, decision }` en todas las rutas. Errores: `Error` con `.status` + `handleError(e)`;
  validación con **Zod** (422).
- **Auth de rutas**: `requirePermission(perm)` o **`requirePermissionOrInternal(req, perm)`** (acepta sesión
  **o** header `x-internal-token` para n8n). Ver `lib/http/internal-auth.ts`.
- **RBAC** (`lib/auth/rbac.ts`): roles `technician | supervisor | planner | admin`; permisos
  `equipment:read/write`, `predictions:read`, `predict:run`, `orders:read/create/complete/approve`,
  `sensors:ingest`, `reports:read`, `users:manage`, `audit:read`.
- **Auditoría**: toda mutación llama `logAudit({ userId, action, module, entityType, entityId, payload })`.
- **DB**: Drizzle ORM (`lib/db/schema.ts`, 10 tablas; `kb_maintenance.embedding` es `vector(1536)` + ivfflat).
- **Estados de orden**: `planned → pending_approval → approved → completed`, con la salida lateral
  **`cancelled`** cuando el supervisor rechaza en el HITL (`POST /api/orders/:id/approve?decision=reject`).
  **HITL** si `downtime > 4h`; el rechazo no firma `approved_by` (queda en las notas y en la auditoría como
  `reject_order`).
- **Umbral agéntico**: `failure_probability > 0.70` dispara auto-plan (WF-01 → `/api/orders/auto-plan`).
- **n8n → backend**: header `x-internal-token: {{$env.INTERNAL_TOKEN}}` (debe coincidir con `INTERNAL_TOKEN`).
- **n8n → parámetros**: **todo valor que contenga `{{ … }}` debe empezar por `=`**, o n8n lo trata como texto
  literal y la expresión viaja sin evaluar (le pasó al cuerpo del correo de rechazo, Fase I). Los ficheros de
  workflow llevan JS/HTML embebido: para tocarlos, parsear el JSON y reserializarlo, no editarlo a mano.
- **HITL**: el enlace del correo **nunca decide**; abre la ficha `/orders/:id` y allí un usuario con
  `orders:approve` confirma. El workflow distingue tres salidas (aprobada, rechazada y expirada) porque son tres
  correos distintos.
- **Explicabilidad obligatoria**: cada gráfico/tabla lleva pie `qué muestra / cómo interpretarlo / qué decisión
  sugiere`.

---

## 7. Inventario de archivos clave (lo que ya existe)

**Backend API** (`apps/web/app/api/` — 33 `route.ts`, 38 métodos): `auth/{login,logout,me,refresh,change-password}`,
`sensors` (GET/POST), `sensors/[id]`, `sensors/data`, `equipment` (GET/POST), `equipment/[id]` (GET/PUT),
`equipment/[id]/sensors`, `predictions` (GET), `predictions/[id]`, `predict`, `orders` (GET/POST), `orders/[id]`,
`orders/[id]/{approve,complete}`, `orders/auto-plan`, `technicians`, `dashboard/kpis`, `users` (GET/POST),
`users/[id]` (PATCH), `reports/weekly`, `reports/orders/export`, `observability/{summary,metrics/sync,dirty-data/scan}`,
`integrations/health`, `kb`, `audit`, `uploads`, `health`.

**Núcleo** (`apps/web/lib/`): `env.ts`, `db/{client,schema,queries,detail-guard}.ts`,
`auth/{jwt,rbac,password,password-policy,session}.ts`,
`http/{response,pagination,sensor-auth,internal-auth,fetch}.ts`, `audit/{log,catalog}.ts`,
`rag/{embeddings,retriever}.ts`,
`agents/{predictor,planner,resilience}.ts`, `validation/{sensors,users}.ts`, `reports/targets.ts`,
`ui/variants.ts`, `integrations/{types,support,index}.ts` + `integrations/adapters/**`.

**Frontend** (`apps/web/`): `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/error.tsx`,
`app/global-error.tsx`, `app/not-found.tsx`, `app/(auth)/**`, `app/(dashboard)/**` (con `error.tsx` propio;
**sin** `loading.tsx` a propósito), `app/technician/**` (+ `loading.tsx`), `components/**` (ui, layout, auth,
dashboard, equipment, predictions, orders, technician, reports, audit, users, sensors, integrations,
`ExplanationFooter`, `PwaRegister`), `components.json` (config de shadcn/ui), `lib/api/**`, `lib/hooks/**`,
`public/{manifest.json,sw.js,icons/}`. Doc: `docs/PWA.md`.

**Reportes** (`apps/web/`): `lib/reports/{aggregate,pdf,xlsx,docx}.ts`, `app/api/reports/**`,
`app/api/uploads/route.ts`, `app/uploads/[name]/route.ts`.

**Observabilidad** (`apps/web/`): `lib/observability/**`, `app/api/observability/**`,
`components/observability/**`, `app/(dashboard)/observability/**`, `docs/RISK_STRATEGY.md`.

**Otros**: `middleware.ts`, `scripts/{seed-users,seed-kb-embeddings,check-integrations,check-agents}.ts`,
`scripts/check-pwa-icons.sh`, `tests/**`.

**Integraciones** (`apps/web/`): `lib/integrations/**`, `app/api/integrations/health/route.ts`,
`infra/mocks/{erp,scada,sms}/server.js`. Doc: `docs/INTEGRATIONS.md`.

**Scripts de infra** (`scripts/`): `backup-db.sh`, `restore-db.sh`, `reset-db.sh`, `smoke-test.sh`,
`acceptance-writes.sh`, `check-links.sh`, `e2e-hitl.mjs` (E2E del HITL: dispara WF-02, lee el correo real de
MailHog y resuelve aprobar/rechazar por la API).

**ML service** (`apps/ml-service/`): `app/{main,model,schemas}.py`, `scripts/train_synthetic.py`,
`tests/test_model.py`. Endpoints: `GET /ml/health`, `GET /ml/metrics`, `POST /ml/predict-failure`.

**n8n** (`infra/n8n/`): `workflows/WF-01..04_*.json`, `import.sh`, `import-credentials.sh`, `README.md`,
`credentials/{README.md,smtp.json}`.
Docs: `docs/{DATA_DICTIONARY,N8N_WORKFLOWS}.md`.

---

## 8. Variables de entorno clave

`.env.example` define: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `OPENAI_API_KEY`
(+ `OPENAI_BASE_URL`/`OPENAI_CHAT_MODEL`), `GEMINI_API_KEY`/`GEMINI_*` y `OPENAI_EMBEDDING_*` para el RAG,
`ML_SERVICE_URL`/`ML_SERVICE_API_KEY`, `N8N_*`,
`ERP_BASE_URL`/`ERP_API_KEY`, `SCADA_BASE_URL`/`SCADA_API_KEY`, `SMTP_*`, `REPORTS_OUTPUT_DIR`, `LOG_LEVEL`.
Integraciones (Fase C): `INTEGRATIONS_MODE` (`mock`|`real`), `SMS_PROVIDER` (`log`|`mock`|`twilio`),
`SMS_BASE_URL`, `SMS_ACCOUNT_SID`/`SMS_AUTH_TOKEN`/`SMS_FROM`, `SMTP_USER`/`SMTP_PASS` y `INTEGRATION_TIMEOUT_MS`.
En desarrollo, `docker-compose.yml` fuerza `ERP_BASE_URL`/`SCADA_BASE_URL`/`SMS_BASE_URL`/`SMTP_HOST` a las
direcciones internas de la red de Compose (`*_INTERNAL` para sobrescribirlas).

> ✅ Paso 5.9 aplicado: `APP_BASE_URL`, `PUBLIC_APP_URL`, `INTERNAL_TOKEN`, `SENSOR_API_KEY`, `SUPERVISOR_EMAIL` y
> `N8N_WEBHOOK_BASE_URL` ya están en `.env.example` / `.env` / `docker-compose.yml` (y `.prod.yml`).

---

## 9. Convención para la próxima sesión de IA

1. **Lee este `HANDOFF.md` y el `.docx` (roadmap Fases 0–9) antes de tocar nada.**
2. Continúa por **Fase 9** (docs, Dockerfile.prod, Caddy, smoke-test, CI/CD). Fases 0–8 ya están completas.
3. Respeta las convenciones de §6.
4. Actualiza §2 y §4 al terminar.
5. Considera `git init` + commits: eliminaría la necesidad de reconstruir el estado (mantén igualmente este doc).
