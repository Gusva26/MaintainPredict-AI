#!/usr/bin/env bash
# Prueba de humo end-to-end de MaintainPredict AI.
#
# Requisitos: el stack levantado (docker compose up -d) y curl disponible.
#
# Uso:
#   ./scripts/smoke-test.sh
#   BASE_URL=http://localhost:3000 INTERNAL_TOKEN=... ./scripts/smoke-test.sh
#
# Variables:
#   BASE_URL        URL base del servicio web   (def: http://localhost:3000)
#   EMAIL/PASSWORD  credenciales demo           (def: admin@mp.ai / Password123!)
#   INTERNAL_TOKEN  token para n8n              (def: valor del .env)
#
# Nota: se envía la cookie de sesión mediante la cabecera "Cookie:" en lugar de
# un fichero jar de curl, porque curl descarta las cookies de hosts de una sola
# etiqueta (p. ej. "web") por considerarlos no válidos.
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-admin@mp.ai}"
PASSWORD="${PASSWORD:-Password123!}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-change_me_internal_token_32_chars_long}"

OUT="$(mktemp)"
HDRS="$(mktemp)"
FAILED=0
ACCESS=""

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILED=$((FAILED + 1)); }

# req <curl args...>            -> código HTTP (cuerpo en $OUT), sin sesión
req() { curl -s -o "$OUT" -w '%{http_code}' "$@"; }

# areq <curl args...>           -> código HTTP (cuerpo en $OUT), con sesión
areq() { curl -s -o "$OUT" -w '%{http_code}' -H "Cookie: mp_access=$ACCESS" "$@"; }

echo "==> 1. Health"
c="$(req "$BASE_URL/api/health")"
[ "$c" = "200" ] && pass "GET /api/health ($c)" || fail "GET /api/health ($c)"

echo "==> 2. Login ($EMAIL)"
c="$(curl -s -o "$OUT" -D "$HDRS" -w '%{http_code}' -X POST "$BASE_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
ACCESS="$(tr -d '\r' < "$HDRS" | sed -n 's/^[Ss]et-[Cc]ookie: mp_access=\([^;]*\).*/\1/p' | head -n 1)"
if [ "$c" = "200" ] && [ -n "$ACCESS" ]; then
  pass "POST /api/auth/login ($c, cookie obtenida)"
else
  fail "POST /api/auth/login ($c, cookie='${ACCESS:0:12}...')"
fi

echo "==> 3. Recurso protegido con sesión"
c="$(areq "$BASE_URL/api/equipment?pageSize=1")"
[ "$c" = "200" ] && pass "GET /api/equipment ($c)" || fail "GET /api/equipment ($c)"

echo "==> 4. Recurso protegido sin sesión (debe ser 401)"
c="$(req "$BASE_URL/api/equipment?pageSize=1")"
[ "$c" = "401" ] && pass "GET /api/equipment sin sesión ($c)" || fail "GET /api/equipment sin sesión ($c)"

echo "==> 5. Reporte semanal (json)"
c="$(areq "$BASE_URL/api/reports/weekly")"
[ "$c" = "200" ] && pass "GET /api/reports/weekly ($c)" || fail "GET /api/reports/weekly ($c)"

echo "==> 6. Reporte semanal (pdf/xlsx/docx)"
for fmt in pdf xlsx docx; do
  c="$(areq "$BASE_URL/api/reports/weekly?format=$fmt")"
  if [ "$c" != "200" ]; then fail "GET /api/reports/weekly?format=$fmt ($c)"; continue; fi
  case "$fmt" in
    pdf)       magic="$(head -c 4 "$OUT" | tr -d '\0')"; [ "$magic" = "%PDF" ] && pass "pdf ($c, %PDF)" || fail "pdf ($c, magic '$magic')" ;;
    xlsx|docx) magic="$(head -c 2 "$OUT")";              [ "$magic" = "PK" ]   && pass "$fmt ($c, PK)" || fail "$fmt ($c, sin magic PK)" ;;
  esac
done

echo "==> 7. Observabilidad /summary"
c="$(areq "$BASE_URL/api/observability/summary")"
[ "$c" = "200" ] && pass "GET /api/observability/summary ($c)" || fail "GET /api/observability/summary ($c)"

echo "==> 8. Sync de métricas con token interno (WF-04)"
c="$(req -X POST "$BASE_URL/api/observability/metrics/sync" \
  -H 'content-type: application/json' \
  -H "x-internal-token: $INTERNAL_TOKEN" \
  -d '{"windowDays":7,"includeDirtyScan":true}')"
[ "$c" = "200" ] && pass "POST /api/observability/metrics/sync ($c)" || fail "POST /api/observability/metrics/sync ($c)"

echo "==> 9. Token interno erróneo (debe ser 401/403)"
c="$(req -X POST "$BASE_URL/api/observability/metrics/sync" \
  -H 'content-type: application/json' \
  -H 'x-internal-token: token_invalido' \
  -d '{}')"
{ [ "$c" = "401" ] || [ "$c" = "403" ]; } && pass "token erróneo rechazado ($c)" || fail "token erróneo no rechazado ($c)"

echo "==> 10. RBAC de página /dashboard"
c="$(req "$BASE_URL/dashboard")"
[ "$c" = "307" ] && pass "GET /dashboard sin sesión redirige ($c)" || fail "GET /dashboard sin sesión ($c)"
c="$(areq "$BASE_URL/dashboard")"
[ "$c" = "200" ] && pass "GET /dashboard con sesión admin ($c)" || fail "GET /dashboard con sesión admin ($c)"

echo "==> 11. Páginas /login y /observability"
c="$(req "$BASE_URL/login")"
[ "$c" = "200" ] && pass "GET /login ($c)" || fail "GET /login ($c)"
c="$(areq "$BASE_URL/observability")"
[ "$c" = "200" ] && pass "GET /observability (admin) ($c)" || fail "GET /observability (admin) ($c)"

echo "==> 12. Contrato de /api/orders (items planos)"
# La UI espera orderId/status/priority en la RAÍZ del item. Si el endpoint los
# devolviera anidados (order: {…}), la tabla mostraría "undefined" y React
# avisaría de keys duplicadas/faltantes.
c="$(areq "$BASE_URL/api/orders?pageSize=1")"
if [ "$c" != "200" ]; then
  fail "GET /api/orders ($c)"
elif grep -q '"orderId"' "$OUT" && ! grep -q '"order":{' "$OUT"; then
  pass "GET /api/orders items planos ($c)"
else
  fail "GET /api/orders devuelve items anidados (order: {…}); falta orderId en la raíz"
fi

echo "==> 13. Integraciones (ERP/SCADA/SMS/Email)"
c="$(areq "$BASE_URL/api/integrations/health")"
if [ "$c" != "200" ]; then
  fail "GET /api/integrations/health ($c)"
elif grep -q '"adapters"' "$OUT" && grep -q '"mode"' "$OUT"; then
  # El endpoint nunca falla la petición; el estado lo dice el campo ok de cada adaptador.
  ok_count="$(grep -o '"ok":true' "$OUT" | wc -l | tr -d ' ')"
  pass "GET /api/integrations/health ($c, adaptadores sanos: $ok_count/4)"
else
  fail "GET /api/integrations/health sin el shape esperado"
fi

echo "==> 14. Endpoints de la fase D (seguridad y detalles)"

# 14.1 Política de contraseña: una contraseña débil debe rechazarse (no cambia nada).
c="$(areq -X POST "$BASE_URL/api/auth/change-password" \
  -H 'content-type: application/json' \
  -d '{"current_password":"Password123!","new_password":"corta"}')"
[ "$c" = "422" ] && pass "change-password rechaza contraseña débil ($c)" || fail "change-password aceptó contraseña débil ($c)"

# 14.2 Contraseña actual incorrecta -> 401 (tampoco cambia nada).
c="$(areq -X POST "$BASE_URL/api/auth/change-password" \
  -H 'content-type: application/json' \
  -d '{"current_password":"no-es-la-buena","new_password":"OtraClave123!"}')"
[ "$c" = "401" ] && pass "change-password rechaza la contraseña actual incorrecta ($c)" || fail "change-password no validó la contraseña actual ($c)"

# 14.3 /api/health incluye la explicación estándar.
c="$(req "$BASE_URL/api/health")"
if [ "$c" = "200" ] && grep -q '"explanation"' "$OUT"; then
  pass "GET /api/health con explanation ($c)"
else
  fail "GET /api/health sin explanation ($c)"
fi

# 14.4 Listado de usuarios: 200 y sin filtrar el hash de la contraseña.
c="$(areq "$BASE_URL/api/users?pageSize=5")"
if [ "$c" = "200" ] && grep -q '"email"' "$OUT" && ! grep -q 'passwordHash' "$OUT"; then
  pass "GET /api/users sin exponer passwordHash ($c)"
else
  fail "GET /api/users ($c) — o filtra el hash, o falta el shape esperado"
fi

# 14.5 Sensores y técnicos.
c="$(areq "$BASE_URL/api/sensors?pageSize=3")"
[ "$c" = "200" ] && pass "GET /api/sensors ($c)" || fail "GET /api/sensors ($c)"

c="$(areq "$BASE_URL/api/technicians")"
[ "$c" = "200" ] && pass "GET /api/technicians ($c)" || fail "GET /api/technicians ($c)"

# 14.6 KPIs del dashboard.
c="$(areq "$BASE_URL/api/dashboard/kpis")"
if [ "$c" = "200" ] && grep -q '"businessKpis"' "$OUT" && grep -q '"targets"' "$OUT"; then
  pass "GET /api/dashboard/kpis ($c)"
else
  fail "GET /api/dashboard/kpis ($c)"
fi

# 14.7 Detalle de predicción y de orden (tomando un id real del listado).
c="$(areq "$BASE_URL/api/predictions?pageSize=1")"
pred_id="$(grep -o '"predictionId":[0-9]*' "$OUT" | head -n 1 | cut -d: -f2)"
if [ -n "$pred_id" ]; then
  c="$(areq "$BASE_URL/api/predictions/$pred_id")"
  if [ "$c" = "200" ] && grep -q '"prediction"' "$OUT" && grep -q '"equipment"' "$OUT"; then
    pass "GET /api/predictions/:id ($c, id=$pred_id)"
  else
    fail "GET /api/predictions/$pred_id ($c)"
  fi
else
  warn="sin predicciones sembradas; se omite el detalle de predicción"
  echo "  [SKIP] $warn"
fi

c="$(areq "$BASE_URL/api/orders?pageSize=1")"
order_id="$(grep -o '"orderId":[0-9]*' "$OUT" | head -n 1 | cut -d: -f2)"
if [ -n "$order_id" ]; then
  c="$(areq "$BASE_URL/api/orders/$order_id")"
  if [ "$c" = "200" ] && grep -q '"order"' "$OUT" && grep -q '"equipment"' "$OUT"; then
    pass "GET /api/orders/:id ($c, id=$order_id)"
  else
    fail "GET /api/orders/$order_id ($c)"
  fi
else
  echo "  [SKIP] sin órdenes sembradas; se omite el detalle de orden"
fi

# 14.8 Ruta anidada de sensores: debe RESOLVER y validar el cuerpo.
# Se envía un body inválido a propósito (type de 1 carácter) para provocar 422:
# así se comprueba que la ruta existe y llega al handler, sin crear ningún sensor.
c="$(areq "$BASE_URL/api/equipment?pageSize=1")"
sm_eq="$(grep -o '"equipmentId":[0-9]*' "$OUT" | head -n1 | cut -d: -f2)"
if [ -n "$sm_eq" ]; then
  c="$(areq -X POST "$BASE_URL/api/equipment/$sm_eq/sensors" -H 'content-type: application/json' -d '{"type":"x"}')"
  [ "$c" = "422" ] && pass "POST /api/equipment/:id/sensors resuelve y valida ($c)" || fail "POST /api/equipment/$sm_eq/sensors ($c)"
else
  echo "  [SKIP] sin equipos sembrados; se omite la ruta anidada de sensores"
fi

rm -f "$OUT" "$HDRS"
echo
if [ "$FAILED" -eq 0 ]; then
  echo "Prueba de humo OK: todas las comprobaciones han pasado."
  exit 0
else
  echo "Prueba de humo FALLIDA: $FAILED comprobación(es)."
  exit 1
fi
