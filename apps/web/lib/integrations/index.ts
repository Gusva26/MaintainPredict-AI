// Factoría de integraciones de MaintainPredict AI.
//
//   ERP   → ErpHttpAdapter          (HTTP + x-api-key)
//   SCADA → ScadaHttpAdapter        (HTTP + x-api-key)
//   SMS   → MockSmsGatewayAdapter   (pasarela mock o dry-run / log)
//           TwilioSmsAdapter        (SMS real)
//   Email → SmtpEmailAdapter        (SMTP; MailHog en desarrollo)
//
// Cambiar de simulado a real = `INTEGRATIONS_MODE=real` + credenciales reales en `.env`.
// El resto del código no se toca: todo habla contra las interfaces de `./types`.

import { env } from '@/lib/env';
import { ErpHttpAdapter } from './adapters/http-erp';
import { ScadaHttpAdapter } from './adapters/http-scada';
import { MockSmsGatewayAdapter } from './adapters/mock-sms';
import { TwilioSmsAdapter } from './adapters/twilio-sms';
import { SmtpEmailAdapter } from './adapters/smtp-email';
import type { Integrations, SmsClient } from './types';

export * from './types';
export { LOCAL_PARTS_CATALOG } from './adapters/http-erp';
export { ErpHttpAdapter } from './adapters/http-erp';
export { ScadaHttpAdapter } from './adapters/http-scada';
export { MockSmsGatewayAdapter } from './adapters/mock-sms';
export { TwilioSmsAdapter } from './adapters/twilio-sms';
export { SmtpEmailAdapter } from './adapters/smtp-email';

function buildSms(): SmsClient {
  switch (env.SMS_PROVIDER) {
    case 'twilio':
      return new TwilioSmsAdapter();
    case 'mock':
      // Pasarela real (`infra/mocks/sms`), pero simulada: sin coste ni SMS de verdad.
      return new MockSmsGatewayAdapter(undefined, undefined, false);
    default:
      // `log`: dry-run, solo registra en el log del servicio.
      return new MockSmsGatewayAdapter();
  }
}

function build(): Integrations {
  const web = new SmtpEmailAdapter();
  const integrations: Integrations = {
    mode: env.INTEGRATIONS_MODE,
    erp: new ErpHttpAdapter(),
    scada: new ScadaHttpAdapter(),
    sms: buildSms(),
    email: web,
    async health() {
      return Promise.all([
        integrations.erp.health(),
        integrations.scada.health(),
        integrations.sms.health(),
        integrations.email.health(),
      ]);
    },
  };

  if (integrations.mode === 'real') {
    const usingMock = [integrations.erp, integrations.scada, integrations.sms, integrations.email]
      .filter((a) => a.mode === 'mock')
      .map((a) => a.adapter);
    if (usingMock.length > 0) {
      console.warn(
        `[integrations] INTEGRATIONS_MODE=real pero hay adaptadores simulados: ${usingMock.join(', ')}`,
      );
    }
  }

  return integrations;
}

let cached: Integrations | null = null;

/** Devuelve la instancia de integraciones (perezosa y cacheada por proceso). */
export function getIntegrations(): Integrations {
  if (!cached) cached = build();
  return cached;
}

/** Solo para tests: fuerza la reconstrucción en el siguiente `getIntegrations()`. */
export function resetIntegrations(): void {
  cached = null;
}
