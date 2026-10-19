// Prueba de extremo a extremo del HITL (WF-02) con las dos decisiones.
//
//   node scripts/e2e-hitl.mjs approve
//   node scripts/e2e-hitl.mjs reject
//
// Requiere el entorno de desarrollo levantado (docker compose up) y Node en el host.
// Está en JavaScript —y no en bash como el resto de `scripts/`— porque necesita leer
// JSON de dos APIs (la de la app y la de MailHog) y descodificar *quoted-printable*,
// que en shell obligaría a malabares con `sed` imposibles de mantener.
//
// Dispara WF-02 de verdad, espera a que la orden nazca en pending_approval, lee el
// correo que recibiría el supervisor en MailHog y resuelve la decisión por la misma API
// que usa la interfaz, con el `resume` real de la espera. Después comprueba el rastro
// completo: estado de la orden, notas, auditoría, correo de cierre y ejecución de n8n.
// Valida además que el correo trae los dos botones y que ninguna expresión quedó sin
// evaluar.
//
// ⚠️ Crea órdenes reales (es la única forma de disparar el HITL) y no las borra: son
// datos de demo. Cada ejecución deja dos órdenes (una con HITL y, si el planner no
// considera crítica la primera predicción probada, otra auto-aprobada).
import { execSync } from 'node:child_process';

const DECISION = process.argv[2];
if (DECISION !== 'approve' && DECISION !== 'reject') {
  console.error('uso: node scripts/e2e-hitl.mjs approve|reject');
  process.exit(2);
}
const BASE = 'http://localhost:3000';
const WH = 'http://localhost:5678/webhook/generate-order';

let pass = 0;
let fail = 0;
const ok = (m) => { console.log(`  [PASS] ${m}`); pass++; };
const ko = (m) => { console.log(`  [FAIL] ${m}`); fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sql = (q, db = 'maintainpredict') =>
  execSync(`docker compose exec -T postgres psql -U mp_user -d ${db} -tAc "${q}"`, { encoding: 'utf8' }).trim();

/** quoted-printable → texto (MailHog guarda así el HTML: '=' viaja como '=3D'). */
const dequote = (s) =>
  Buffer.from(
    String(s).replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
    'latin1',
  ).toString('utf8');

/** Cabeceras MIME en encoded-word ('=?UTF-8?Q?...?='), que MailHog no descodifica. */
function deheader(s) {
  const re = /=\?utf-8\?q\?([^?]*)\?=/gi;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    const entre = s.slice(last, m.index);
    if (entre.trim()) out += entre;
    out += Buffer.from(
      m[1].replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
      'latin1',
    ).toString('utf8');
    last = re.lastIndex;
  }
  out += s.slice(last);
  return out.trim();
}

const correos = async () => {
  const { items } = await (await fetch('http://localhost:8025/api/v2/messages?limit=80')).json();
  return items.map((m) => ({
    to: (m.To ?? []).map((t) => `${t.Mailbox}@${t.Domain}`).join(','),
    subject: deheader(dequote(m.Content?.Headers?.Subject?.[0] ?? '')),
    body: dequote(m.Content?.Body ?? '').replace(/&amp;/g, '&'),
  }));
};

console.log(`E2E HITL · decisión = ${DECISION}`);

// ── 1. Sesión de supervisor ───────────────────────────────────────────
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'supervisor@mp.ai', password: 'Password123!' }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('mp_access='));
cookie ? ok('sesión de supervisor') : ko('sin sesión de supervisor');

const antes = Number(sql('SELECT COALESCE(MAX(order_id),0) FROM maintenance_orders')) || 0;
console.log(`  orden máxima antes: ${antes}`);

// ── 2. Disparar WF-02 hasta obtener una orden HITL ────────────────────
// El planner es un LLM: no es determinista, así que se prueban predicciones ya
// conocidas hasta que una pida aprobación humana (parada > 4 h).
let orden = null;
for (const p of [120, 131, 126, 147, 142, 173, 13]) {
  console.log(`  → WF-02 con predicción ${p}`);
  // El webhook no responde hasta resolver el Wait (30 min): se corta la espera del
  // cliente, la ejecución de n8n sigue en el servidor.
  fetch(WH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prediction_id: p }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});

  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    const fila = sql(`SELECT order_id || '|' || status FROM maintenance_orders WHERE order_id > ${antes} AND prediction_id = ${p} ORDER BY order_id DESC LIMIT 1`);
    if (!fila) continue;
    const [oid, status] = fila.split('|');
    if (status === 'pending_approval') { orden = Number(oid); break; }
    break; // nació sin HITL: esta predicción no sirve
  }
  if (orden) break;
}

if (!orden) {
  ko('no se consiguió una orden en pending_approval');
  console.log(`\nRESUMEN [${DECISION}] pass=${pass} fail=${fail}`);
  process.exit(1);
}
ok(`orden HITL creada por WF-02: #${orden}`);

// ── 3. El correo que ve el supervisor ─────────────────────────────────
let hitl = null;
for (let i = 0; i < 20 && !hitl; i++) {
  await sleep(3000);
  hitl = (await correos()).find((c) => c.body.includes(`/orders/${orden}?resume=`));
}
if (!hitl) {
  ko('no llegó el correo HITL');
  console.log(`\nRESUMEN [${DECISION}] pass=${pass} fail=${fail}`);
  process.exit(1);
}
ok(`correo HITL recibido en ${hitl.to} · "${hitl.subject.replace(/\s+/g, ' ').slice(0, 60)}"`);

const urls = [...hitl.body.matchAll(/href="(https?:\/\/[^"]*\/orders\/\d+\?resume=[^"]+)"/g)].map((m) => m[1]);
const approveUrl = urls.find((u) => u.includes('decision=approve'));
const rejectUrl = urls.find((u) => u.includes('decision=reject'));
approveUrl && rejectUrl ? ok('el correo trae los dos botones (aprobar y rechazar)') : ko('el correo no trae los dos botones');
!hitl.body.includes('{{') ? ok('ninguna expresión quedó sin evaluar en el correo') : ko('hay expresiones sin evaluar en el correo');

const elegida = DECISION === 'reject' ? rejectUrl : approveUrl;
const resume = new URL(elegida).searchParams.get('resume');
const execId = Number(resume.split('/').pop());
resume ? ok(`enlace de ${DECISION} con resume de la espera (ejecución ${execId})`) : ko('el enlace no trae resume');

// ── 4. Decidir desde la app ───────────────────────────────────────────
const qs = new URLSearchParams({ decision: DECISION, resume });
const resp = await fetch(`${BASE}/api/orders/${orden}/approve?${qs}`, {
  method: 'POST',
  headers: { Cookie: cookie, 'content-type': 'application/json' },
});
const cuerpo = await resp.json().catch(() => ({}));
resp.status === 200
  ? ok(`POST /api/orders/${orden}/approve?decision=${DECISION} → 200`)
  : ko(`el endpoint respondió ${resp.status}: ${JSON.stringify(cuerpo).slice(0, 200)}`);

// ── 5. Rastro en base de datos y auditoría ────────────────────────────
const esperado = DECISION === 'reject' ? 'cancelled' : 'approved';
const estado = sql(`SELECT status FROM maintenance_orders WHERE order_id=${orden}`);
estado === esperado ? ok(`orden #${orden} → ${esperado}`) : ko(`estado '${estado}' (esperado '${esperado}')`);

const firma = sql(`SELECT CASE WHEN approved_by IS NULL THEN 'null' ELSE approved_by::text END FROM maintenance_orders WHERE order_id=${orden}`);
if (DECISION === 'reject') {
  firma === 'null' ? ok('rechazar no firma como aprobador (approved_by vacío)') : ko(`approved_by=${firma}`);
  const notas = sql(`SELECT CASE WHEN notes LIKE '%Rechazada por%' THEN 'ok' ELSE 'no' END FROM maintenance_orders WHERE order_id=${orden}`);
  notas === 'ok' ? ok('las notas dejan traza de quién rechazó') : ko('las notas no registran el rechazo');
} else {
  firma !== 'null' ? ok('la aprobación registra quién aprobó') : ko('approved_by vacío tras aprobar');
}

const accion = DECISION === 'reject' ? 'reject_order' : 'approve_order';
const contraria = DECISION === 'reject' ? 'approve_order' : 'reject_order';
Number(sql(`SELECT count(*) FROM audit_log WHERE action='${accion}' AND entity_id='${orden}'`)) >= 1
  ? ok(`auditoría registra ${accion}`)
  : ko(`sin entrada ${accion} para #${orden}`);
Number(sql(`SELECT count(*) FROM audit_log WHERE action='${contraria}' AND entity_id='${orden}'`)) === 0
  ? ok(`no se registró la decisión contraria (${contraria})`)
  : ko(`se registró ${contraria} en una decisión ${DECISION}`);

// ── 6. Correo de cierre del workflow ──────────────────────────────────
const patron = DECISION === 'reject' ? /rechazad/i : /asignada|aprobada/i;
let cierre = null;
for (let i = 0; i < 20 && !cierre; i++) {
  await sleep(3000);
  cierre = (await correos()).find(
    (c) => patron.test(c.subject) && (c.subject.includes(`#${orden}`) || c.body.includes(`#${orden}`)),
  );
}
cierre
  ? ok(`WF-02 envió el correo de cierre: "${cierre.subject.replace(/\s+/g, ' ').slice(0, 60)}"`)
  : ko('no llegó el correo de cierre del workflow');
if (cierre) !cierre.body.includes('{{') ? ok('el correo de cierre no trae expresiones sin evaluar') : ko('expresiones sin evaluar en el correo de cierre');

// ── 7. La ejecución terminó bien y la orden salió de la espera ─────────
let exec = null;
for (let i = 0; i < 15 && !exec; i++) {
  exec = sql(`SELECT status FROM execution_entity WHERE id=${execId}`, 'n8n');
  if (exec === 'success' || exec === 'error' || exec === 'crashed') break;
  await sleep(2000);
}
exec === 'success' ? ok(`ejecución n8n ${execId} → success`) : ko(`ejecución n8n ${execId} → ${exec || 'desconocido'}`);

console.log(`\nRESUMEN [${DECISION}] pass=${pass} fail=${fail} · orden=#${orden} · ejecución=${execId}`);
process.exit(fail === 0 ? 0 : 1);
