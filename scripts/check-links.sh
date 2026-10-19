#!/usr/bin/env bash
# Comprueba que ningún enlace de la navegación apunta a una página que no existe.
#
# Los `href` se extraen de los propios componentes de navegación, así que si alguien
# añade una entrada a una página que no existe, esto falla sin tocar el script. Nació
# del hallazgo G.9: el menú apuntaba a /audit y a /technician/checklists, que no existían.
#
#   ./scripts/check-links.sh
#   BASE_URL=http://localhost:3000 ./scripts/check-links.sh
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
ok() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
ko() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

# ── Sesiones ──────────────────────────────────────────────────────────
login() { # $1 = email
  local hdrs
  hdrs="$(mktemp)"
  curl -s -o /dev/null -D "$hdrs" -X POST "$BASE/api/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Password123!\"}"
  tr -d '\r' < "$hdrs" | sed -n 's/^[Ss]et-[Cc]ookie: mp_access=\([^;]*\).*/\1/p' | head -n1
  rm -f "$hdrs"
}

code() { # $1 = cookie, $2 = ruta
  curl -s -o /dev/null -w '%{http_code}' -H "Cookie: mp_access=$1" "$BASE$2"
}

get() { # $1 = cookie, $2 = ruta
  curl -s -H "Cookie: mp_access=$1" "$BASE$2"
}

ADMIN="$(login admin@mp.ai)"
TEC="$(login tec1@mp.ai)"
[ -n "$ADMIN" ] && ok 'sesión de admin' || ko 'no se pudo iniciar sesión como admin'
[ -n "$TEC" ] && ok 'sesión de técnico' || ko 'no se pudo iniciar sesión como técnico'

# ── Enlaces declarados en la navegación ───────────────────────────────
echo
echo '==> Enlaces de la navegación (extraídos de los componentes)'
HREFS="$(
  grep -ohE "href: '[^']+'" \
    "$ROOT/apps/web/components/layout/Sidebar.tsx" \
    "$ROOT/apps/web/components/layout/MobileNav.tsx" \
  | sed -E "s/.*'([^']+)'.*/\1/" | sort -u
)"
[ -n "$HREFS" ] && ok 'se han encontrado enlaces en la navegación' || ko 'no se ha extraído ningún enlace'

for h in $HREFS; do
  c="$(code "$ADMIN" "$h")"
  # 307 es correcto (p. ej. «/» redirige a /dashboard); 404 y 5xx son enlaces rotos.
  if [ "$c" = '404' ] || [ "$c" -ge 500 ]; then
    ko "$h responde $c (enlace roto)"
  else
    ok "$h responde $c"
  fi
done

# ── Enlaces a fichas concretas (dinámicos, no aparecen como literal) ───
echo
echo '==> Enlaces a fichas concretas'
EQ_ID="$(get "$ADMIN" '/api/equipment?pageSize=1' | grep -o '"equipmentId":[0-9]*' | head -n1 | cut -d: -f2)"
OR_ID="$(get "$ADMIN" '/api/orders?pageSize=1' | grep -o '"orderId":[0-9]*' | head -n1 | cut -d: -f2)"
PRED_ID="$(get "$ADMIN" '/api/predictions?pageSize=1' | grep -o '"predictionId":[0-9]*' | head -n1 | cut -d: -f2)"

for par in "/equipment/$EQ_ID" "/orders/$OR_ID" "/predictions/$PRED_ID"; do
  [ -n "${par#*/}" ] || continue
  c="$(code "$ADMIN" "$par")"
  if [ "$c" = '200' ]; then ok "$par responde 200"; else ko "$par responde $c (se esperaba 200)"; fi
done

# ── Matriz de rutas de la especificación (§8) ─────────────────────────
# Criterio de aceptación del plan: cada ruta responde 200 con el rol adecuado y
# redirige (307) al área del técnico con el inadecuado. Cubre las 17 páginas.
echo
echo '==> Matriz de rutas por rol (200 = permitido, 307 = bloqueado)'
SUP="$(login supervisor@mp.ai)"
[ -n "$SUP" ] && ok 'sesión de supervisor' || ko 'no se pudo iniciar sesión como supervisor'

# ruta|admin|supervisor|technician
matrix() {
  local p="$1" ea="$2" es="$3" et="$4" ca cs ct
  ca="$(code "$ADMIN" "$p")"; cs="$(code "$SUP" "$p")"; ct="$(code "$TEC" "$p")"
  [ "$ca" = "$ea" ] && ok "admin    $p → $ca" || ko "admin    $p → $ca (se esperaba $ea)"
  [ "$cs" = "$es" ] && ok "superv.  $p → $cs" || ko "superv.  $p → $cs (se esperaba $es)"
  [ "$ct" = "$et" ] && ok "técnico  $p → $ct" || ko "técnico  $p → $ct (se esperaba $et)"
}

matrix /login                    200 200 200
matrix /dashboard                200 200 200
matrix /equipment                200 200 200
matrix "/equipment/$EQ_ID"       200 200 200
matrix /sensors                  200 200 200
matrix /predictions              200 200 200
matrix "/predictions/$PRED_ID"   200 200 200
matrix /orders                   200 200 200
matrix "/orders/$OR_ID"          200 200 200
matrix /profile                  200 200 200
matrix /technician               200 200 200
matrix /technician/checklists    200 200 200
matrix /reports                  200 200 307
matrix /observability            200 200 307
matrix /integrations             200 200 307
matrix /audit                    200 307 307
matrix /users                    200 307 307

# ── IDs de ficha inexistentes y no numéricos ──────────────────────────
# Los tres casos deben dar 404 REAL (no 200 con aviso en pantalla): la página
# comprueba el id y la existencia en el servidor antes de renderizar.
# Ver `lib/db/detail-guard.ts` (hallazgo G.1/G.7).
echo
echo '==> IDs inválidos o inexistentes en fichas dinámicas (se espera 404)'
for p in /equipment/abc /orders/abc /predictions/abc \
         /equipment/999999 /orders/999999 /predictions/999999 \
         /equipment/0 /orders/-3; do
  c="$(code "$ADMIN" "$p")"
  [ "$c" = '404' ] && ok "$p responde 404" || ko "$p responde $c (se esperaba 404)"
done

echo
echo "RESUMEN pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
