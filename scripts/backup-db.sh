#!/usr/bin/env bash
# Copia de seguridad de las bases de datos de MaintainPredict AI.
#
# Genera un par de volcados comprimidos (base de la aplicación + base de n8n)
# en infra/postgres/backups/ con marca de tiempo.
#
# Requisitos: el contenedor `postgres` levantado (docker compose up -d postgres).
#
# Uso:
#   ./scripts/backup-db.sh
#   OUT_DIR=/otra/ruta ./scripts/backup-db.sh
#
# Variables:
#   OUT_DIR   directorio de destino (def: infra/postgres/backups)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Lee una variable de .env sin depender de `source` (más robusto con valores raros).
get_env() { [ -f .env ] && sed -n "s/^$1=//p" .env | head -n1 | tr -d '\r'; }

POSTGRES_USER="$(get_env POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-mp_user}"
POSTGRES_DB="$(get_env POSTGRES_DB)";     POSTGRES_DB="${POSTGRES_DB:-maintainpredict}"
N8N_DB="${N8N_DB:-n8n}"

OUT_DIR="${OUT_DIR:-infra/postgres/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT_DIR"

dump() {
  local db="$1" out="$2"
  echo "==> Volcando '$db' -> $out"
  docker compose exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$db" --no-owner --clean --if-exists \
    | gzip > "$out"
}

APP_FILE="$OUT_DIR/${POSTGRES_DB}_${STAMP}.sql.gz"
dump "$POSTGRES_DB" "$APP_FILE"

N8N_FILE="$OUT_DIR/${N8N_DB}_${STAMP}.sql.gz"
if docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -tAc \
     "SELECT 1 FROM pg_database WHERE datname='$N8N_DB'" | grep -q 1; then
  dump "$N8N_DB" "$N8N_FILE"
else
  echo "==> (aviso) la base '$N8N_DB' no existe todavía; se omite"
  N8N_FILE=""
fi

echo
echo "Backup completado:"
ls -lh "$APP_FILE"
[ -n "$N8N_FILE" ] && ls -lh "$N8N_FILE"
echo
echo "Para restaurar: ./scripts/restore-db.sh $APP_FILE"
