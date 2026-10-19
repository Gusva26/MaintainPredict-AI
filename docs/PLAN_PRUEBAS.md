# Plan de pruebas — MaintainPredict AI

Qué se prueba, con qué, cuánto se cubre y qué queda fuera. Escrito contra el **estado real** de la suite: los
números de este documento salen de ejecutar las pruebas, no de la intención del diseño.

Última revisión: **19/10/2026** (fase K). Ejecución de referencia: **84 pruebas en 20 ficheros**, todas en verde.

---

## 1. Objetivo y alcance

**Objetivo.** Demostrar que el sistema hace lo que dice la especificación, con especial atención a lo que no se
puede romper: autorización, reglas de negocio de las órdenes y el HITL.

**Dentro del alcance:**

- API (contratos, códigos HTTP, formas de respuesta).
- Reglas de negocio: alerta por probabilidad, HITL por parada estimada, sellado de la orden.
- Autorización (matriz rutas × rol).
- Componentes de interfaz críticos y accesibilidad de los cubiertos.
- Integraciones externas en modo degradado (ERP, SCADA, SMS, Email).
- Generación de informes (PDF, XLSX, DOCX).
- Inferencia del modelo ML (Python).

**Fuera del alcance (y por qué):**

| Fuera | Motivo |
|---|---|
| Pruebas de carga sostenida | Pendiente de `bench-api.sh` (fase L.2); hoy solo hay medición puntual |
| Navegador real (Playwright) | No instalado; la UI se prueba con jsdom, que no calcula color ni layout |
| Proveedor LLM real en CI | Dependencia externa y coste; se prueba el relato de respaldo y el sellado |
| Migración de datos históricos | No hay datos productivos todavía |
| Penetración / fuzzing | Se sustituye por el registro de brechas de `docs/SEGURIDAD.md` |

---

## 2. Estrategia

Pirámide clásica **60 / 30 / 10** (unitaria / integración / extremo a extremo). La distribución real de la suite:

| Nivel | Pruebas | % real | Objetivo |
|---|---:|---:|---:|
| Unitaria (sin BD) | 45 | 54 % | 60 % |
| Integración (con Postgres) | 10 | 12 % | 30 % |
| Componentes (jsdom) | 29 | 34 % | — |
| Sistema (scripts, fuera de vitest) | 142 comprobaciones | — | 10 % |

> **Lectura honesta:** la base unitaria es sólida y los componentes están bien cubiertos, pero hay **poca prueba de
> integración** frente al objetivo. Se compensa con las 142 comprobaciones de sistema de los scripts (humo,
> escrituras y permisos), que atacan la API real contra la base real. La deuda está reconocida en la fase L.

---

## 3. Niveles de prueba

### 3.1 Unitarias (vitest, sin base de datos) — 45

Lógica pura, donde un error es silencioso y caro.

| Fichero | Pruebas | Qué fija |
|---|---:|---|
| `password-policy.test.ts` | 7 | Longitud, mayúscula, minúscula, dígito, símbolo, espacios y límite de bcrypt; que `assertPasswordPolicy` lanza 422 |
| `agents.resilience.test.ts` | 17 | `withTimeout`, `withRetry` con backoff, relato de respaldo del Predictor, **y que las reglas de `schedule_order` las decide el código, no el LLM** |
| `integrations.test.ts` | 12 | Degradación del ERP, SCADA, SMS y Email; que `health()` nunca lanza; modos simulados; `fetchWithTimeout` |
| `rbac.test.ts` | 5 | La **matriz de permisos** por rol (la misma que documenta `SEGURIDAD.md`) |
| `reports.test.ts` | 4 | Estructura del informe y **bytes mágicos** de PDF (`%PDF`), XLSX y DOCX (`PK`) |

### 3.2 Integración (vitest contra Postgres real) — 10

En CI se levanta `pgvector/pgvector:pg16`, se aplica el esquema y se siembra. Estas pruebas consultan de verdad.

| Fichero | Pruebas | Qué fija |
|---|---:|---|
| `api.smoke.test.ts` | 3 | Reglas de negocio: alerta con `failure_probability > 0.70`, HITL con parada > 4 h y lectura fuera de umbral como `suspect` |
| `observability.test.ts` | 4 | `syncModelMetrics`, `syncBusinessKpis`, tasa de falsos positivos y escaneo de datos sucios |
| `queries.test.ts` | 1 | `technicianAvailability` devuelve técnicos ordenados por carga ascendente (lo que usa el planner) |
| `agents.test.ts` | 2 | Forma de la salida del Predictor (spec §18.2) y que el Planner respeta el HITL > 4 h |

### 3.3 Componentes (jsdom + Testing Library + axe-core) — 29

| Fichero | Pruebas | Qué fija |
|---|---:|---|
| `a11y.test.tsx` | 5 | Accesibilidad de `AuditTable`, `PredictionDetail`, `PaginationBar`, `PasswordChecklist` y `ExplanationFooter`: **0 violaciones críticas o graves** |
| `audit-table.test.tsx` | 3 | Reconstrucción de la fila de auditoría (incluido el id de entidad compartido) |
| `charts.test.tsx` | 4 | Que los gráficos reciben datos, no revientan con series vacías y que `SensorChart` **dibuja los umbrales** como líneas de referencia (H-K6) |
| `crud-lists.test.tsx` | 2 | Contrato exacto de `/api/users` y `/api/sensors` (paginado con `items`/`meta` y equipo anidado) |
| `lists.test.tsx` | 3 | Claves de React y contrato de las listas |
| `prediction-detail.test.tsx` | 3 | Que el detalle muestra explicación, pesos y órdenes derivadas |
| `technician-order-view.test.tsx` | 3 | **H-K1**: subir una foto no completa la orden y viaja en el `PUT /complete`; **H-K7**: `Iniciar intervención` llama a `PUT /start` |
| `LoginForm.test.tsx` | 2 | Envío, error visible y accesibilidad del formulario |
| `RoleGuard.test.tsx` | 2 | Que el contenido se oculta sin permiso |
| `ProbabilityGauge.test.tsx` | 1 | Umbral visual al 70 % |
| `ExplanationFooter.test.tsx` | 1 | El pie de explicabilidad se renderiza con el modelo y la fecha |

### 3.4 Sistema (scripts, contra el stack levantado) — 142 comprobaciones

| Script | Comprobaciones | Qué verifica | Cuándo se ejecuta |
|---|---:|---|---|
| `scripts/smoke-test.sh` | **27** | Auth, RBAC, CRUD, reglas de negocio, informes, 404 y que no se filtran `passwordHash` | Cada entrega |
| `scripts/acceptance-writes.sh` | **20** | Rutas de escritura (crear, modificar, completar) y **limpieza** de lo creado | Al tocar escrituras |
| `scripts/check-links.sh` | **80** | **51** comprobaciones de rutas × rol (17 rutas × 3 roles) + **8** de ids inválidos (404 real) + 21 de coherencia | Al tocar rutas o permisos |
| `scripts/e2e-hitl.mjs` | **14 + 15** | E2E real del HITL: dispara WF-02, lee el correo en MailHog, aprueba (14 pasos) o rechaza (15, incluida la auditoría `reject_order` y la ausencia de `approve_order`) | Al tocar n8n o las órdenes |

Estas pruebas **crean datos reales**. `smoke-test.sh` y `acceptance-writes.sh` limpian lo suyo; `e2e-hitl.mjs` deja
las órdenes de demostración a propósito (decisión del 18/10/2026: no borrarlas).

### 3.5 Modelo ML (pytest)

`apps/ml-service/tests/test_model.py` comprueba que el modelo entrena, persiste y que la inferencia devuelve una
probabilidad en rango. Se ejecuta en el trabajo `ml` de CI.

### 3.6 No funcionales

Cubiertas y **pendientes** en `docs/PLAN_CALIDAD.md` §1: cobertura ≥ 75 %, p95 < 500 ms, 0 vulnerabilidades
HIGH/CRITICAL, complejidad ≤ 10 y disponibilidad ≥ 99,5 %. Hoy la suite **no** impone umbral de cobertura: es la
deuda principal.

---

## 4. Casos de prueba clave

Los que un revisor de aceptación pediría. Los marcados 🟢 están automatizados.

| ID | Caso | Precondiciones | Pasos | Resultado esperado | Cobertura |
|---|---|---|---|---|---|
| CP-01 | Inicio de sesión correcto | Cuenta activa | Enviar credenciales válidas | Sesión creada; admin/supervisor/planner → `/dashboard`; técnico → `/technician` | 🟢 humo |
| CP-02 | Credenciales incorrectas | — | Enviar contraseña errónea | `401` con **mensaje genérico** (no revela si el email existe) | 🟢 humo |
| CP-03 | Cuenta desactivada | Usuario desactivado | Iniciar sesión | Mismo `401` genérico | 🟢 |
| CP-04 | Técnico no puede aprobar | Sesión de técnico | `POST /api/orders/:id/approve` | `403` | 🟢 RBAC + humo |
| CP-05 | Alerta por probabilidad | Predicción > 0,70 | Consultar predicciones | Estado `alert` | 🟢 `api.smoke` |
| CP-06 | HITL por parada | Orden con parada > 4 h | Planificar | Nace `pending_approval`, `requires_hitl=true`; el técnico **no** recibe aviso | 🟢 `api.smoke`, `agents.test` |
| CP-07 | Sin HITL bajo umbral | Orden con parada ≤ 4 h | Planificar | Nace `planned` | 🟢 `agents.resilience` |
| CP-08 | Aprobar HITL | Orden `pending_approval` | `approve` | `approved`, se firma `approved_by`/`approved_at`, auditoría `approve_order`, se avisa al técnico | 🟢 e2e 14/14 |
| CP-09 | Rechazar HITL | Orden `pending_approval` | `reject` | `cancelled`, **sin** firma de aprobación, motivo y autor en `notes`, auditoría `reject_order` | 🟢 e2e 15/15 |
| CP-10 | Decidir dos veces | Orden ya resuelta | Volver a aprobar/rechazar | `409` (protección contra carrera) | 🟢 |
| CP-11 | Completar orden | Orden `planned`/`approved` | `PUT /complete` | `completed`; técnico solo las suyas (`403` si no) | 🟢 escrituras |
| CP-12 | Falso positivo | Orden abierta | Completar marcando la casilla | La predicción cuenta como falso positivo en `Observabilidad` | 🟢 observabilidad |
| CP-13 | Orden ya cerrada | `completed`/`cancelled` | `PUT /complete` | Error «La orden ya se encuentra cerrada» | 🟢 |
| CP-14 | Subir foto no cierra la orden | Orden abierta, checklist sin marcar | Subir foto | La orden **sigue abierta**; el contador muestra la foto pendiente | 🟢 **H-K1** |
| CP-15 | Alta de sensor `maintenance` | Sesión supervisor | Crear sensor con `maintenance` | Se crea (`201`) | 🟢 **H-K2** |
| CP-16 | Informes descargables | Datos de la última semana | Descargar PDF/XLSX/DOCX | `%PDF`, `PK`, `PK` | 🟢 reports |
| CP-17 | Id inválido | — | Abrir `/orders/abc`, `/equipment/999999` | `404` real, no página vacía | 🟢 check-links |
| CP-18 | Degradación de integración | ERP/SCADA caídos | Consultar `/integrations` | Estado `con fallo` sin lanzar error 500 | 🟢 integrations + `integrations:check` |
| CP-19 | Iniciar intervención | Orden `planned`/`approved` | `PUT /api/orders/:id/start` | Pasa a `in_progress`; repetir es idempotente; auditoría `start_order`; el técnico solo las suyas | 🟢 `technician-order-view` + verificación en vivo |
| CP-20 | Replanificar tras un rechazo | Predicción cuya única orden está `cancelled` | Abrir el detalle | `hasOrder=false` y aparece `Generar orden (auto-plan)` | 🟢 verificado en vivo (H-K4) |
| CP-21 | Orden por severidad | Equipos de varias criticidades | `GET /api/equipment?sort=criticality&order=desc` | Devuelve primero los `critical` | 🟢 verificado en vivo (H-K5) |

---

## 5. Datos de prueba y limpieza

| Origen | Qué crea | Limpieza |
|---|---|---|
| `reset-db.sh` + seeds | 2 500 equipos, sensores, lecturas, usuarios demo | `reset-db.sh` (destructivo, con backup previo) |
| `smoke-test.sh` | Nada persistente que importe | Se autocontiene |
| `acceptance-writes.sh` | Equipo/sensor/orden de prueba | **Borra** lo que crea (verificado: `restos_qa` 0/0) |
| `e2e-hitl.mjs` | Órdenes reales #150–#159 de la sesión | **No** borra (decisión explícita del usuario) |
| Pruebas vitest | Datos de la BD de test / valores en memoria | Entorno aislado por fichero |

**Regla:** ninguna prueba se ejecuta contra datos productivos. En CI la base es desechable; en local, el stack de
desarrollo.

---

## 6. Cómo ejecutar

### 6.1 Suite rápida (lo que se corre en cada entrega)

```bash
# Dentro del contenedor (recomendado: mismas versiones que CI)
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsc --noEmit'
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/vitest run'

# Desde el host (Git Bash)
bash scripts/smoke-test.sh
bash scripts/check-links.sh
```

### 6.2 Suite completa (antes de cerrar una fase)

```bash
bash scripts/acceptance-writes.sh
node scripts/e2e-hitl.mjs approve
node scripts/e2e-hitl.mjs reject
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm integrations:check'
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm agents:check'
docker compose exec -T ml-service python -m pytest tests -q
```

### 6.3 Un solo fichero

```bash
docker compose exec -T web sh -lc \
  'cd /app/apps/web && ./node_modules/.bin/vitest run tests/components/technician-order-view.test.tsx'
```

### 6.4 En CI

`.github/workflows/ci.yml` ejecuta `lint` + `vitest run` + `build` (trabajo `web`), `pytest` (trabajo `ml`) y la
construcción de las imágenes (trabajo `docker`). Es la **misma** suite, en un entorno limpio.

---

## 7. Criterios de entrada y salida

**Entrada:** el stack levanta, `postgres` está `healthy`, el esquema y los seeds están aplicados y los workflows de
n8n están activos.

**Salida (todo obligatorio):**

| Criterio | Umbral |
|---|---|
| Compilación | `tsc --noEmit` con 0 errores |
| Suite vitest | 84/84 en verde |
| Humo | 27/27 |
| Rutas y permisos | 80/80 |
| Escrituras | 20/20 (si se tocaron) |
| E2E HITL | aprobar 14/14 y rechazar 15/15 (si se tocó n8n u órdenes) |
| Servicios | 8 contenedores `running` |

Si alguno falla, la entrega no se considera terminada (`docs/PLAN_CALIDAD.md` §6).

---

## 8. Trazabilidad con la especificación

| Requisito de la spec | Dónde se prueba |
|---|---|
| Predicción con 7 días de anticipación | `agents.test` (ventana), `api.smoke` |
| Explicabilidad de la decisión | `agents.resilience` (fuentes RAG), `prediction-detail`, `ExplanationFooter` |
| Regla HITL (parada > 4 h) | `agents.test`, `agents.resilience`, `api.smoke`, `e2e-hitl` |
| Las reglas las impone el código, no el LLM | `agents.resilience` (§`schedule_order`) |
| RBAC de 4 roles | `rbac.test` + `check-links.sh` |
| Informes semanales en 3 formatos | `reports.test` |
| RAG sobre manuales y normativa | `agents.resilience` (cita de fuentes con similitud) |
| Integraciones con degradación | `integrations.test` |
| Objetivos de calidad §12 | `docs/PLAN_CALIDAD.md` §1 |

---

## 9. Pendientes

| Pendiente | Fase | Efecto de no tenerlo |
|---|---|---|
| Umbral de cobertura ≥ 75 % en `vitest.config.ts` | L.1 | La cobertura puede bajar sin que nadie lo note |
| `bench-api.sh` con p95 | L.2 | No hay medida de latencia |
| `pnpm audit` / `pip-audit` / `trivy` en CI | L.3 | Una dependencia vulnerable no bloquea |
| Regla `complexity` de ESLint | L.4 | La complejidad no se vigila |
| `axe` en CI (hoy solo en vitest) | L.5 | Igual que hoy; ya está dentro de la suite |
| Monitorización con histórico | L.6 | La disponibilidad no se puede afirmar |
| Prueba en navegador real | — | Lo visual (color, layout, cámara) no se cubre con jsdom |
