# Plan de calidad — MaintainPredict AI

Define **qué significa «hecho»** en este proyecto: los objetivos medibles de la especificación (§12), cómo se mide
cada uno, qué puerta de calidad lo bloquea y en qué estado está hoy. Es un documento vivo: la columna «Estado»
dice la verdad, no la intención.

Última revisión: **19/10/2026** (durante la fase K).

---

## 1. Objetivos de calidad (spec §12)

| # | Objetivo | Umbral | Cómo se mide | Herramienta | Estado |
|---|---|---|---|---|---|
| Q1 | Cobertura de pruebas | **≥ 75 %** | `vitest --coverage` | `@vitest/coverage-v8` | ⚠️ **No medido**: falta el instrumentador (fase L.1) |
| Q2 | Latencia de la API | **p95 < 500 ms** | Peticiones a los endpoints principales | `scripts/bench-api.sh` | ⚠️ **No medido**: el script no existe (fase L.2) |
| Q3 | Vulnerabilidades | **0 HIGH / 0 CRITICAL** | `pnpm audit`, `pip-audit`, escaneo de imágenes | `trivy` | ⚠️ **No medido** (fase L.3) |
| Q4 | Complejidad ciclomática | **≤ 10 por función** | Regla `complexity` de ESLint | ESLint | ⚠️ **No aplicado** (fase L.4) |
| Q5 | Accesibilidad | **WCAG AA** | `axe-core` | `axe-core` + Testing Library | 🟡 **Parcial**: 5 pruebas con 0 violaciones críticas/graves en los componentes cubiertos (fase L.5 / G.13) |
| Q6 | Disponibilidad | **≥ 99,5 %** | Healthchecks y monitorización | Compose + Caddy | 🟡 **Parcial**: healthcheck real en `/api/health` y en Postgres/ML; sin monitorización externa (fase L.6) |

> Las filas en ámbar son deuda **reconocida**, no sorpresas: están planificadas como fase L
> (`docs/PLAN_CIERRE_BRECHAS.md` §13). Este documento no las maquilla; dice dónde están.

---

## 2. Objetivos de calidad internos (no vienen de la spec, pero se exigen)

| # | Objetivo | Umbral | Cómo se cumple hoy |
|---|---|---|---|
| I1 | **Compilación limpia** | `tsc --noEmit` sin errores | Se ejecuta en cada entrega y en `ci.yml` vía `build` |
| I2 | **Lint limpio** | `next lint` sin errores | Paso propio en `ci.yml` |
| I3 | **Contratos de API estables** | Prueba de humo 100 % en verde | `scripts/smoke-test.sh` (**27/27**) |
| I4 | **Autorización coherente** | Matriz rutas × rol sin fallos | `scripts/check-links.sh` (**80/80**) |
| I5 | **Escrituras verificadas** | Rutas de escritura probadas y limpiadas | `scripts/acceptance-writes.sh` (**20/20**) |
| I6 | **HITL de extremo a extremo** | Aprobar y rechazar dejan el rastro correcto | `scripts/e2e-hitl.mjs` (14/14 y 15/15) |
| I7 | **Documentación fiel al código** | Ninguna afirmación sin respaldo en el código | Revisión manual; los documentos citan archivo y línea |

---

## 3. Puertas de calidad (quality gates)

### 3.1 Lo que bloquea hoy (CI)

`.github/workflows/ci.yml`, tres trabajos:

| Trabajo | Pasos que bloquean |
|---|---|
| `web` | `pnpm install --frozen-lockfile` · aplicar esquema y seed sobre Postgres+pgvector · `next lint` · `vitest --run` · `next build` |
| `ml` | `pip install` · `pytest apps/ml-service/tests` |
| `docker` | Construcción de las imágenes de producción de `web` y `ml` (solo en `push`) |

Si cualquiera falla, la rama no se despliega. `deploy.yml` va después.

### 3.2 Lo que aún **no** bloquea (y debería, fase L)

| Puerta ausente | Consecuencia actual | Fase |
|---|---|---|
| Umbral de cobertura en `vitest.config` | Q1 puede bajar sin que nadie se entere | L.1 |
| `pnpm audit --audit-level=high` | Una dependencia vulnerable entra sin aviso | L.3 |
| `pip-audit` y `trivy` | Igual en Python e imágenes | L.3 |
| Regla `complexity` de ESLint | Q4 no se vigila | L.4 |
| `bench-api.sh` con umbral p95 | Q2 no se vigila | L.2 |

El criterio de aceptación de la fase L es exactamente ese: **CI en rojo si no se cumplen los umbrales**.

---

## 4. Cómo se mide cada cosa

### 4.1 Cobertura (Q1)

```bash
docker compose exec -T web sh -lc \
  'cd /app/apps/web && ./node_modules/.bin/vitest run --coverage'
```

Pendiente: añadir `@vitest/coverage-v8` y fijar `coverage.thresholds` en `vitest.config.ts`. Cuando exista, el
umbral debe ser **75 %** de líneas y no puede bajarse sin justificarlo aquí.

### 4.2 Latencia (Q2)

Endpoints que se medirán (los de uso real):

| Endpoint | Por qué |
|---|---|
| `GET /api/health` | Línea base y disponibilidad |
| `GET /api/orders?pageSize=20` | El más usado por supervisores |
| `GET /api/predictions?pageSize=20` | Lista con refresco cada 30 s desde el cliente |
| `POST /api/predict` | Camino del agente (ML + RAG + LLM), el más caro |
| `GET /api/reports/weekly?format=pdf` | Generación de documentos |

Se medirá con peticiones repetidas y se publicará **p50, p95 y p99**. El umbral de aceptación es **p95 < 500 ms**
para los `GET`; el `POST /api/predict` se reporta aparte, porque depende del proveedor del LLM y no de esta
aplicación.

### 4.3 Seguridad (Q3)

```bash
pnpm audit --audit-level=high        # dependencias JS
pip-audit -r apps/ml-service/requirements.txt
trivy image maintainpredict-web:ci
```

Política: **0 HIGH y 0 CRITICAL** en el momento de la entrega. Un hallazgo MEDIUM se documenta y se planifica.
Complementa a `docs/SEGURIDAD.md`, donde están las brechas conocidas del diseño (B1–B12).

### 4.4 Accesibilidad (Q5)

`axe-core` en pruebas de componentes. Umbral: **0 violaciones críticas o graves**. Las de impacto moderado/menor
(p. ej. `region`, que depende del layout real) no bloquean; `color-contrast` se comprueba en el navegador, porque
jsdom no calcula colores. Componentes cubiertos hoy: `AuditTable`, `PredictionDetail`, `PaginationBar`,
`PasswordChecklist`, `ExplanationFooter`.

### 4.5 Disponibilidad (Q6)

- **Aplicación:** `GET /api/health`.
- **Postgres:** `pg_isready` (healthcheck de Compose).
- **ML:** `GET /ml/health` (healthcheck de la imagen).
- **Caddy (producción):** health check del `reverse_proxy` cada 30 s, que retira instancias que no responden.
- **Falta:** monitorización externa con histórico y alerta. Sin ella, 99,5 % es una aspiración, no una medida.

---

## 5. Métricas del sistema (lo que se observa en Operación)

`Observabilidad` (`/observability`) expone las métricas que el propio sistema calcula, y son parte del control de
calidad del producto:

| Métrica | Objetivo | Umbral de alerta | Fuente |
|---|---|---|---|
| Precisión del modelo | ≥ 85 % | < 85 % | `model_metrics` (WF-04) |
| Recall | — | < 0,70 | `model_metrics` |
| F1 | — | < 0,75 | `model_metrics` |
| AUC | — | < 0,85 | `model_metrics` |
| Falsos positivos | ≤ 10 % | > 10 % | `lib/observability/false-positives.ts` |
| Paradas evitadas | −60 % | Desviación sostenida | `business_kpis` |
| Ahorro | −30 % | Desviación sostenida | `business_kpis` |

Cuando una de estas cruza su umbral, el protocolo está en `docs/TROUBLESHOOTING.md` (rendimiento y agentes) y en
`docs/RISK_STRATEGY.md`.

---

## 6. Definición de «hecho» (Definition of Done)

Una tarea está terminada cuando:

1. Compila: `tsc --noEmit` sin errores.
2. Pasa sus pruebas y **las que ya existían**: `vitest run` completo en verde.
3. Pasa el humo: `scripts/smoke-test.sh` 27/27.
4. No rompe permisos: `scripts/check-links.sh` 80/80 si toca rutas o roles.
5. Si toca escrituras, `scripts/acceptance-writes.sh` en verde.
6. Si toca n8n, los workflows están reimportados, activos y en `success`, y el correo se ha visto en MailHog.
7. Se documenta: el cambio se refleja en el documento correspondiente, **o** se declara explícitamente fuera de
   alcance.
8. No introduce secretos ni credenciales reales en el repositorio.
9. Si toca el esquema, hay volcado previo (`scripts/backup-db.sh`) y una vía de vuelta.

Los puntos 1–5 son verificables con comandos; el 7 es el que más se olvida, y en este proyecto ya costó rehacer
documentación que prometía cosas que no existían.

---

## 7. Gestión de defectos

### 7.1 Severidad

| Severidad | Criterio | Ejemplo de este proyecto |
|---|---|---|
| **S1 — Crítica** | Impide operar o corrompe datos | Subir una foto completaba la orden (**H-K1**) |
| **S2 — Alta** | Una función declarada no funciona | El estado `maintenance` de sensores violaba el `CHECK` (**H-K2**) |
| **S3 — Media** | Incorrecto pero con alternativa | Una orden rechazada bloquea el `auto-plan` (**H-K4**) |
| **S4 — Baja** | Cosmético o de texto | El filtro de órdenes no ofrece `cancelled` (**H-K3**, ya corregido) |

### 7.2 Flujo

1. Se registra con **reproducción** y severidad (los H-K1…H-K7 de `docs/PLAN_CIERRE_BRECHAS.md` son el ejemplo).
2. Si es S1/S2, se corrige antes de cerrar la fase y **con prueba de regresión**
   (`tests/components/technician-order-view.test.tsx` nació así).
3. Si es S3/S4, se registra con su fase natural.
4. Se cierra solo cuando existe prueba o verificación manual documentada.

---

## 8. Informe de calidad

Al cerrar cada fase se publica el resumen en el documento de la fase y en `HANDOFF.md`. Formato:

```
Fase N — fecha
  tsc          : 0 errores
  vitest       : 84/84 (20 ficheros)
  humo         : 27/27
  escrituras   : 20/20
  check-links  : 80/80
  e2e HITL     : aprobar 14/14 · rechazar 15/15
  cobertura    : (pendiente L.1)
  p95          : (pendiente L.2)
  vulnerabilid.: (pendiente L.3)
```

Cualquier desviación respecto a la fase anterior se explica en el mismo informe. Un número que baja sin
explicación es un fallo de proceso.
