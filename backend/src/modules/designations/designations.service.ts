import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { pickChanges } from '../../common/utils/changes';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { User } from '../users/entities/user.entity';
import { DESIGNATION_MESSAGES } from './designations.messages';
import type {
  CreateDesignationDto,
  DesignationListQueryDto,
  DesignationResponseDto,
  UpdateDesignationDto,
} from './dto/designation.dto';
import { Designation } from './entities/designation.entity';

const UNIQUE_NAME_INDEX = 'UQ_designations_nameEn_lower';

/**
 * Designations and their meeting priority (SPEC.md §6.1). Priority changes are audited and do
 * NOT touch existing meetings: meeting.priority is a snapshot taken at creation (SPEC.md §6.3).
 */
@Injectable()
export class DesignationsService {
  constructor(
    @InjectRepository(Designation)
    private readonly designations: Repository<Designation>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    query: DesignationListQueryDto,
  ): Promise<DesignationResponseDto[]> {
    const [rows, counts] = await Promise.all([
      this.designations.find({
        where: query.activeOnly ? { isActive: true } : {},
        order: { priority: 'ASC', nameEn: 'ASC' },
      }),
      this.users
        .createQueryBuilder('u')
        .select('u.designationId', 'id')
        .addSelect('COUNT(*)::int', 'count')
        .where('u.designationId IS NOT NULL')
        .groupBy('u.designationId')
        .getRawMany<{ id: string; count: number }>(),
    ]);
    const countById = new Map(counts.map((c) => [c.id, Number(c.count)]));
    return rows.map((d) => this.toResponse(d, countById.get(d.id) ?? 0));
  }

  async findOne(id: string): Promise<DesignationResponseDto> {
    const designation = await this.getOrFail(id);
    return this.toResponse(designation, await this.countUsers(id));
  }

  async create(
    dto: CreateDesignationDto,
    actorId: string,
    ip: string | null,
  ): Promise<DesignationResponseDto> {
    await this.assertNameFree(dto.nameEn);
    const created = await this.dataSource
      .transaction(async (manager) => {
        const designation = await manager.getRepository(Designation).save(
          manager.getRepository(Designation).create({
            nameBn: dto.nameBn,
            nameEn: dto.nameEn,
            priority: dto.priority,
            isActive: dto.isActive ?? true,
          }),
        );
        await this.audit.log(
          {
            actorId,
            action: AuditAction.DESIGNATION_CREATE,
            entityType: 'designation',
            entityId: designation.id,
            after: { ...dto, isActive: designation.isActive },
            ip,
          },
          manager,
        );
        return designation;
      })
      .catch((err: unknown) => this.rethrowDuplicate(err));
    return this.toResponse(created, 0);
  }

  async update(
    id: string,
    dto: UpdateDesignationDto,
    actorId: string,
    ip: string | null,
  ): Promise<DesignationResponseDto> {
    const current = await this.getOrFail(id);
    const changes = pickChanges(current, dto);
    if (!changes) return this.findOne(id);
    if (
      dto.nameEn !== undefined &&
      dto.nameEn.toLowerCase() !== current.nameEn.toLowerCase()
    ) {
      await this.assertNameFree(dto.nameEn, id);
    }

    await this.dataSource
      .transaction(async (manager) => {
        await manager.getRepository(Designation).update(id, changes.after);
        await this.audit.log(
          {
            actorId,
            // Priority changes get their own action so they are easy to find.
            action:
              'priority' in changes.after
                ? AuditAction.DESIGNATION_PRIORITY_CHANGE
                : AuditAction.DESIGNATION_UPDATE,
            entityType: 'designation',
            entityId: id,
            before: changes.before,
            after: changes.after,
            ip,
          },
          manager,
        );
      })
      .catch((err: unknown) => this.rethrowDuplicate(err));
    return this.findOne(id);
  }

  async remove(id: string, actorId: string, ip: string | null): Promise<void> {
    const current = await this.getOrFail(id);
    const userCount = await this.countUsers(id);
    if (userCount > 0) {
      throw new ConflictException(DESIGNATION_MESSAGES.inUse(userCount));
    }
    await this.dataSource
      .transaction(async (manager) => {
        await manager.getRepository(Designation).delete(id);
        await this.audit.log(
          {
            actorId,
            action: AuditAction.DESIGNATION_DELETE,
            entityType: 'designation',
            entityId: id,
            before: {
              nameBn: current.nameBn,
              nameEn: current.nameEn,
              priority: current.priority,
            },
            ip,
          },
          manager,
        );
      })
      .catch((err: unknown) => {
        // A user was assigned between the check and the delete: the FK (RESTRICT) stops it.
        if (isForeignKeyViolation(err)) {
          throw new ConflictException(DESIGNATION_MESSAGES.inUseGeneric);
        }
        throw err;
      });
  }

  // ---------------------------------------------------------------- helpers

  private async getOrFail(id: string): Promise<Designation> {
    const designation = await this.designations.findOneBy({ id });
    if (!designation)
      throw new NotFoundException(DESIGNATION_MESSAGES.notFound);
    return designation;
  }

  private countUsers(designationId: string): Promise<number> {
    return this.users.countBy({ designationId });
  }

  private async assertNameFree(
    nameEn: string,
    exceptId?: string,
  ): Promise<void> {
    const qb = this.designations
      .createQueryBuilder('d')
      .where('lower(d.nameEn) = lower(:nameEn)', { nameEn });
    if (exceptId) qb.andWhere('d.id <> :exceptId', { exceptId });
    if (await qb.getExists()) {
      throw new ConflictException(DESIGNATION_MESSAGES.duplicateName);
    }
  }

  /** Race-safe backstop: the unique index wins if two requests pass the pre-check together. */
  private rethrowDuplicate(err: unknown): never {
    if (isUniqueViolation(err, UNIQUE_NAME_INDEX)) {
      throw new ConflictException(DESIGNATION_MESSAGES.duplicateName);
    }
    throw err;
  }

  private toResponse(
    d: Designation,
    userCount: number,
  ): DesignationResponseDto {
    return {
      id: d.id,
      nameBn: d.nameBn,
      nameEn: d.nameEn,
      priority: d.priority,
      isActive: d.isActive,
      userCount,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
}
