#!/usr/bin/env bash
# Pruebas de aceptación de las RUTAS DE ESCRITURA.
#
# Complementa a `scripts/smoke-test.sh` (que es de solo lectura para poder
# ejecutarse contra cualquier entorno sin ensuciarlo). Aquí sí se crean datos,
# pero SIEMPRE se limpian al final: el script verifica que no queda ningún resto.
#
# Cobertura: alta de sensores (suelta y anidada), validación de umbrales,
# edición de equipos, alta/edición de usuarios, política de contraseñas, cambio
# de contraseña end-to-end, desactivación de usuarios, RBAC y protección del admin.
#
# Requisitos: stack levantado y `docker` disponible.
#
# Uso:
#   ./scripts/acceptance-writes.sh
#   BASE_URL=http://localhost:3000 ./scripts/acceptance-writes.sh
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PGUSER="${POSTGRES_USER:-mp_user}"
PGDB="${POSTGRES_DB:-maintainpredict}"
OUT="$(mktemp)"; HDRS="$(mktemp)"
PASS=0; FAIL=0
ok() { echo "  [PASS] $1"; PASS=$((PASS+1)); }
ko() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }
psql_() { docker compose exec -T postgres psql -U "$PGUSER" -d "$PGDB" -q -c "$1"; }

# ── sesión admin ────────────────────────────────────────────────
curl -s -o "$OUT" -D "$HDRS" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@mp.ai","password":"Password123!"}' >/dev/null
ACCESS="$(tr -d '\r' < "$HDRS" | sed -n 's/^[Ss]et-[Cc]ookie: mp_access=\([^;]*\).*/\1/p' | head -n1)"
[ -n "$ACCESS" ] && ok "login admin" || ko "login admin"

A() { curl -s -o "$OUT" -w '%{http_code}' -H "Cookie: mp_access=$ACCESS" "$@"; }

# ── equipo de referencia ────────────────────────────────────────
A "$BASE/api/equipment?pageSize=1" >/dev/null
EQ="$(grep -o '"equipmentId":[0-9]*' "$OUT" | head -n1 | cut -d: -f2)"
[ -n "$EQ" ] && ok "equipo de referencia (id=$EQ)" || ko "sin equipos para probar"

# ── 1. POST /api/sensors ────────────────────────────────────────
c="$(A -X POST "$BASE/api/sensors" -H 'content-type: application/json' \
  -d "{\"equipment_id\":$EQ,\"type\":\"qa_test\",\"unit\":\"mm/s\",\"min_threshold\":1,\"max_threshold\":9}")"
[ "$c" = "201" ] && ok "POST /api/sensors (201)" || ko "POST /api/sensors ($c)"

# ── 2. Umbrales incoherentes → 422 ──────────────────────────────
c="$(A -X POST "$BASE/api/sensors" -H 'content-type: application/json' \
  -d "{\"equipment_id\":$EQ,\"type\":\"qa_bad\",\"min_threshold\":9,\"max_threshold\":1}")"
[ "$c" = "422" ] && ok "umbrales incoherentes rechazados (422)" || ko "umbrales incoherentes ($c)"

# ── 3. POST /api/equipment/:id/sensors (ruta anidada) ───────────
c="$(A -X POST "$BASE/api/equipment/$EQ/sensors" -H 'content-type: application/json' \
  -d '{"type":"qa_nested","unit":"C"}')"
[ "$c" = "201" ] && ok "POST /api/equipment/:id/sensors (201)" || ko "POST /api/equipment/:id/sensors ($c)"

# ── 3b. equipo inexistente → 404 ────────────────────────────────
c="$(A -X POST "$BASE/api/equipment/999999/sensors" -H 'content-type: application/json' -d '{"type":"qa_x"}')"
[ "$c" = "404" ] && ok "sensor en equipo inexistente rechazado (404)" || ko "equipo inexistente ($c)"

# ── 4. PUT /api/equipment/:id (mismos valores: idempotente) ─────
A "$BASE/api/equipment/$EQ" >/dev/null
NAME="$(grep -o '"name":"[^"]*"' "$OUT" | head -n1 | sed 's/"name":"//; s/"$//')"
CRIT="$(grep -o '"criticality":"[^"]*"' "$OUT" | head -n1 | sed 's/"criticality":"//; s/"$//')"
c="$(A -X PUT "$BASE/api/equipment/$EQ" -H 'content-type: application/json' \
  -d "{\"name\":\"$NAME\",\"criticality\":\"$CRIT\"}")"
[ "$c" = "200" ] && ok "PUT /api/equipment/:id ($c, sin cambiar valores)" || ko "PUT /api/equipment/:id ($c)"

# ── 5. PUT sin campos → 422 ─────────────────────────────────────
c="$(A -X PUT "$BASE/api/equipment/$EQ" -H 'content-type: application/json' -d '{}')"
[ "$c" = "422" ] && ok "PUT sin campos rechazado (422)" || ko "PUT sin campos ($c)"

# ── 6. Alta de usuario ──────────────────────────────────────────
QA_EMAIL="qa_fase_d_${RANDOM}@mp.ai"
QA_PASS='QaFaseD123!'
c="$(A -X POST "$BASE/api/users" -H 'content-type: application/json' \
  -d "{\"email\":\"$QA_EMAIL\",\"full_name\":\"QA Fase D\",\"role\":\"technician\",\"password\":\"$QA_PASS\"}")"
NEW_UID="$(grep -o '"userId":[0-9]*' "$OUT" | head -n1 | cut -d: -f2)"
[ "$c" = "201" ] && ok "POST /api/users (201, user=$NEW_UID)" || ko "POST /api/users ($c)"

# 6b. email duplicado → 409
c="$(A -X POST "$BASE/api/users" -H 'content-type: application/json' \
  -d "{\"email\":\"$QA_EMAIL\",\"full_name\":\"Duplicado\",\"role\":\"technician\",\"password\":\"$QA_PASS\"}")"
[ "$c" = "409" ] && ok "email duplicado rechazado (409)" || ko "email duplicado ($c)"

# 6c. contraseña débil en el alta → 422
c="$(A -X POST "$BASE/api/users" -H 'content-type: application/json' \
  -d '{"email":"qa_debil@mp.ai","full_name":"QA Debil","role":"technician","password":"1234"}')"
[ "$c" = "422" ] && ok "alta con contraseña débil rechazada (422)" || ko "alta con contraseña débil ($c)"

# 6d. el hash nunca viaja al cliente
A "$BASE/api/users?pageSize=100" >/dev/null
if grep -q 'passwordHash' "$OUT"; then ko "GET /api/users expone passwordHash"; else ok "GET /api/users no expone passwordHash"; fi

# 6e. login del usuario nuevo (hash + política, extremo a extremo)
QA_HDRS="$(mktemp)"
c="$(curl -s -o "$OUT" -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"email\":\"$QA_EMAIL\",\"password\":\"$QA_PASS\"}")"
[ "$c" = "200" ] && ok "login del usuario creado ($c)" || ko "login del usuario creado ($c)"

curl -s -o /dev/null -D "$QA_HDRS" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"email\":\"$QA_EMAIL\",\"password\":\"$QA_PASS\"}"
QA_ACCESS="$(tr -d '\r' < "$QA_HDRS" | sed -n 's/^[Ss]et-[Cc]ookie: mp_access=\([^;]*\).*/\1/p' | head -n1)"

# 6f. change-password correcto
c="$(curl -s -o "$OUT" -w '%{http_code}' -H "Cookie: mp_access=$QA_ACCESS" -X POST "$BASE/api/auth/change-password" \
  -H 'content-type: application/json' -d "{\"current_password\":\"$QA_PASS\",\"new_password\":\"NuevaQa123!\"}")"
[ "$c" = "200" ] && ok "change-password correcto (200)" || ko "change-password correcto ($c)"

# 6g. la contraseña antigua deja de funcionar
c="$(curl -s -o "$OUT" -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"email\":\"$QA_EMAIL\",\"password\":\"$QA_PASS\"}")"
[ "$c" = "401" ] && ok "la contraseña antigua deja de funcionar (401)" || ko "la contraseña antigua sigue valiendo ($c)"

# 6h. un técnico NO puede listar usuarios
c="$(curl -s -o "$OUT" -w '%{http_code}' -H "Cookie: mp_access=$QA_ACCESS" "$BASE/api/users")"
{ [ "$c" = "403" ] || [ "$c" = "401" ]; } && ok "técnico no accede a /api/users ($c)" || ko "técnico accedió a /api/users ($c)"

# 6i. PATCH: desactivar el usuario
c="$(A -X PATCH "$BASE/api/users/$NEW_UID" -H 'content-type: application/json' -d '{"is_active":false}')"
[ "$c" = "200" ] && ok "PATCH /api/users/:id desactiva ($c)" || ko "PATCH /api/users/:id ($c)"

# 6j. usuario desactivado → login rechazado
c="$(curl -s -o "$OUT" -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"email\":\"$QA_EMAIL\",\"password\":\"NuevaQa123!\"}")"
[ "$c" = "401" ] && ok "usuario desactivado no puede entrar (401)" || ko "usuario desactivado entró ($c)"

# 6k. el admin no puede auto-degradarse ni auto-desactivarse
c="$(A -X PATCH "$BASE/api/users/1" -H 'content-type: application/json' -d '{"role":"technician"}')"
[ "$c" = "422" ] && ok "admin no puede auto-degradarse (422)" || ko "admin auto-degradado ($c)"

echo
echo "==> Limpieza de los datos de prueba creados por este script"
# Orden obligado por las claves ajenas: auditoría del usuario → usuario.
psql_ "DELETE FROM audit_log WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE 'qa_fase_d_%' OR email = 'qa_debil@mp.ai');"
psql_ "DELETE FROM sensors WHERE type LIKE 'qa_%';"
psql_ "DELETE FROM users WHERE email LIKE 'qa_fase_d_%' OR email = 'qa_debil@mp.ai';"
leak="$(docker compose exec -T postgres psql -U "$PGUSER" -d "$PGDB" -tAc "SELECT (SELECT count(*) FROM users WHERE email LIKE 'qa_%') || '/' || (SELECT count(*) FROM sensors WHERE type LIKE 'qa_%');")"
echo "  restos (usuarios/sensores qa): $leak"
[ "$leak" = "0/0" ] && ok "datos de prueba eliminados" || ko "quedan restos: $leak"

echo
echo "RESUMEN pass=$PASS fail=$FAIL"
rm -f "$OUT" "$HDRS" "$QA_HDRS"
[ "$FAIL" -eq 0 ] && echo "Aceptación de escrituras OK: todas las comprobaciones han pasado." || echo "Aceptación de escrituras con FALLOS."
[ "$FAIL" -eq 0 ]
