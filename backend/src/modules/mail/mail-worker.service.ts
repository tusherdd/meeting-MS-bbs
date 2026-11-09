import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import { EnvVars } from '../../config/env.validation';
import { EmailOutbox } from './entities/email-outbox.entity';
import { EmailStatus } from './enums/email-status.enum';
import {
  afterFailure,
  BATCH_SIZE,
  safeErrorText,
  SENT_RETENTION_DAYS,
} from './mail-worker.logic';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport';
import { maskEmail } from './templates/mail-templates';

export interface BatchResult {
  sent: number;
  retried: number;
  failed: number;
}

/** Dev-only copies of dry-run mails (git-ignored), so one-time links can be tested locally. */
export const MAIL_PREVIEW_DIR = 'tmp/mail-preview';
const PREVIEW_MAX_AGE_MS = 24 * 3_600_000;

/**
 * Sends the email outbox (SPEC.md §6.5).
 *
 * Every minute one batch is CLAIMED with `SELECT … FOR UPDATE SKIP LOCKED` inside a
 * transaction: rows locked by another worker (second instance, overlapping run) are skipped,
 * so a mail is never sent twice. Success → SENT and the body is deleted (privacy). Failure →
 * retry after 1, 5, 15, 60 minutes; the 5th failure → FAILED. MAIL_DRY_RUN=true never opens
 * an SMTP connection: it logs the masked recipient + subject and marks the mail SENT.
 */
@Injectable()
export class MailWorkerService {
  private readonly logger = new Logger(MailWorkerService.name);
  private readonly dryRun: boolean;
  private readonly writePreviews: boolean;
  private readonly secrets: string[];
  private readonly previewDir = resolve(process.cwd(), MAIL_PREVIEW_DIR);
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly config: ConfigService<EnvVars, true>,
  ) {
    const env = config.get('NODE_ENV', { infer: true });
    this.dryRun = config.get('MAIL_DRY_RUN', { infer: true });
    this.writePreviews = this.dryRun && env === 'development';
    this.secrets = [
      config.get('SMTP_PASSWORD', { infer: true }),
      config.get('SMTP_USER', { infer: true }),
    ];
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'mail-outbox' })
  async sendDueMail(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return; // tests call processBatch()
    try {
      const result = await this.processBatch();
      if (result.sent + result.retried + result.failed > 0) {
        this.logger.log(
          `Mail batch: ${result.sent} sent, ${result.retried} will retry, ${result.failed} failed`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Mail batch crashed: ${safeErrorText(err, this.secrets)}`,
      );
    }
  }

  /** Daily 03:00 Dhaka time: delete SENT rows older than 30 days (and old dev previews). */
  @Cron('0 3 * * *', { name: 'mail-outbox-cleanup', timeZone: 'Asia/Dhaka' })
  async cleanup(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SENT_RETENTION_DAYS * 86_400_000);
    const result = await this.dataSource
      .getRepository(EmailOutbox)
      .delete({ status: EmailStatus.SENT, sentAt: LessThan(cutoff) });
    await this.prunePreviews(now);
    return result.affected ?? 0;
  }

  async processBatch(now = new Date()): Promise<BatchResult> {
    const result: BatchResult = { sent: 0, retried: 0, failed: 0 };
    if (this.running) return result; // previous minute's batch still busy in this process
    this.running = true;
    try {
      await this.dataSource.transaction(async (manager) => {
        const due = await manager
          .getRepository(EmailOutbox)
          .createQueryBuilder('o')
          .where('o.status = :status', { status: EmailStatus.PENDING })
          .andWhere('o.nextAttemptAt <= :now', { now })
          .orderBy('o.nextAttemptAt', 'ASC')
          .addOrderBy('o.createdAt', 'ASC')
          .limit(BATCH_SIZE)
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getMany();

        for (const mail of due) {
          try {
            await this.deliver(mail);
            await this.markSent(manager, mail, now);
            result.sent++;
          } catch (err) {
            const outcome = await this.markFailure(manager, mail, err, now);
            if (outcome === EmailStatus.FAILED) result.failed++;
            else result.retried++;
          }
        }
      });
    } finally {
      this.running = false;
    }
    return result;
  }

  private async deliver(mail: EmailOutbox): Promise<void> {
    if (!mail.html && !mail.text) throw new Error('Mail has no body');
    if (this.dryRun) {
      this.logger.log(
        `[MAIL_DRY_RUN] to ${maskEmail(mail.to)}: "${mail.subject}"`,
      );
      if (this.writePreviews) await this.writePreview(mail);
      return;
    }
    await this.transport.send({
      to: mail.to,
      subject: mail.subject,
      html: mail.html ?? undefined,
      text: mail.text ?? undefined,
    });
  }

  private async markSent(
    manager: EntityManager,
    mail: EmailOutbox,
    now: Date,
  ): Promise<void> {
    await manager.getRepository(EmailOutbox).update(mail.id, {
      status: EmailStatus.SENT,
      sentAt: now,
      attempts: mail.attempts + 1,
      lastError: null,
      // Privacy: the body (one-time links, personal text) is not kept after sending.
      html: null,
      text: null,
    });
  }

  private async markFailure(
    manager: EntityManager,
    mail: EmailOutbox,
    err: unknown,
    now: Date,
  ): Promise<EmailStatus> {
    const outcome = afterFailure(mail.attempts, now);
    await manager.getRepository(EmailOutbox).update(mail.id, {
      status: outcome.status,
      attempts: outcome.attempts,
      lastError: safeErrorText(err, this.secrets),
      ...(outcome.nextAttemptAt
        ? { nextAttemptAt: outcome.nextAttemptAt }
        : {}),
    });
    return outcome.status;
  }

  private async writePreview(mail: EmailOutbox): Promise<void> {
    await mkdir(this.previewDir, { recursive: true });
    const file = join(this.previewDir, `${mail.id}.html`);
    await writeFile(file, mail.html ?? `<pre>${mail.text ?? ''}</pre>`, 'utf8');
    this.logger.log(
      `[MAIL_DRY_RUN] preview: ${MAIL_PREVIEW_DIR}/${mail.id}.html`,
    );
  }

  private async prunePreviews(now: Date): Promise<void> {
    let files: string[];
    try {
      files = await readdir(this.previewDir);
    } catch {
      return; // no preview folder
    }
    for (const name of files) {
      const file = join(this.previewDir, name);
      const info = await stat(file).catch(() => null);
      if (info && now.getTime() - info.mtimeMs > PREVIEW_MAX_AGE_MS) {
        await unlink(file).catch(() => undefined);
      }
    }
  }
}
