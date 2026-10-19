// Adaptador de SMS contra la pasarela de desarrollo (`infra/mocks/sms`).
//
// `SMS_PROVIDER=log`  → modo dry-run: registra el mensaje y no llama a la red.
// `SMS_PROVIDER=mock` → envía de verdad a la pasarela mock (SMS_BASE_URL).
//
// En producción se usa `TwilioSmsAdapter` (`SMS_PROVIDER=twilio`).

import { env } from '@/lib/env';
import { fetchWithTimeout, modeOf, probe } from '../support';
import type { HealthStatus, SmsClient, SmsResult } from '../types';

export class MockSmsGatewayAdapter implements SmsClient {
  readonly kind = 'sms' as const;
  readonly adapter: string;
  readonly mode;

  constructor(
    private readonly baseUrl: string = env.SMS_BASE_URL,
    private readonly from: string = env.SMS_FROM,
    private readonly dryRun: boolean = true,
    private readonly timeoutMs: number = env.INTEGRATION_TIMEOUT_MS,
  ) {
    this.mode = modeOf(baseUrl);
    this.adapter = dryRun ? 'sms-log' : 'sms-mock-gateway';
  }

  async send(to: string, message: string): Promise<SmsResult> {
    if (this.dryRun) {
      console.log(`[sms:dry-run] -> ${to}: ${message}`);
      return { sent: true, provider: 'log', dryRun: true };
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, from: this.from, message }),
      timeoutMs: this.timeoutMs,
    });
    if (!res.ok) throw new Error(`Pasarela SMS respondió HTTP ${res.status}`);
    const data = (await res.json()) as { id?: string };
    return { sent: true, provider: 'mock-gateway', id: data.id };
  }

  health(): Promise<HealthStatus> {
    return probe(this.kind, this.adapter, this.mode, async () => {
      if (this.dryRun) return; // modo log: no hay servicio que sondear
      const res = await fetchWithTimeout(`${this.baseUrl}/health`, { timeoutMs: this.timeoutMs });
      if (!res.ok) throw new Error(`Pasarela SMS respondió HTTP ${res.status}`);
    });
  }
}
