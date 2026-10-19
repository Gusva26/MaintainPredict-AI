# Manual de instalación — MaintainPredict AI

Guía para poner el sistema en marcha desde cero, verificarlo y retirarlo sin dejar restos. Está escrita para
alguien que **no conoce el proyecto**: cada comando se puede copiar tal cual y cada paso dice qué debe verse al
terminar.

> **Camino soportado: Docker Compose.** Todo el sistema (web, base de datos, ML, n8n, mocks y correo de desarrollo)
> se levanta con un comando. La instalación nativa sin contenedores no está soportada ni probada; si necesitas
> depurar la aplicación en local, usa `pnpm dev` **contra** los servicios de Docker (ver §3.9).

---

## 0. Qué se va a instalar

| Servicio | Contenedor | Puerto (dev) | Para qué sirve | ¿Obligatorio? |
|---|---|---|:--:|
| `web` | `mp_web` | 3000 | Aplicación Next.js: interfaz, API, agentes y reportes | Sí |
| `postgres` | `mp_postgres` | 5432 | PostgreSQL 16 + pgvector: datos, RAG y workflows de n8n | Sí |
| `ml-service` | `mp_ml` | 8000 | FastAPI con RandomForest: inferencia | Sí |
| `n8n` | `mp_n8n` | 5678 | Orquestación: ingesta, generación de órdenes, reportes | Sí |
| `mailhog` | `mp_mailhog` | 8025 / 1025 | Correo de desarrollo: **captura** todos los emails | Dev |
| `mock-scada` | `mp_mock_scada` | 9000 | SCADA simulado | Dev |
| `mock-erp` | `mp_mock_erp` | 9001 | ERP simulado (repuestos) | Dev |
| `mock-sms` | `mp_mock_sms` | 9002 | Pasarela SMS simulada | Dev |
| `reports-init` | — | — | Prepara el volumen de reportes y termina | Sí (se ejecuta una vez) |

En producción (`docker-compose.prod.yml`) **no** existen los mocks ni MailHog, y se añaden `caddy` (TLS) y
`pg-backup` (copias). Solo Caddy publica puertos.

---

## 1. Requisitos

### 1.1 Software

| Componente | Mínimo | Recomendado | Notas |
|---|---|---|---|
| Docker Engine | 24 | última estable | Con el plugin `docker compose` (v2) |
| Docker Compose | 2.20 | última | Se usa `docker compose`, no `docker-compose` |
| RAM | 6 GB | 8–16 GB | El build de Next y el entrenamiento del modelo consumen |
| Disco | 15 GB libres | 40 GB SSD | Imágenes, volúmenes y reportes |
| Node.js | 20 | 20 LTS | Solo si usas `pnpm dev` en el host (`.nvmrc` = 20) |
| pnpm | 9.12 | 9.12 | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| Git | cualquiera | — | Para obtener el código |
| Bash | — | — | Los scripts son `.sh`; en Windows, Git Bash |

### 1.2 Red y puertos

En desarrollo se publican estos puertos en `localhost`. Si alguno está ocupado, cámbialo en `docker-compose.yml`
(y en la URL correspondiente del `.env`).

| Puerto | Servicio | Si está ocupado… |
|---|---|---|
| 3000 | web | cambia `APP_PORT` y el mapeo `3000:3000` |
| 5432 | postgres | cambia el mapeo, no `POSTGRES_PORT` interno |
| 8000 | ml-service | cambia el mapeo y `ML_SERVICE_URL` |
| 5678 | n8n | cambia el mapeo y `N8N_WEBHOOK_BASE_URL` |
| 8025 / 1025 | MailHog (UI / SMTP) | cambia el mapeo |
| 9000 / 9001 / 9002 | mocks | cambia el mapeo y las URL de integración |

> **Windows:** ejecuta los scripts con Git Bash:
> `& "C:\Program Files\Git\bin\bash.exe" scripts/smoke-test.sh`.
> `bash` a secas en PowerShell suele apuntar a WSL, donde `docker` puede no existir o no compartir el contexto.

---

## 2. Instalación rápida (desarrollo)

Para quien ya tiene Docker y solo quiere verlo funcionar. Tiempo estimado: **5–10 minutos** (el primer build es el
90 %).

```bash
# 1) Código
git clone <url-del-repositorio> maintainpredict-ai && cd maintainpredict-ai

# 2) Configuración
cp .env.example .env

# 3) Arranque (construye y levanta todo)
docker compose up -d --build

# 4) Usuarios demo (el resto de los datos de ejemplo ya los sembró el arranque)
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:users'

# 5) Base de conocimiento del RAG (necesita GEMINI_API_KEY; si no la tienes, sáltalo)
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:kb'

# 6) Workflows de n8n (importar, activar y reiniciar)
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
docker compose exec -T n8n n8n update:workflow --all --active=true
docker compose restart n8n
```

**Comprobación mínima:**

```bash
docker compose ps                                  # todo "running"; ninguno en "restarting"
curl -s http://localhost:3000/api/health           # 200
```

Abre `http://localhost:3000` y entra con `admin@mp.ai` / `Password123!`.

> **El paso 6 no es opcional.** n8n registra sus webhooks al arrancar: si importas y no reinicias, los webhooks
> responden **404**. Es el fallo más repetido al montar el sistema.

---

## 3. Instalación paso a paso

### 3.1 Obtener el código

```bash
git clone <url-del-repositorio> maintainpredict-ai
cd maintainpredict-ai
```

Si recibes un archivo comprimido, descomprímelo y sitúate en la carpeta que contiene `docker-compose.yml`.
Comprueba que estás en la raíz:

```bash
ls docker-compose.yml package.json pnpm-workspace.yaml
```

### 3.2 Crear el fichero de entorno

```bash
cp .env.example .env
chmod 600 .env        # en Linux/macOS: solo tu usuario puede leerlo
```

`.env` **no se versiona** (está en `.gitignore`). Lo que se versiona es `.env.example`, con valores de relleno.

### 3.3 Cambiar los secretos obligatorios

En desarrollo puedes arrancar con los valores de ejemplo, pero **tres de ellos son claves publicadas** y el sistema
no te avisará si los dejas:

| Variable | Cómo generarla | Por qué |
|---|---|---|
| `JWT_SECRET` | `openssl rand -base64 48` | Firma los tokens de acceso; con el valor de ejemplo, cualquiera puede fabricar una sesión |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` | Distinto del anterior |
| `INTERNAL_TOKEN` | `openssl rand -hex 32` | Autentica las llamadas de n8n; su valor por defecto otorga rol de sistema |
| `SENSOR_API_KEY` | `openssl rand -hex 32` | Autentica la ingesta de sensores |
| `POSTGRES_PASSWORD` | contraseña fuerte | Debe coincidir con `DATABASE_URL` |
| `N8N_ENCRYPTION_KEY` | `openssl rand -hex 32` | Cifra las credenciales de n8n; **no cambiarla tras el primer arranque** |

Ejemplo de edición mínima:

```dotenv
POSTGRES_PASSWORD=una_clave_larga_y_unica
DATABASE_URL=postgresql://mp_user:una_clave_larga_y_unica@postgres:5432/maintainpredict
JWT_SECRET=<salida de openssl rand -base64 48>
JWT_REFRESH_SECRET=<otra salida distinta>
INTERNAL_TOKEN=<salida de openssl rand -hex 32>
SENSOR_API_KEY=<salida de openssl rand -hex 32>
N8N_ENCRYPTION_KEY=<salida de openssl rand -hex 32>
```

> La contraseña de Postgres se fija **al crear el volumen**. Si cambias `POSTGRES_PASSWORD` después del primer
> arranque, tendrás que cambiarla también dentro de PostgreSQL o recrear el volumen
> (`docs/TROUBLESHOOTING.md` §2.1).

### 3.4 Construir y levantar

```bash
docker compose up -d --build
```

Qué ocurre, en orden:

1. Se construyen las imágenes de `web`, `ml-service` y los mocks.
2. Arranca `postgres` y, cuando su *healthcheck* pasa, se ejecutan los scripts de `infra/postgres/init/` (esquema y
   datos iniciales). **Solo la primera vez**, con el volumen vacío.
3. `reports-init` prepara el volumen de reportes y termina.
4. Arrancan `ml-service`, `n8n`, `web`, MailHog y los mocks.

Sigue el arranque:

```bash
docker compose ps
docker compose logs -f --tail=50 web
```

Señales de que va bien: todos en `running`, `mp_postgres` en `healthy`, y en el log de `web`
`Ready in ...` o `started server on 0.0.0.0:3000`. Si `web` reinicia en bucle, ve a
`docs/TROUBLESHOOTING.md` §1.1.

### 3.5 Sembrar los usuarios demo

El esquema crea las tablas y **los datos de ejemplo** (los seis seeds `06_seed_core` …
`11_seed_audit` se aplican solos la primera vez: 500 equipos, ~1.500 sensores, ~600.000
lecturas, ~800 predicciones, ~600 órdenes, 30 documentos de KB, 150 métricas y 155 KPIs).

Lo que **no** trae el SQL son las contraseñas: bcrypt no tiene sentido escribirlo en un script
de base de datos. Ese paso lo hace este seed de Node, que es idempotente (actualiza si existe,
inserta si no):

```bash
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:users'
```

Debe imprimir siete líneas, una por cuenta (`+ inserted` o `? updated`):

| Rol | Email | Contraseña |
|---|---|---|
| admin | `admin@mp.ai` | `Password123!` |
| supervisor | `supervisor@mp.ai` | `Password123!` |
| planner | `planner@mp.ai` | `Password123!` |
| technician | `tec1@mp.ai` | `Password123!` |
| technician | `tec2@mp.ai` | `Password123!` |
| technician | `tec3@mp.ai` | `Password123!` |
| technician | `tec4@mp.ai` | `Password123!` |

> **Cámbialas antes de cualquier uso real.** Están publicadas en el README y en este manual.

### 3.6 Vectorizar la base de conocimiento (RAG)

El RAG necesita que los documentos de la base de conocimiento estén convertidos a embeddings. **Requiere un
proveedor de embeddings de 1536 dimensiones** (Gemini u OpenAI; Groq no ofrece embeddings). El script solo rellena
los documentos que tienen `embedding IS NULL`, así que también sirve para vectorizar lo que añadan los importadores.

```bash
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:kb'
```

Si no tienes clave de embeddings, puedes arrancar sin este paso: la aplicación funciona, pero las predicciones no
citarán documentación (`predictions.features.rag_sources` quedará vacío) y el planner perderá ese contexto. El seed
de la base completa se puede omitir con `SKIP_KB=1` al usar `scripts/reset-db.sh`.

### 3.7 Importar los workflows de n8n

Los cuatro workflows viven como JSON en `infra/n8n/workflows/`. Importar no basta: hay que activarlos y reiniciar
para que n8n registre los webhooks.

```bash
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
docker compose exec -T n8n n8n update:workflow --all --active=true
docker compose restart n8n
```

Verifica en `http://localhost:5678` (`admin` / `admin_change_me`) que los cuatro están **activos**:

| Workflow | Qué hace |
|---|---|
| WF-01 | Ingesta de lecturas desde el SCADA |
| WF-02 | Generación de orden de mantenimiento (incluye el HITL) |
| WF-03 | Informe semanal |
| WF-04 | Sincronización de métricas |

> **No edites los JSON a mano.** Llevan JavaScript y HTML embebidos; un editor de texto rompe los escapes.
> Para cambiar un workflow, parsea, muta y reserializa (ver `docs/N8N_WORKFLOWS.md`).

### 3.8 Verificar la instalación

Ejecuta las cuatro comprobaciones en este orden. La primera es la más rápida y descarta lo básico.

```bash
# 1) Salud
curl -s http://localhost:3000/api/health

# 2) Humo de API (27 comprobaciones: auth, RBAC, CRUD, reportes, 404…)
bash scripts/smoke-test.sh

# 3) Rutas y matriz de permisos (80 comprobaciones)
bash scripts/check-links.sh

# 4) Integraciones y agentes (dentro del contenedor)
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm integrations:check'
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm agents:check'
```

Resultado esperado: humo `27/27` y `check-links` `pass=80 fail=0`. Si algo falla, el propio script dice qué
comprobación y con qué código HTTP; cruza el síntoma con `docs/TROUBLESHOOTING.md`.

**Prueba funcional de extremo a extremo (opcional, crea datos reales):**

```bash
node scripts/e2e-hitl.mjs approve     # dispara WF-02, lee el correo en MailHog y aprueba
node scripts/e2e-hitl.mjs reject      # igual, pero rechaza
```

Necesita Node en el host (no dentro del contenedor) y el stack levantado. Deja órdenes de demo: no las borra.

### 3.9 Desarrollo con recarga en caliente (opcional)

Si vas a modificar la interfaz o la API, puedes ejecutar Next en el host y dejar el resto en Docker:

```bash
# 1) Levanta solo los servicios de apoyo
docker compose up -d postgres ml-service n8n mailhog mock-scada mock-erp mock-sms

# 2) En el host
corepack enable
pnpm install
pnpm --filter web dev
```

Ajusta en `.env` las URL que apuntan a nombres de servicio (`postgres`, `ml-service`, `n8n`) por `localhost` **solo
para el proceso del host**, sin cambiar el `.env` que usan los contenedores. Este camino no está cubierto por los
scripts de verificación; para validar, vuelve al stack completo.

---

## 4. Variables de entorno

`.env.example` es la referencia completa. Estas son las que de verdad cambian el comportamiento:

### 4.1 Aplicación y base de datos

| Variable | Ejemplo | Para qué |
|---|---|---|
| `NODE_ENV` | `development` | `production` activa el build de producción |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL pública que ve el navegador |
| `APP_PORT` | `3000` | Puerto de la app |
| `POSTGRES_*`, `DATABASE_URL` | ver §3.3 | Conexión; `DATABASE_URL` manda |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | aleatorios | Firma de tokens (deben ser distintos) |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `8h` / `7d` | Vida de la sesión |

### 4.2 Agentes y RAG

| Variable | Ejemplo | Para qué |
|---|---|---|
| `OPENAI_API_KEY` | `sk-...` | Clave del proveedor de chat |
| `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` | Vacío = OpenAI; también vale OpenRouter |
| `OPENAI_CHAT_MODEL` | `openai/gpt-oss-120b` | Modelo de chat |
| `GEMINI_API_KEY` | `...` | Embeddings del RAG |
| `OPENAI_EMBEDDING_MODEL`, `OPENAI_EMBEDDING_DIM` | `gemini-embedding-001`, `1536` | Debe casar con `vector(1536)` |
| `LLM_TIMEOUT_MS`, `AGENT_TIMEOUT_MS`, `AGENT_RETRIES` | `30000`, `45000`, `2` | Resiliencia |

### 4.3 Integraciones

| Variable | Ejemplo | Para qué |
|---|---|---|
| `INTEGRATIONS_MODE` | `mock` / `real` | Selecciona los adaptadores |
| `SCADA_BASE_URL`, `SCADA_API_KEY` | `http://mock-scada:9000` | Lecturas en vivo |
| `ERP_BASE_URL`, `ERP_API_KEY` | `http://mock-erp:9001` | Repuestos |
| `SMS_PROVIDER`, `SMS_*` | `mock` / `twilio` | Avisos al técnico |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_*` | `mailhog:1025` en dev | Correo |
| `INTEGRATION_TIMEOUT_MS` | `5000` | Corte por integración |

### 4.4 n8n y enlaces

| Variable | Ejemplo | Para qué |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | `http://n8n:5678` | Desde la web hacia n8n (red interna) |
| `APP_BASE_URL` | `http://web:3000` | Desde n8n hacia la web (red interna) |
| `PUBLIC_APP_URL` | `http://localhost:3000` | **Enlaces de los emails**; debe ser visible desde el navegador |
| `INTERNAL_TOKEN` | aleatorio | Autenticación de n8n contra la API |
| `SUPERVISOR_EMAIL` | `supervisor@mp.ai` | Destinatario del HITL |
| `N8N_BASIC_AUTH_USER/PASSWORD` | `admin` / … | Acceso a la UI de n8n |
| `N8N_ENCRYPTION_KEY` | aleatorio | Cifrado de credenciales de n8n |

> **`PUBLIC_APP_URL` ≠ `APP_BASE_URL`.** Confundirlos hace que los correos enlacen a `http://web:3000`, que no
> existe desde el navegador del usuario. Es un fallo real que costó una sesión de depuración.

### 4.5 Reservadas

`OTEL_EXPORTER_OTLP_ENDPOINT` y `LOG_LEVEL` existen en `.env.example` pero **no hay recolector OpenTelemetry** en
el compose: no cambian nada hoy. `REPORT_SHEET_ID` tampoco se usa en el flujo actual.

---

## 5. Puesta en producción

La guía completa es `docs/DEPLOYMENT.md`. Lo imprescindible:

```bash
# En el servidor, con el dominio apuntando por DNS
cp .env.example .env
# Editar: APP_DOMAIN, DOMAIN, N8N_HOST_EXTERNAL, PUBLIC_APP_URL=https://<dominio>,
#         todos los secretos, INTEGRATIONS_MODE=real y las credenciales reales

docker compose -f docker-compose.prod.yml up -d --build
```

Diferencias que debes tener presentes:

| Desarrollo | Producción |
|---|---|
| `docker-compose.yml` | `docker-compose.prod.yml` |
| Puertos 3000/5432/8000 publicados | **Solo Caddy (80/443)**; el resto es interno |
| Mocks + MailHog | Integraciones reales + SMTP real |
| HTTP | TLS automático con Caddy (Let's Encrypt) |
| Sin copias | Servicio `pg-backup` (aún **sin cifrar**: fase J.1) |

No olvides: eliminar las cuentas demo, poner `PUBLIC_APP_URL` al dominio real, y comprobar que
`https://<dominio>/api/health` responde antes de dar por desplegado.

---

## 6. Operación básica

### 6.1 Copias de seguridad

```bash
bash scripts/backup-db.sh
# → infra/postgres/backups/maintainpredict_<fecha>.sql.gz
# → infra/postgres/backups/n8n_<fecha>.sql.gz
```

Vuelca **dos** bases: la de la aplicación y la de n8n (workflows y credenciales). Guarda ambas.

### 6.2 Restauración

```bash
bash scripts/restore-db.sh infra/postgres/backups/maintainpredict_20261018_120000.sql.gz
```

Sobrescribe la base actual y **no pregunta**. Para n8n, detén el contenedor antes de restaurar.

### 6.3 Recrear la base (destructivo)

```bash
bash scripts/backup-db.sh            # siempre primero
FORCE=1 bash scripts/reset-db.sh     # recrea + aplica init/ + siembra usuarios + KB
SKIP_KB=1 FORCE=1 bash scripts/reset-db.sh   # sin embeddings
```

### 6.4 Logs y estado

```bash
docker compose ps
docker compose logs -f --tail=100 web
docker compose logs -f --tail=100 n8n
docker compose stats --no-stream
```

### 6.5 Actualizar el sistema

```bash
bash scripts/backup-db.sh
git pull
docker compose up -d --build
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/
docker compose exec -T n8n n8n update:workflow --all --active=true
docker compose restart n8n
```

Si cambió el esquema, aplica la migración correspondiente **antes** de reiniciar la web. Tras desplegar, sube la
constante `CACHE` de `apps/web/public/sw.js` para invalidar la PWA (`docs/PWA.md`).

---

## 7. Problemas comunes al instalar

| Síntoma | Causa probable | Solución rápida |
|---|---|---|
| `web` reinicia en bucle | `node_modules` del contenedor incompleto | `docker compose up -d --build --force-recreate web`; ver TROUBLESHOOTING §1.1 |
| `password authentication failed` | Contraseña distinta a la del volumen | `ALTER USER` o recrear volumen (TROUBLESHOOTING §2.1) |
| `relation "..." does not exist` | `init/` no se aplicó | `FORCE=1 bash scripts/reset-db.sh` |
| Webhooks de n8n en 404 | No se reinició n8n tras importar | `docker compose restart n8n` |
| Correo HITL no llega | MailHog vacío o `SUPERVISOR_EMAIL` mal | Abrir `http://localhost:8025` |
| El enlace del correo apunta a `web:3000` | `PUBLIC_APP_URL` mal | Poner la URL pública |
| Predicción sin fuentes RAG | KB sin vectorizar o sin clave de embeddings | Ejecutar §3.6 |
| `429` al ingerir lecturas | Límite de 600 req/min por clave | Es intencionado; esperar o subir el límite |
| El PDF devuelve 500 | `pdfkit` empaquetado por webpack | Comprobar `serverComponentsExternalPackages` |
| La UI muestra una versión antigua | Caché del service worker | Subir `CACHE` en `sw.js` |

El catálogo completo, con causa y diagnóstico, está en **`docs/TROUBLESHOOTING.md`**.

---

## 8. Desinstalación

### 8.1 Parar sin borrar nada

```bash
docker compose stop
```

Los contenedores se detienen; los volúmenes y los datos siguen ahí. Para volver: `docker compose start`.

### 8.2 Retirar contenedores y red (conservando datos)

```bash
docker compose down
```

Elimina contenedores y la red, pero **conserva los volúmenes** (`pg_data`, `n8n_data`, `reports_data`,
`uploads_data`, etc.). Es la parada limpia habitual.

### 8.3 Borrado completo (irreversible)

```bash
# 1) Copia de seguridad FUERA del proyecto
bash scripts/backup-db.sh
cp -r infra/postgres/backups ~/backups-maintainpredict

# 2) Contenedores + volúmenes + red
docker compose down -v

# 3) Imágenes construidas (los mocks usan node:20-alpine directamente)
docker image rm maintainpredict-ai-web maintainpredict-ai-ml-service 2>/dev/null

# 4) Restos si usaste producción
docker compose -f docker-compose.prod.yml down -v

# 5) Proyecto (incluye .env con secretos)
cd ..
rm -rf maintainpredict-ai
```

> `down -v` borra **todo** el estado: base de datos, workflows y credenciales de n8n, reportes y fotos subidas.
> Si solo quieres reinstalar la aplicación conservando datos, usa `down` sin `-v`.

### 8.4 Qué conservar antes de borrar

| Elemento | Dónde | Por qué |
|---|---|---|
| Volcados de la app y de n8n | `infra/postgres/backups/` | Única forma de recuperar órdenes e histórico |
| `.env` (en un gestor de secretos) | raíz | Sin `N8N_ENCRYPTION_KEY`, las credenciales de n8n no se pueden descifrar |
| Reportes generados | `reports_data` | Si no se han descargado |
| Fotos de intervención | `uploads_data` | Evidencia del trabajo del técnico |

---

## 9. Anexos

### 9.1 Credenciales de desarrollo

| Servicio | Usuario | Contraseña |
|---|---|---|
| App (admin) | `admin@mp.ai` | `Password123!` |
| App (resto) | ver §3.5 | `Password123!` |
| n8n | `admin` | `admin_change_me` |
| Postgres | `mp_user` | la de `.env` (`mp_pass_change_me` por defecto) |

### 9.2 Mapa de ficheros relevante

```
docker-compose.yml          Orquestación de desarrollo
docker-compose.prod.yml     Producción (Caddy + backups, sin mocks)
.env.example                Plantilla de configuración
infra/postgres/init/        Esquema + datos iniciales (solo en volumen vacío)
infra/n8n/workflows/        WF-01 … WF-04 (JSON)
infra/caddy/Caddyfile       TLS y cabeceras de seguridad
apps/web/                   Aplicación, API y agentes
apps/ml-service/            FastAPI + RandomForest (entrena al primer uso)
scripts/                    backup, restore, reset-db, smoke-test, check-links, e2e-hitl
docs/                       Toda la documentación
```

### 9.3 Orden recomendado de lectura

1. Este manual (instalación).
2. `docs/MANUAL_USUARIO.md` (cómo se usa).
3. `docs/ARCHITECTURE.md` (cómo está construido).
4. `docs/N8N_WORKFLOWS.md` (automatizaciones).
5. `docs/SEGURIDAD.md` (qué falta antes de un uso real).
