#!/usr/bin/env bash
set -euo pipefail

N8N_URL="${N8N_URL:-http://localhost:5678}"
N8N_API_KEY="${N8N_API_KEY:?N8N_API_KEY is required}"

WORKFLOWS=(
  "WF-01_sensor-intake.json"
  "WF-02_order-generation.json"
  "WF-03_weekly-report.json"
  "WF-04_metrics-sync.json"
)

echo "→ Verificando API key..."
if ! curl -fsS "$N8N_URL/api/v1/workflows" -H "X-N8N-API-KEY: $N8N_API_KEY" > /dev/null; then
  echo "❌ No se pudo conectar a n8n. Verifica N8N_URL y N8N_API_KEY."
  exit 1
fi

for wf in "${WORKFLOWS[@]}"; do
  echo "→ Validando JSON de $wf"
  jq -e . "infra/n8n/workflows/$wf" > /dev/null || { echo "❌ JSON inválido: $wf"; exit 1; }
  echo "→ Importando $wf"
  curl -fsS -X POST "$N8N_URL/api/v1/workflows" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "content-type: application/json" \
    --data-binary "@infra/n8n/workflows/$wf" | jq -r '.id // .message // "imported"'
done

echo "✓ 4 workflows importados. Actívalos en la UI de n8n: $N8N_URL"
