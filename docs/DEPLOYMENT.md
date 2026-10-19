# Guía de despliegue — MaintainPredict AI

## 1. Requisitos

| Componente | Versión |
|---|---|
| Ubuntu Server | 22.04 LTS o superior |
| Docker | ≥ 24 |
| Docker Compose | ≥ 2.20 |
| RAM | ≥ 8 GB (16 GB recomendado) |
| Disco | ≥ 40 GB SSD |
| Dominio | FQDN con DNS A al servidor |
| Puertos | 80, 443 (TLS terminado en Caddy) |

## 2. Preparación del servidor

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
sudo apt install -y docker-compose-plugin git
```

## 3. Clonado y secretos

```bash
git clone https://github.com/<org>/maintainpredict-ai.git
cd maintainpredict-ai
cp .env.example .env
# Editar .env con secretos reales:
#   POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET,
#   OPENAI_API_KEY, N8N_ENCRYPTION_KEY, INTERNAL_TOKEN,
#   SENSOR_API_KEY, ML_SERVICE_API_KEY
#   PUBLIC_APP_URL=https://<APP_DOMAIN>   # enlaces de los emails de n8n (HITL, reportes)
#   APP_BASE_URL=http://web:3000          # URL interna web↔n8n (no cambiar)
openssl rand -base64 48   # Para generar JWT_SECRET y similares
chmod 600 .env
```

## 4. Levantar el stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose ps
```

Servicios esperados: `postgres`, `web`, `ml-service`, `n8n`, `caddy`.

## 5. Inicializar base de datos

```bash
# Los scripts en infra/postgres/init se ejecutan automáticamente
docker exec -it mp_postgres psql -U mp_user -d maintainpredict -c "\dt"

# Usuarios demo
docker exec -it mp_web pnpm db:seed:users

# Vectorizar KB (una vez, tarda ~1 min)
docker exec -it mp_web pnpm db:seed:kb
```

### 5.1 Aplicar objetos nuevos sobre una base que ya existe (Fase A.6)

Los scripts de `infra/postgres/init/` **solo** se ejecutan solos la primera vez, cuando el
volumen `pg_data` está vacío. Para añadir objetos a una base que ya tiene datos no se recrea
nada: los scripts son idempotentes (`CREATE ... IF NOT EXISTS` / `CREATE OR REPLACE`) y se
aplican en orden con `psql`.

```bash
# 1. Extensiones. `pg_stat_statements` exige estar precargada: los compose ya pasan
#    `shared_preload_libraries=pg_stat_statements`, pero si el contenedor arrancó antes de
#    ese cambio, hay que recrearlo (los datos del volumen NO se pierden).
docker compose -f docker-compose.prod.yml up -d --force-recreate postgres

# 2. Objetos de la Fase A (idempotente, en este orden)
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U mp_user -d maintainpredict -v ON_ERROR_STOP=1 \
    -f /docker-entrypoint-initdb.d/00_extensions.sql \
    -f /docker-entrypoint-initdb.d/01_schema.sql \
    -f /docker-entrypoint-initdb.d/03_views.sql \
    -f /docker-entrypoint-initdb.d/04_functions.sql \
    -f /docker-entrypoint-initdb.d/05_procedures.sql

# 3. Comprobar que están
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U mp_user -d maintainpredict -c "\dv" -c "\dm" \
    -c "SELECT count(*) FROM mv_daily_kpis;"
```

> **`infra/postgres/migrations/partition_readings.sql` no se aplica** (decisión D4): el
> particionado de `readings` queda escrito para cuando la tabla pase de ~10 M de filas. El
> script lleva su propio seguro y explica el procedimiento en su cabecera.

Mantenimiento periódico (por ejemplo desde un cron del host):

```bash
bash scripts/vacuum-db.sh                                      # VACUUM real (recupera espacio)
docker compose exec -T postgres psql -U mp_user -d maintainpredict -c "CALL sp_refresh_views()"
docker compose exec -T postgres psql -U mp_user -d maintainpredict -c "CALL sp_recompute_kpis(7)"
docker compose exec -T postgres psql -U mp_user -d maintainpredict -c "CALL sp_archive_completed_orders(365)"
docker compose exec -T postgres psql -U mp_user -d maintainpredict -c "CALL sp_purge_old_readings(90)"
```

### 5.2 Datos de ejemplo y re-siembra (Fase B)

Los datos de ejemplo **no** van en un `02_seed.sql` único. Son seis scripts idempotentes que se
aplican en orden (y que el contenedor ejecuta solo la primera vez, con el volumen vacío):

| Script | Contenido |
|---|---|
| `06_seed_core.sql` | 7 usuarios · 500 equipos · ~1.500 sensores |
| `07_seed_readings.sql` | ~600.000 lecturas de 30 días (variable `mp_step_minutes`) |
| `08_seed_predictions.sql` | ~800 predicciones y ~600 órdenes coherentes con la HITL |
| `09_seed_kb.sql` | 30 documentos de base de conocimiento (`embedding` NULL) |
| `10_seed_observability.sql` | 150 métricas de modelo · 155 KPIs de negocio |
| `11_seed_audit.sql` | ~5.000 entradas de bitácora |

Para aplicar solo los datos sobre una base existente:

```bash
docker compose exec -T postgres psql -U mp_user -d maintainpredict -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/06_seed_core.sql \
  -f /docker-entrypoint-initdb.d/07_seed_readings.sql \
  -f /docker-entrypoint-initdb.d/08_seed_predictions.sql
# 09 (KB) deja los `embedding` en NULL: se vectorizan con Gemini después
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:kb'
```

> **`users` no se siembra con SQL**: el hash bcrypt se genera en el momento con
> `pnpm db:seed:users` (7 usuarios demo). Ver §3.3 y el README.

Para **rehacer** la base con los datos de ejemplo (destructivo: hacer copia antes con
`scripts/backup-db.sh`) se usa `scripts/reset-db.sh`, que encadena `dropdb`/`createdb`, los
`init/*.sql` y los dos seeds de Node:

```bash
FORCE=1 bash scripts/reset-db.sh                        # volumen por defecto (30 días, 100 min)
SEED_DAYS=7 SEED_STEP_MINUTES=360 FORCE=1 bash scripts/reset-db.sh   # volumen reducido
```

Para traer datos **reales** en lugar de los de ejemplo está `scripts/import/`
(AI4I 2020, Microsoft Azure PdM, NASA C-MAPSS y OSHA); el catálogo completo de datasets, con
licencia, tamaño y prioridad, está en [`data/README.md`](../data/README.md).

## 6. Importar workflows n8n

```bash
# 1. Workflows (van montados en el contenedor en /workflows)
docker compose -f docker-compose.prod.yml exec -T n8n n8n import:workflow --separate --input=/workflows/

# 2. Credenciales: SMTP (versionada) + Postgres/OpenAI (generadas desde .env)
docker compose exec -T n8n sh -c 'cat > /tmp/smtp.json' < infra/n8n/credentials/smtp.json
docker compose exec -T n8n n8n import:credentials --input=/tmp/smtp.json
bash infra/n8n/import-credentials.sh

# 3. Activar (imprescindible reiniciar: sin reinicio los webhooks dan 404)
docker compose -f docker-compose.prod.yml exec -T n8n n8n update:workflow --all --active=true
docker compose -f docker-compose.prod.yml restart n8n
```

> Alternativa vía API: `N8N_URL=https://n8n.<dominio> N8N_API_KEY=<api_key> bash infra/n8n/import.sh` + activar en la UI.

> En producción, recuerda que los emails de n8n usan `PUBLIC_APP_URL` (`https://<APP_DOMAIN>`) para los enlaces
> de aprobación HITL; si no se define, heredan `APP_BASE_URL` (red interna) y los enlaces no abrirán en el navegador.

## 7. Verificación end-to-end

```bash
bash scripts/smoke-test.sh https://app.<dominio>
```

Debe verificar: login, listar equipos, predecir, auto-plan, reporte JSON.

## 8. Checklist de despliegue a producción

- [ ] `.env` con secretos reales (no defaults) y permisos `600`
- [ ] `JWT_SECRET` y `JWT_REFRESH_SECRET` ≥ 32 caracteres aleatorios
- [ ] `POSTGRES_PASSWORD` fuerte
- [ ] `OPENAI_API_KEY` válida (y `OPENAI_BASE_URL`/`OPENAI_CHAT_MODEL` si se usa un proveedor compatible, p. ej. Groq)
- [ ] `GEMINI_API_KEY` válida si se quiere RAG semántico (opcional: sin ella el RAG degrada a embedding determinista)
- [ ] `N8N_ENCRYPTION_KEY` configurada (no cambiar tras el primer arranque)
- [ ] `INTERNAL_TOKEN` y `SENSOR_API_KEY` rotados respecto a defaults
- [ ] DNS: `app.<dominio>` y `n8n.<dominio>` apuntan al servidor
- [ ] TLS Caddy emite certificados (verificar `docker logs mp_caddy`)
- [ ] Backups automáticos de PostgreSQL (cron + pg_dump a S3/almacenamiento externo)
- [ ] Backups de `n8n_data` (volumen)
- [ ] Healthchecks OK: `curl https://app.<dominio>/api/health`
- [ ] Usuarios demo eliminados o contraseña cambiada
- [ ] Workflows n8n activos (WF-01, WF-02, WF-03, WF-04)
- [ ] KB vectorizada (`SELECT COUNT(*) FROM kb_maintenance WHERE embedding IS NOT NULL;` > 0)
- [ ] Métricas iniciales: `POST /api/observability/metrics/sync`
- [ ] Correo de prueba recibido en MailHog/SMTP real
- [ ] Alertas: SMTP configurado, `SUPERVISOR_EMAIL` válido
- [ ] Logs centralizados (opcional: Loki, Datadog)
- [ ] CI verde en `main` y CD ejecutado
- [ ] Rollback documentado (ver §10)
- [ ] Documentación accesible al equipo (`docs/`)

## 9. Rotación de secretos

1. Actualizar `.env`.
2. `docker compose up -d` (recrea solo lo necesario).
3. Rotar `JWT_SECRET` invalida sesiones activas (usuarios deben re-loguear).
4. Rotar `N8N_ENCRYPTION_KEY` invalida credenciales n8n (recrear en UI).

## 10. Rollback y recuperación de datos

```bash
# Volver a la imagen/tag anterior
git checkout <tag_o_commit_anterior>
docker compose -f docker-compose.prod.yml up -d --build

# Restaurar BD desde backup
docker exec -i mp_postgres psql -U mp_user -d maintainpredict < backup.sql
```

### Copias de seguridad

Scripts versionados (sirven igual en desarrollo y en producción, y cubren también la base de n8n):

```bash
./scripts/backup-db.sh                                            # maintainpredict + n8n → infra/postgres/backups/
./scripts/restore-db.sh infra/postgres/backups/maintainpredict_20261018_120000.sql.gz
FORCE=1 ./scripts/reset-db.sh                                     # recrea la BD desde infra/postgres/init/ (DESTRUCTIVO)
```

En producción hay además el servicio `pg-backup` (`docker-compose.prod.yml`), que programa copias
diarias/semanales/mensuales en `./infra/postgres/backups`.

> [!WARNING]
> El servicio `pg-backup` **no cifra** los volcados (brecha pendiente; ver la fase J de
> `docs/PLAN_CIERRE_BRECHAS.md`). Si el volumen no está en disco cifrado, cifra las copias o muévelas a un
> destino cifrado.

## 11. Escalado

- **Vertical**: aumentar RAM/CPU de la VM. Todo el stack cabe en 1 VM hasta ~500 equipos.
- **Horizontal API**: añadir réplicas de `web` detrás de Caddy (`scale: web=3`).
- **Postgres**: migrar a instancia gestionada (RDS/Cloud SQL) y actualizar `DATABASE_URL`.
- **n8n**: modo queue con Redis (documentado en n8n.io) para alta concurrencia.
