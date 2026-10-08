import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../common/config/env';
import { JobsService } from '../jobs/jobs.service';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Calendar invite (RFC 5545 text); mail clients show accept/decline buttons. */
  icalEvent?: { method: 'REQUEST' | 'CANCEL'; content: string };
};

/** Swappable email transport (CLAUDE.md §3): console (dev), Ethereal (dev preview), SMTP (Brevo). */
export interface MailProvider {
  send(message: MailMessage & { from: string }): Promise<void>;
}

class ConsoleMailProvider implements MailProvider {
  constructor(private readonly logger: PinoLogger) {}
  async send(message: MailMessage & { from: string }): Promise<void> {
    // Dev only: prints the text body so links (invites, resets) can be clicked from the log.
    this.logger.info(
      { to: message.to, subject: message.subject, calendar: message.icalEvent?.method },
      `Email (console)\n${message.text}`,
    );
  }
}

class NodemailerProvider implements MailProvider {
  constructor(
    private readonly getTransport: () => Promise<Transporter>,
    private readonly logger: PinoLogger,
  ) {}
  async send(message: MailMessage & { from: string }): Promise<void> {
    const info = await (await this.getTransport()).sendMail(message);
    const preview = nodemailer.getTestMessageUrl(info);
    this.logger.info(
      { to: message.to, subject: message.subject, preview: preview || undefined },
      'Email sent',
    );
  }
}

export const MAIL_JOB = 'mail.send';
const SEND_TIMEOUT_MS = 10_000;

@Injectable()
export class MailService {
  private readonly provider: MailProvider;
  private readonly from: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly jobs: JobsService,
    @InjectPinoLogger(MailService.name) logger: PinoLogger,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.provider = MailService.createProvider(config, logger);
    jobs.register<MailMessage>(MAIL_JOB, (message) =>
      this.provider.send({ ...message, from: this.from }),
    );
  }

  /** Queues the email; delivery (with retries) happens in the background (CLAUDE.md §7). */
  async send(message: MailMessage): Promise<void> {
    await this.jobs.send(MAIL_JOB, message);
  }

  private static createProvider(
    config: ConfigService<Env, true>,
    logger: PinoLogger,
  ): MailProvider {
    switch (config.get('MAIL_PROVIDER', { infer: true })) {
      case 'smtp': {
        const transport = nodemailer.createTransport({
          host: config.get('SMTP_HOST', { infer: true }),
          port: config.get('SMTP_PORT', { infer: true }),
          auth: {
            user: config.get('SMTP_USER', { infer: true }),
            pass: config.get('SMTP_PASS', { infer: true }),
          },
          connectionTimeout: SEND_TIMEOUT_MS,
          socketTimeout: SEND_TIMEOUT_MS,
        });
        return new NodemailerProvider(async () => transport, logger);
      }
      case 'ethereal': {
        let transport: Promise<Transporter> | undefined;
        return new NodemailerProvider(
          () =>
            (transport ??= nodemailer.createTestAccount().then((account) =>
              nodemailer.createTransport({
                host: account.smtp.host,
                port: account.smtp.port,
                secure: account.smtp.secure,
                auth: { user: account.user, pass: account.pass },
              }),
            )),
          logger,
        );
      }
      default:
        return new ConsoleMailProvider(logger);
    }
  }
}
