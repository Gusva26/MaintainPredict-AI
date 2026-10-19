#!/usr/bin/env bash
# Restaura un volcado creado por scripts/backup-db.sh.
#
# Uso:
#   ./scripts/restore-db.sh infra/postgres/backups/maintainpredict_20261018_120000.sql.gz
#
# AVISO: sobrescribe el contenido actual de la base indicada.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: $0 <ruta/al/volcado.sql.gz>" >&2
  echo "Disponibles:" >&2
  ls -1 infra/postgres/backups/*.sql.gz 2>/dev/null || echo "  (ninguno)" >&2
  exit 1
fi

get_env() { [ -f .env ] && sed -n "s/^$1=//p" .env | head -n1 | tr -d '\r'; }
POSTGRES_USER="$(get_env POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-mp_user}"
POSTGRES_DB="$(get_env POSTGRES_DB)";     POSTGRES_DB="${POSTGRES_DB:-maintainpredict}"

# El nombre del fichero indica la base de destino (maintainpredict_*.sql.gz | n8n_*.sql.gz).
BASE="$(basename "$FILE")"
case "$BASE" in
  "${POSTGRES_DB}"_*) TARGET_DB="$POSTGRES_DB" ;;
  n8n_*)              TARGET_DB="n8n" ;;
  *)                  echo "(aviso) no reconozco la base por el nombre; uso '$POSTGRES_DB'" >&2
                      TARGET_DB="$POSTGRES_DB" ;;
esac

echo "==> Restaurando $FILE en la base '$TARGET_DB'"
gunzip -c "$FILE" | docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1

echo "==> Restauración completada. Reinicia los servicios para descartar conexiones cacheadas:"
echo "    docker compose restart web n8n"
