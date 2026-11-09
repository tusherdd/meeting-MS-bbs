import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from './enums/audit-action.enum';

export interface AuditEntry {
  /** Who did it; null for system actions or unknown users (e.g. login with an unknown email). */
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Snapshots. Never put passwords, hashes or tokens in here. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Append-only audit trail (SPEC.md §9.13). */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  /** Pass `manager` to write inside the caller's transaction. */
  async log(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.logs;
    // Built as an entity instance: insert()'s partial type does not accept jsonb records.
    const log = Object.assign(new AuditLog(), {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip?.slice(0, 45) ?? null,
    });
    await repo.save(log);
  }
}
