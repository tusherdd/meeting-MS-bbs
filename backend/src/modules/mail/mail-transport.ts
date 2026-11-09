import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { EnvVars } from '../../config/env.validation';

export interface OutgoingMail {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/** How mail leaves the system. Swappable in tests (no SMTP needed). */
export interface MailTransport {
  send(mail: OutgoingMail): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** Nodemailer over SMTP (SMTP_* settings). Connects lazily, only when a real mail is sent. */
@Injectable()
export class SmtpMailTransport implements MailTransport {
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService<EnvVars, true>) {}

  async send(mail: OutgoingMail): Promise<void> {
    this.transporter ??= this.create();
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  }

  private create(): Transporter {
    const user = this.config.get('SMTP_USER', { infer: true });
    const pass = this.config.get('SMTP_PASSWORD', { infer: true });
    return createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      // true = TLS from the start (port 465); false = STARTTLS upgrade (port 587)
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      requireTLS: !this.config.get('SMTP_SECURE', { infer: true }),
      auth: user ? { user, pass } : undefined,
      // Short timeouts: one slow server must not block the whole batch for long.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
}
