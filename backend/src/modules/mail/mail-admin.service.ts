import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  paginated,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type {
  EmailOutboxItemDto,
  EmailOutboxQueryDto,
} from './dto/email-outbox.dto';
import { EmailOutbox } from './entities/email-outbox.entity';
import { EmailStatus } from './enums/email-status.enum';

/** Admin view of the mail queue (SPEC.md §8 "Admin"). Never exposes mail bodies. */
@Injectable()
export class MailAdminService {
  constructor(
    @InjectRepository(EmailOutbox)
    private readonly outbox: Repository<EmailOutbox>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    query: EmailOutboxQueryDto,
  ): Promise<PaginatedResponseDto<EmailOutboxItemDto>> {
    const [rows, total] = await this.outbox.findAndCount({
      // Explicit column list: html/text are never loaded here.
      select: {
        id: true,
        to: true,
        subject: true,
        status: true,
        attempts: true,
        lastError: true,
        nextAttemptAt: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
      },
      where: query.status ? { status: query.status } : {},
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(
      rows.map((r) => this.toItem(r)),
      total,
      query,
    );
  }

  /** FAILED → PENDING with a fresh attempt counter; the worker picks it up within a minute. */
  async retry(
    id: string,
    actorId: string,
    ip: string | null,
  ): Promise<EmailOutboxItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EmailOutbox);
      const mail = await repo
        .createQueryBuilder('o')
        .select(['o.id', 'o.status', 'o.attempts', 'o.lastError'])
        .where('o.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!mail) throw new NotFoundException('মেইলটি পাওয়া যায়নি।');
      if (mail.status !== EmailStatus.FAILED) {
        throw new ConflictException(
          'শুধু ব্যর্থ (FAILED) মেইল আবার পাঠানো যায়।',
        );
      }
      await repo.update(id, {
        status: EmailStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null,
      });
      await this.audit.log(
        {
          actorId,
          action: AuditAction.EMAIL_RETRY,
          entityType: 'email_outbox',
          entityId: id,
          before: {
            status: mail.status,
            attempts: mail.attempts,
            lastError: mail.lastError,
          },
          after: { status: EmailStatus.PENDING },
          ip,
        },
        manager,
      );
    });
    const row = await this.outbox.findOneOrFail({
      where: { id },
      select: {
        id: true,
        to: true,
        subject: true,
        status: true,
        attempts: true,
        lastError: true,
        nextAttemptAt: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return this.toItem(row);
  }

  private toItem(r: EmailOutbox): EmailOutboxItemDto {
    return {
      id: r.id,
      to: r.to,
      subject: r.subject,
      status: r.status,
      attempts: r.attempts,
      lastError: r.lastError,
      nextAttemptAt: r.nextAttemptAt,
      sentAt: r.sentAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
