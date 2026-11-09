import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  paginated,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import type { AuditLogItemDto, AuditLogQueryDto } from './dto/audit-log.dto';
import { AuditLog } from './entities/audit-log.entity';
import { redact } from './redact';

/** Read side of the audit trail (ADMIN): filtered, newest first, redacted. */
@Injectable()
export class AuditQueryService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  async list(
    query: AuditLogQueryDto,
  ): Promise<PaginatedResponseDto<AuditLogItemDto>> {
    const qb = this.logs
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.actor', 'u');
    if (query.actorId)
      qb.andWhere('a.actorId = :actorId', { actorId: query.actorId });
    if (query.action)
      qb.andWhere('a.action = :action', { action: query.action });
    if (query.entityType)
      qb.andWhere('a.entityType = :entityType', {
        entityType: query.entityType,
      });
    if (query.entityId)
      qb.andWhere('a.entityId = :entityId', { entityId: query.entityId });
    if (query.from)
      qb.andWhere('a.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('a.createdAt <= :to', { to: new Date(query.to) });
    const [rows, total] = await qb
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginated(
      rows.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        actor: a.actor
          ? { id: a.actor.id, nameBn: a.actor.nameBn, nameEn: a.actor.nameEn }
          : null,
        before: redact(a.before),
        after: redact(a.after),
        ip: a.ip,
        createdAt: a.createdAt,
      })),
      total,
      query,
    );
  }
}
