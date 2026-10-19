#!/usr/bin/env bash
# Recrea la base de datos de la aplicación desde cero.
#
# Borra la base `POSTGRES_DB`, la vuelve a crear y aplica TODOS los scripts de
# infra/postgres/init/*.sql en orden alfabético (igual que hace la imagen de
# Postgres en el primer arranque). Después siembra usuarios y vectoriza la KB.
#
# AVISO: DESTRUCTIVO. Los datos actuales se pierden. Haz antes:
#   ./scripts/backup-db.sh
#
# Uso:
#   ./scripts/reset-db.sh              # recrea + seed usuarios + seed KB
#   SKIP_KB=1 ./scripts/reset-db.sh    # omite el seed de la KB (no usa Gemini)
#
# Volumen del seed de lecturas (07_seed_readings.sql). Por defecto ~600 k lecturas:
#   SEED_DAYS=7 SEED_STEP_MINUTES=720 ./scripts/reset-db.sh   # seed rápido (~2 k lecturas)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

get_env() { [ -f .env ] && sed -n "s/^$1=//p" .env | head -n1 | tr -d '\r'; }
POSTGRES_USER="$(get_env POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-mp_user}"
POSTGRES_DB="$(get_env POSTGRES_DB)";     POSTGRES_DB="${POSTGRES_DB:-maintainpredict}"

# Variables que se pasan a psql (las lee 07_seed_readings.sql para el volumen del seed).
EXTRA_VARS=""
[ -n "${SEED_DAYS:-}" ]          && EXTRA_VARS="$EXTRA_VARS -v mp_days=${SEED_DAYS}"
[ -n "${SEED_STEP_MINUTES:-}" ]  && EXTRA_VARS="$EXTRA_VARS -v mp_step_minutes=${SEED_STEP_MINUTES}"

echo "==> ATENCIÓN: se va a RECREAR la base '$POSTGRES_DB'."
if [ "${FORCE:-0}" != "1" ]; then
  read -r -p "¿Continuar? (escribe 'si' para confirmar) " ans
  [ "$ans" = "si" ] || { echo "Cancelado."; exit 1; }
fi

echo "==> Cerrando conexiones y borrando la base"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);" \
  -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"

for f in infra/postgres/init/*.sql; do
  echo "==> Aplicando $(basename "$f")"
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 $EXTRA_VARS -q -f - < "$f"
done

echo "==> Sembrando usuarios"
docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:users'

if [ "${SKIP_KB:-0}" != "1" ]; then
  echo "==> Vectorizando la base de conocimiento"
  docker compose exec -T web sh -lc 'cd /app/apps/web && pnpm db:seed:kb'
fi

echo
echo "==> Base recreada. Resumen:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT 'users' AS tabla, count(*) FROM users
  UNION ALL SELECT 'equipment', count(*) FROM equipment
  UNION ALL SELECT 'sensors', count(*) FROM sensors
  UNION ALL SELECT 'readings', count(*) FROM readings
  UNION ALL SELECT 'predictions', count(*) FROM predictions
  UNION ALL SELECT 'maintenance_orders', count(*) FROM maintenance_orders
  UNION ALL SELECT 'kb_maintenance', count(*) FROM kb_maintenance
  UNION ALL SELECT 'audit_log', count(*) FROM audit_log
  UNION ALL SELECT 'model_metrics', count(*) FROM model_metrics
  UNION ALL SELECT 'business_kpis', count(*) FROM business_kpis;"
