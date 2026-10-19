# MaintainPredict AI

**Predicción Inteligente de Mantenimiento Industrial** — Arquitectura Agéntica D.

Plataforma empresarial que predice fallas de equipos industriales con **7 días de anticipación** y genera órdenes de
mantenimiento automáticamente, usando **arquitectura agéntica (PredictorAgent + PlannerAgent)**, **RAG sobre
manuales y normativa (ISO 9001/45001/10816)**, **orquestación n8n** y **PostgreSQL + pgvector**.

## KPIs Objetivo

| Indicador | Objetivo | Medición |
|---|---|---|
| Paradas no planificadas | **−60%** | `business_kpis.downtime_avoided_h` |
| Costes de mantenimiento | **−30%** | `business_kpis.cost_savings_eur` |
| Precisión del modelo | **≥ 85%** | `model_metrics.precision` |
| Falsos positivos | **≤ 10%** | `model_metrics.false_positives` |

El estado real de cada objetivo (qué está medido y qué es deuda reconocida) está en
[docs/PLAN_CALIDAD.md](docs/PLAN_CALIDAD.md).

## Stack Tecnológico

- **Frontend**: Next.js 14+ (App Router) · React 18 · TypeScript · Tailwind CSS · Recharts · PWA
- **Backend**: Next.js App Router API Routes · Drizzle ORM · jose (JWT) · Zod · bcrypt
- **Datos**: PostgreSQL 16 + pgvector (RAG semántico)
- **Agentes**: chat con Groq (`openai/gpt-oss-120b`) y embeddings del RAG con Google Gemini
  (`gemini-embedding-001`, 1536 dims) · cualquier proveedor compatible con la API de OpenAI vía `OPENAI_BASE_URL` ·
  ML service FastAPI (RandomForest / GradientBoosting, entrenado al primer uso)
- **Orquestación**: n8n 1.62 (WF-01 sensor intake · WF-02 order generation · WF-03 weekly report · WF-04 metrics sync)
- **Infra**: Docker Compose · Caddy (TLS) · GitHub Actions (CI/CD) · MailHog · Mocks SCADA/ERP/SMS

## Requisitos

Docker Engine 24+ con el plugin `docker compose` (v2), 6 GB de RAM y 15 GB de disco. Para desarrollo local en el
host: Node 20 (`.nvmrc`), pnpm 9.12 y, en Windows, Git Bash para los scripts. Detalle en
[docs/MANUAL_INSTALACION.md](docs/MANUAL_INSTALACION.md) §1.

## Quick Start (Desarrollo)

```bash
# 1. Configuración: crea el .env a partir de la plantilla
cp .env.example .env

# 2. Revisa los secretos (JWT_SECRET, JWT_REFRESH_SECRET, INTERNAL_TOKEN, SENSOR_API_KEY,
#    POSTGRES_PASSWORD, N8N_ENCRYPTION_KEY). Ver docs/MANUAL_INSTALACION.md §3.3.

# 3. Levanta los 8 servicios (el primer build tarda 5-10 min)
docker compose up -d --build

# 4. Usuarios demo (obligatorio: las contraseñas se generan con bcrypt, no viven en el SQL)
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:users'

# 5. Base de conocimiento del RAG (opcional; requiere GEMINI_API_KEY)
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:kb'

# 6. Workflows de n8n: importar, activar y reiniciar (sin el restart, los webhooks dan 404)
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
docker compose exec -T n8n n8n update:workflow --all --active=true
docker compose restart n8n

# 7. Comprobar
curl -s http://localhost:3000/api/health
```

Abre http://localhost:3000 y entra con `admin@mp.ai` / `Password123!`.

> El **paso 6 no es opcional**: n8n registra sus webhooks al arrancar. Si importas y no reinicias, responden 404.
> Es el fallo más repetido al montar el sistema.

### URLs de los Servicios

| Servicio | URL | Credenciales por defecto |
|---|---|---|
| **Web / Dashboard** | http://localhost:3000 | Ver credenciales demo abajo |
| **n8n (Orquestador)** | http://localhost:5678 | `admin` / `admin_change_me` |
| **MailHog (SMTP)** | http://localhost:8025 | — |
| **ML Service (FastAPI)** | http://localhost:8000/docs | — |
| **Mock SCADA** | http://localhost:9000 | API key: `scada_key` |
| **Mock ERP** | http://localhost:9001 | API key: `erp_key` |
| **Mock SMS** | http://localhost:9002 | — |

### Credenciales Demo

| Rol | Email | Contraseña |
|---|---|---|
| **admin** | `admin@mp.ai` | `Password123!` |
| **supervisor** | `supervisor@mp.ai` | `Password123!` |
| **planner** | `planner@mp.ai` | `Password123!` |
| **technician** | `tec1@mp.ai` | `Password123!` |
| **technician** | `tec2@mp.ai` | `Password123!` |

> Son credenciales de demostración, publicadas aquí a propósito. **Cámbialas antes de cualquier uso real.**

## Producción

La guía completa es [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). El resumen:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Diferencias clave: solo **Caddy publica 80/443** (el resto de servicios son internos), no hay mocks ni MailHog, se
usan integraciones reales (`INTEGRATIONS_MODE=real`) y se añaden `caddy` (TLS automático) y `pg-backup` (copias).

## Documentación

| Documento | Para qué sirve |
|---|---|
| [Manual de instalación](docs/MANUAL_INSTALACION.md) | Instalar, verificar, operar y **desinstalar** |
| [Manual de usuario](docs/MANUAL_USUARIO.md) | Uso diario: pantallas, roles, órdenes y HITL |
| [Arquitectura del Sistema](docs/ARCHITECTURE.md) | Contexto, contenedores, componentes, flujos, estados y despliegue |
| [Especificación API REST](docs/API.md) | Endpoints con autenticación y ejemplos |
| [Diccionario de Datos](docs/DATA_DICTIONARY.md) | Tablas, columnas y reglas de negocio |
| [Workflows n8n](docs/N8N_WORKFLOWS.md) | WF-01 a WF-04 y cómo editarlos sin romper el JSON |
| [Integraciones](docs/INTEGRATIONS.md) | ERP, SCADA, SMS y Email (adaptadores, mocks y paso a real) |
| [PWA](docs/PWA.md) | Service worker: cómo funciona, cómo invalidarlo y limitaciones |
| [Seguridad](docs/SEGURIDAD.md) | Modelo de seguridad y brechas conocidas (B1–B12) con archivo y línea |
| [Plan de pruebas](docs/PLAN_PRUEBAS.md) | Qué se prueba, con qué y cuánto se cubre |
| [Plan de calidad](docs/PLAN_CALIDAD.md) | Objetivos medibles, puertas de calidad y deuda reconocida |
| [Estrategia de Riesgos](docs/RISK_STRATEGY.md) | Datos sucios, drift y falsos positivos |
| [Guía de Despliegue](docs/DEPLOYMENT.md) | Checklist de puesta en producción |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Catálogo de fallos reales y su diagnóstico |
| [Plan de cierre de brechas](docs/PLAN_CIERRE_BRECHAS.md) | Hoja de ruta contra la especificación completa |
| [datasets públicos](data/README.md) | Catálogo de datasets reales (licencia, tamaño, uso y prioridad) |
| [importadores](scripts/import/README.md) | Cargar datos reales (AI4I, Azure PdM, C-MAPSS, OSHA) en < 1 h |
| [HANDOFF](HANDOFF.md) | Estado exacto del proyecto y convenciones de trabajo |

## Rutas principales

| Ruta | Descripción |
|---|---|
| `/login` | Autenticación |
| `/dashboard` | KPIs, distribución de fallas, equipos críticos |
| `/equipment` | Listado + detalle con lecturas de sensores |
| `/sensors` | Sensores con sus umbrales y últimas lecturas (alta: supervisor/admin) |
| `/predictions` | Predicciones con alerta y botón Auto-plan · detalle con pesos por señal y órdenes derivadas |
| `/orders` | Órdenes con aprobación HITL y cierre |
| `/reports` | Reporte semanal (JSON / PDF / XLSX / DOCX) |
| `/observability` | Métricas del modelo, KPIs, falsos positivos, datos sucios |
| `/integrations` | Estado en vivo de ERP, SCADA, SMS y Email (modo, latencia y detalle) |
| `/audit` | Bitácora de auditoría con filtros (solo admin) |
| `/users` | Usuarios, roles, activación y restablecimiento de contraseña (solo admin) |
| `/profile` | Mi perfil: cambio de mi propia contraseña |
| `/technician` | PWA móvil del técnico |
| `/technician/checklists` | Checklists pendientes del técnico (PWA móvil) |

> Las fichas `/equipment/:id`, `/orders/:id` y `/predictions/:id` responden **404** si el id no existe o no
> es numérico (`lib/db/detail-guard.ts` comprueba la existencia antes de renderizar). El menú lateral se
> filtra por permisos y `./scripts/check-links.sh` verifica la matriz completa de rutas × rol.

## Estructura

```
apps/
  web/            Next.js 14 + React + API + agentes + RAG
  ml-service/     FastAPI + RandomForest (entrena al primer uso)
data/             Catálogo de datasets públicos (README) + descargas locales (ignoradas por git)
infra/
  n8n/workflows/  WF-01..04 exportables
  postgres/init/  Esquema, objetos (00 … 05) y datos de ejemplo (06 … 11)
  postgres/migrations/  Migraciones manuales (particionado de readings, sin aplicar)
  caddy/          Reverse proxy TLS
  mocks/          SCADA / ERP / SMS simulados
docs/             Documentación
scripts/          Utilidades (backup, restore, reset-db, vacuum-db, smoke-test, acceptance-writes, check-links, e2e-hitl)
scripts/import/   Importadores de datasets públicos (opcionales, con --dry-run)
```

> **Datos de ejemplo.** No hay un `02_seed.sql` único: los seis seeds de `infra/postgres/init/`
> (`06_seed_core` … `11_seed_audit`) siembran 7 usuarios, 500 equipos, ~1.500 sensores,
> ~600.000 lecturas, ~800 predicciones, ~600 órdenes, 30 documentos de KB, 150 métricas, 155
> KPIs y ~5.000 entradas de bitácora. Son idempotentes y su volumen se ajusta por variables
> (`SEED_DAYS` / `SEED_STEP_MINUTES` en `reset-db.sh`).

## Pruebas

Suite **84 pruebas en 20 ficheros** (vitest) + pruebas de sistema contra el stack. Detalle en
[docs/PLAN_PRUEBAS.md](docs/PLAN_PRUEBAS.md).

```bash
# Compilación y suite (dentro del contenedor: mismas versiones que CI)
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsc --noEmit'
docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/vitest run'

# Sistema, desde el host (Windows: usar Git Bash)
bash scripts/smoke-test.sh            # 27 comprobaciones de API
bash scripts/acceptance-writes.sh     # 20 comprobaciones de escritura (crean y limpian)
bash scripts/check-links.sh           # 80 comprobaciones de rutas × rol y 404

# HITL de punta a punta: dispara WF-02, lee el correo real en MailHog y resuelve por la API
# (requiere Node en el host; crea órdenes de demo y no las borra)
node scripts/e2e-hitl.mjs approve
node scripts/e2e-hitl.mjs reject

# Diagnóstico de integraciones y de agentes
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm integrations:check'
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm agents:check'
```

## Operación

```bash
bash scripts/backup-db.sh                  # volcado de la base de la app + la de n8n
bash scripts/restore-db.sh <volcado.sql.gz>
FORCE=1 bash scripts/reset-db.sh           # recrea la base y siembra (DESTRUCTIVO: backup antes)
bash scripts/vacuum-db.sh                  # VACUUM de las tablas calientes
```

Los fallos habituales y su diagnóstico están en [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). Para retirar el
sistema sin dejar restos, [docs/MANUAL_INSTALACION.md](docs/MANUAL_INSTALACION.md) §8.

## Estado del proyecto

El avance contra la especificación, las fases abiertas y los hallazgos ya resueltos (H-K1…H-K7) se llevan en
[docs/PLAN_CIERRE_BRECHAS.md](docs/PLAN_CIERRE_BRECHAS.md). El corte más reciente, con los comandos de validación y
las convenciones de trabajo, está en [HANDOFF.md](HANDOFF.md).

## Licencia

MIT (o la que defina la organización).
