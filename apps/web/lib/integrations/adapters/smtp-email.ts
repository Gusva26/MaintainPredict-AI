// Adaptador de email vía SMTP (nodemailer). En desarrollo apunta a MailHog
// (`SMTP_HOST=mailhog`, `SMTP_PORT=1025`), que captura todo sin enviar nada fuera.

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';
import { modeOf, probe } from '../support';
import type { EmailClient, EmailMessage, HealthStatus } from '../types';

export class SmtpEmailAdapter implements EmailClient {
  readonly kind = 'email' as const;
  readonly adapter = 'email-smtp';
  readonly mode;

  private transporter: Transporter | null = null;

  constructor(
    private readonly host: string = env.SMTP_HOST,
    private readonly port: number = env.SMTP_PORT,
    private readonly user: string | undefined = env.SMTP_USER,
    private readonly pass: string | undefined = env.SMTP_PASS,
    private readonly from: string = env.SMTP_FROM,
  ) {
    this.mode = modeOf(host);
  }

  private transport(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: this.user ? { user: this.user, pass: this.pass } : undefined,
      });
    }
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<{ sent: boolean; provider: string }> {
    await this.transport().sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true, provider: 'smtp' };
  }

  health(): Promise<HealthStatus> {
    return probe(this.kind, this.adapter, this.mode, async () => {
      await this.transport().verify();
    });
  }
}
