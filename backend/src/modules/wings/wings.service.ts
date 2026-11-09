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
import type {
  CreateWingDto,
  UpdateWingDto,
  WingListQueryDto,
  WingResponseDto,
} from './dto/wing.dto';
import { Wing } from './entities/wing.entity';
import { WING_MESSAGES } from './wings.messages';

const UNIQUE_NAME_INDEX = 'UQ_wings_nameEn_lower';

/** Wings (organisational units): list, create, update, delete only when unused. */
@Injectable()
export class WingsService {
  constructor(
    @InjectRepository(Wing) private readonly wings: Repository<Wing>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(query: WingListQueryDto): Promise<WingResponseDto[]> {
    const [rows, counts] = await Promise.all([
      this.wings.find({
        where: query.activeOnly ? { isActive: true } : {},
        order: { nameEn: 'ASC' },
      }),
      this.users
        .createQueryBuilder('u')
        .select('u.wingId', 'id')
        .addSelect('COUNT(*)::int', 'count')
        .where('u.wingId IS NOT NULL')
        .groupBy('u.wingId')
        .getRawMany<{ id: string; count: number }>(),
    ]);
    const countById = new Map(counts.map((c) => [c.id, Number(c.count)]));
    return rows.map((w) => this.toResponse(w, countById.get(w.id) ?? 0));
  }

  async findOne(id: string): Promise<WingResponseDto> {
    const wing = await this.getOrFail(id);
    return this.toResponse(wing, await this.users.countBy({ wingId: id }));
  }

  async create(
    dto: CreateWingDto,
    actorId: string,
    ip: string | null,
  ): Promise<WingResponseDto> {
    await this.assertNameFree(dto.nameEn);
    const created = await this.dataSource
      .transaction(async (manager) => {
        const repo = manager.getRepository(Wing);
        const wing = await repo.save(
          repo.create({
            nameBn: dto.nameBn,
            nameEn: dto.nameEn,
            isActive: dto.isActive ?? true,
          }),
        );
        await this.audit.log(
          {
            actorId,
            action: AuditAction.WING_CREATE,
            entityType: 'wing',
            entityId: wing.id,
            after: { ...dto, isActive: wing.isActive },
            ip,
          },
          manager,
        );
        return wing;
      })
      .catch((err: unknown) => this.rethrowDuplicate(err));
    return this.toResponse(created, 0);
  }

  async update(
    id: string,
    dto: UpdateWingDto,
    actorId: string,
    ip: string | null,
  ): Promise<WingResponseDto> {
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
        await manager.getRepository(Wing).update(id, changes.after);
        await this.audit.log(
          {
            actorId,
            action: AuditAction.WING_UPDATE,
            entityType: 'wing',
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
    const userCount = await this.users.countBy({ wingId: id });
    if (userCount > 0) {
      throw new ConflictException(WING_MESSAGES.inUse(userCount));
    }
    await this.dataSource
      .transaction(async (manager) => {
        await manager.getRepository(Wing).delete(id);
        await this.audit.log(
          {
            actorId,
            action: AuditAction.WING_DELETE,
            entityType: 'wing',
            entityId: id,
            before: { nameBn: current.nameBn, nameEn: current.nameEn },
            ip,
          },
          manager,
        );
      })
      .catch((err: unknown) => {
        // A user joined the wing between the check and the delete: FK (RESTRICT) stops it.
        if (isForeignKeyViolation(err)) {
          throw new ConflictException(WING_MESSAGES.inUseGeneric);
        }
        throw err;
      });
  }

  private async getOrFail(id: string): Promise<Wing> {
    const wing = await this.wings.findOneBy({ id });
    if (!wing) throw new NotFoundException(WING_MESSAGES.notFound);
    return wing;
  }

  private async assertNameFree(
    nameEn: string,
    exceptId?: string,
  ): Promise<void> {
    const qb = this.wings
      .createQueryBuilder('w')
      .where('lower(w.nameEn) = lower(:nameEn)', { nameEn });
    if (exceptId) qb.andWhere('w.id <> :exceptId', { exceptId });
    if (await qb.getExists()) {
      throw new ConflictException(WING_MESSAGES.duplicateName);
    }
  }

  private rethrowDuplicate(err: unknown): never {
    if (isUniqueViolation(err, UNIQUE_NAME_INDEX)) {
      throw new ConflictException(WING_MESSAGES.duplicateName);
    }
    throw err;
  }

  private toResponse(w: Wing, userCount: number): WingResponseDto {
    return {
      id: w.id,
      nameBn: w.nameBn,
      nameEn: w.nameEn,
      isActive: w.isActive,
      userCount,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    };
  }
}
