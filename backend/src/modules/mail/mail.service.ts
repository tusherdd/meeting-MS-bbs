import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EnvVars } from '../../config/env.validation';
import { EmailOutbox } from './entities/email-outbox.entity';
import { EmailStatus } from './enums/email-status.enum';
import { maskEmail, type MailContent } from './templates/mail-templates';

export interface EnqueueMailInput extends MailContent {
  to: string;
}

/**
 * Puts mail into the DB outbox (SPEC.md §6.5). Nothing is sent here — MailWorkerService sends
 * it — so no request ever waits for SMTP. Mail to a user goes through NotificationsService
 * (EmailChannel); call this directly only for addresses that are not the user's verified
 * notification email (verification link to a new address, login-email change notices).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly dryRun: boolean;

  constructor(
    @InjectRepository(EmailOutbox)
    private readonly outbox: Repository<EmailOutbox>,
    config: ConfigService<EnvVars, true>,
  ) {
    this.dryRun = config.get('MAIL_DRY_RUN', { infer: true });
  }

  /** Pass `manager` to enqueue inside the caller's transaction. Returns the outbox row id. */
  async enqueue(
    mail: EnqueueMailInput,
    manager?: EntityManager,
  ): Promise<string> {
    const repo = manager ? manager.getRepository(EmailOutbox) : this.outbox;
    const result = await repo.insert({
      to: mail.to.trim().toLowerCase(),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      status: EmailStatus.PENDING,
    });
    const id = (result.identifiers[0] as { id: string }).id;
    if (this.dryRun) {
      // Never the body (it can contain a one-time link); recipient masked.
      this.logger.log(
        `[MAIL_DRY_RUN] queued ${id} to ${maskEmail(mail.to)}: "${mail.subject}"`,
      );
    }
    return id;
  }
}
