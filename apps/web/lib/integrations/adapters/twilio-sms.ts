// Adaptador de SMS real contra la API REST de Twilio (sin SDK: solo `fetch`).
// Requiere SMS_ACCOUNT_SID, SMS_AUTH_TOKEN y SMS_FROM en `.env`.

import { env } from '@/lib/env';
import { fetchWithTimeout, probe } from '../support';
import type { HealthStatus, SmsClient, SmsResult } from '../types';

export class TwilioSmsAdapter implements SmsClient {
  readonly kind = 'sms' as const;
  readonly adapter = 'sms-twilio';
  readonly mode = 'real' as const;

  constructor(
    private readonly accountSid: string | undefined = env.SMS_ACCOUNT_SID,
    private readonly authToken: string | undefined = env.SMS_AUTH_TOKEN,
    private readonly from: string = env.SMS_FROM,
    private readonly timeoutMs: number = env.INTEGRATION_TIMEOUT_MS,
  ) {}

  private get configured(): boolean {
    return Boolean(this.accountSid && this.authToken && !this.accountSid.startsWith('ACxxx'));
  }

  async send(to: string, message: string): Promise<SmsResult> {
    if (!this.configured) {
      throw new Error('Twilio sin credenciales válidas (SMS_ACCOUNT_SID / SMS_AUTH_TOKEN)');
    }
    const body = new URLSearchParams({ To: to, From: this.from, Body: message });
    const res = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        timeoutMs: this.timeoutMs,
      },
    );
    if (!res.ok) throw new Error(`Twilio respondió HTTP ${res.status}`);
    const data = (await res.json()) as { sid?: string };
    return { sent: true, provider: 'twilio', id: data.sid };
  }

  health(): Promise<HealthStatus> {
    return probe(this.kind, this.adapter, this.mode, async () => {
      if (!this.configured) throw new Error('Twilio sin credenciales configuradas');
    });
  }
}
