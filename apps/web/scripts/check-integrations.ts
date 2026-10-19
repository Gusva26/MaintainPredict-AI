import 'dotenv/config';
import { getIntegrations } from '../lib/integrations';

/**
 * Diagnóstico de las integraciones externas (ERP, SCADA, SMS, Email).
 *
 * Imprime el estado de cada adaptador y hace una llamada real de ejemplo al ERP.
 * Útil para verificar `INTEGRATIONS_MODE` y las URL de `.env` antes de dar por
 * buena una instalación.
 *
 *   docker compose exec -T web sh -lc 'cd /app/apps/web && ./node_modules/.bin/tsx scripts/check-integrations.ts'
 */
async function main() {
  const integrations = getIntegrations();
  console.log(`Modo de integraciones: ${integrations.mode}\n`);

  const statuses = await integrations.health();
  for (const s of statuses) {
    const flag = s.ok ? 'OK  ' : 'FALLO';
    const extra = s.detail ? ` — ${s.detail}` : '';
    console.log(`[${flag}] ${s.kind.padEnd(6)} ${s.adapter.padEnd(20)} ${String(s.latencyMs).padStart(4)} ms  (${s.mode})${extra}`);
  }

  console.log('\nPrueba de repuestos (ERP) para "bearing":');
  const parts = await integrations.erp.checkParts('bearing');
  for (const p of parts) {
    console.log(`  ${p.sku}  x${p.qty}  lead ${p.lead_days}d  [origen: ${p.source}]`);
  }

  const fallidos = statuses.filter((s) => !s.ok);
  if (fallidos.length > 0) {
    console.error(`\n${fallidos.length} adaptador(es) con fallo. Revisa las URL y credenciales en .env.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
