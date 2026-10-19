#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Importa en n8n las credenciales que contienen secretos (postgres y OpenAI).
#
#   bash infra/n8n/import-credentials.sh
#
# Se generan "al vuelo" desde el .env del proyecto y se importan con la CLI de
# n8n, que cifra el `data` con la N8N_ENCRYPTION_KEY del contenedor. Los ficheros
# con secretos NO se escriben en el repo (a diferencia de smtp.json, que no tiene).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Git Bash (MSYS) reescribe rutas tipo /tmp/... al pasarlas a docker.exe;
# desactivamos esa conversión para que los --input=... lleguen tal cual al contenedor.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/../.."   # raíz del proyecto

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${POSTGRES_USER:?falta POSTGRES_USER en .env}"
: "${POSTGRES_PASSWORD:?falta POSTGRES_PASSWORD en .env}"
: "${POSTGRES_DB:?falta POSTGRES_DB en .env}"
: "${OPENAI_API_KEY:?falta OPENAI_API_KEY en .env}"

PG_FILE="$(mktemp)"
OA_FILE="$(mktemp)"
trap 'rm -f "$PG_FILE" "$OA_FILE"' EXIT

cat > "$PG_FILE" <<EOF
[{
  "id": "mp_postgres",
  "name": "MaintainPredict Postgres",
  "type": "postgres",
  "data": {
    "host": "postgres", "port": 5432, "database": "${POSTGRES_DB}",
    "user": "${POSTGRES_USER}", "password": "${POSTGRES_PASSWORD}",
    "ssl": "disable", "allowUnauthorizedCerts": false
  }
}]
EOF

cat > "$OA_FILE" <<EOF
[{
  "id": "mp_openai",
  "name": "MaintainPredict OpenAI",
  "type": "openAiApi",
  "data": { "apiKey": "${OPENAI_API_KEY}", "organizationId": "" }
}]
EOF

echo "→ Importando credencial Postgres (mp_postgres)…"
docker compose exec -T n8n sh -c 'cat > /tmp/mp_postgres.json' < "$PG_FILE"
docker compose exec -T n8n n8n import:credentials --input=/tmp/mp_postgres.json

echo "→ Importando credencial OpenAI (mp_openai)…"
docker compose exec -T n8n sh -c 'cat > /tmp/mp_openai.json' < "$OA_FILE"
docker compose exec -T n8n n8n import:credentials --input=/tmp/mp_openai.json

echo "✓ Credenciales importadas (mp_smtp se importa aparte, ver README)."
