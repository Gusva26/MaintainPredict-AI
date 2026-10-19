#!/usr/bin/env bash
# Mantenimiento VACUUM de las tablas que más crecen (Fase A.4).
#
# Complementa a `sp_vacuum_hot_tables()`: aquel procedimiento solo puede ejecutar
# `ANALYZE` desde dentro de Postgres (el motor prohíbe VACUUM en funciones y
# procedimientos). El VACUUM de verdad —el que recupera espacio— es una sentencia de
# nivel superior y se lanza desde aquí, por psql y fuera de transacción.
#
# Requisitos: el contenedor `postgres` levantado.
#
# Uso:
#   bash scripts/vacuum-db.sh
#   TABLES="readings audit_log" bash scripts/vacuum-db.sh   # solo algunas tablas
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

get_env() { [ -f .env ] && sed -n "s/^$1=//p" .env | head -n1 | tr -d '\r'; }

POSTGRES_USER="$(get_env POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-mp_user}"
POSTGRES_DB="$(get_env POSTGRES_DB)";     POSTGRES_DB="${POSTGRES_DB:-maintainpredict}"

TABLES="${TABLES:-readings audit_log predictions maintenance_orders model_metrics business_kpis kb_maintenance}"

echo "==> VACUUM (ANALYZE) en: $TABLES"
for t in $TABLES; do
  echo "  - $t"
  # Una sentencia por invocación: psql -c con varias sentencias las agruparía en una
  # transacción y VACUUM dejaría de estar permitido.
  docker compose exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "VACUUM (ANALYZE) $t;"
done

echo
echo "VACUUM completado."
