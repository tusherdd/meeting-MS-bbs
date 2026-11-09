import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import {
  paginated,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { isUniqueViolation } from '../../common/utils/db-errors';
import { EnvVars } from '../../config/env.validation';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { TokenService } from '../auth/token.service';
import { Designation } from '../designations/entities/designation.entity';
import { MailService } from '../mail/mail.service';
import {
  changeRequestDecisionMail,
  changeRequestSubmittedMail,
  loginEmailChangedMail,
} from '../mail/templates/mail-templates';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import {
  ALL_CHANNELS,
  NotificationsService,
} from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CHANGE_REQUEST_MESSAGES as MSG } from './change-requests.messages';
import type {
  ApproveChangeRequestDto,
  ChangeRequestQueryDto,
  ChangeRequestResponseDto,
  ChangeValueDto,
  CreateChangeRequestDto,
  RejectChangeRequestDto,
} from './dto/change-request.dto';
import { ChangeRequest } from './entities/change-request.entity';
import { ChangeRequestStatus } from './enums/change-request-status.enum';
import { ChangeRequestType } from './enums/change-request-type.enum';

const ONE_PENDING_INDEX = 'UQ_change_requests_one_pending';
const LOGIN_EMAIL_INDEX = 'UQ_users_loginEmail';
const OFFICER_LINK = '/profile/change-requests';
const ADMIN_LINK = (id: string) => `/admin/change-requests/${id}`;

/** What is stored in change_requests.newValue for each type. */
type RequestedValue = { loginEmail: string } | { designationId: string };

/**
 * Login-email and designation change requests (SPEC.md §6.2): officer submits → admins are
 * notified → an admin (not the requester) approves, which applies the change in the same
 * transaction, or rejects with a note → the officer is notified.
 */
@Injectable()
export class ChangeRequestsService {
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(ChangeRequest)
    private readonly requests: Repository<ChangeRequest>,
    private readonly tokens: TokenService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly dataSource: DataSource,
    config: ConfigService<EnvVars, true>,
  ) {
    this.frontendUrl = config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------- officer

  async create(
    actor: AuthUser,
    dto: CreateChangeRequestDto,
    ip: string | null,
  ): Promise<ChangeRequestResponseDto> {
    const users = this.dataSource.getRepository(User);
    const user = await users.findOneOrFail({
      where: { id: actor.id },
      relations: { designation: true },
    });
    if (user.role === UserRole.SUPER_ADMIN)
      throw new BadRequestException(MSG.superAdmin);

    let newValue: RequestedValue;
    if (dto.type === ChangeRequestType.LOGIN_EMAIL) {
      const loginEmail = dto.loginEmail!;
      if (loginEmail === user.loginEmail)
        throw new BadRequestException(MSG.sameLoginEmail);
      if (await users.exists({ where: { loginEmail } })) {
        throw new ConflictException(MSG.loginEmailTaken);
      }
      newValue = { loginEmail };
    } else {
      const designationId = dto.designationId!;
      if (designationId === user.designationId) {
        throw new BadRequestException(MSG.sameDesignation);
      }
      const designation = await this.dataSource
        .getRepository(Designation)
        .findOneBy({ id: designationId });
      if (!designation?.isActive)
        throw new BadRequestException(MSG.designationInvalid);
      newValue = { designationId };
    }

    const pending = await this.requests.exists({
      where: {
        userId: user.id,
        type: dto.type,
        status: ChangeRequestStatus.PENDING,
      },
    });
    if (pending) throw new ConflictException(MSG.onePending);

    const id = await this.dataSource
      .transaction(async (manager) => {
        const result = await manager.getRepository(ChangeRequest).insert({
          userId: user.id,
          type: dto.type,
          newValue,
          status: ChangeRequestStatus.PENDING,
        });
        const requestId = (result.identifiers[0] as { id: string }).id;
        await this.audit.log(
          {
            actorId: user.id,
            action: AuditAction.CHANGE_REQUEST_CREATE,
            entityType: 'change_request',
            entityId: requestId,
            after: { type: dto.type, ...newValue },
            ip,
          },
          manager,
        );
        await this.notifyAdmins(manager, user, requestId, dto.type, newValue);
        return requestId;
      })
      .catch((err: unknown) => {
        // Two submissions at the same moment: the partial unique index lets only one win.
        if (isUniqueViolation(err, ONE_PENDING_INDEX)) {
          throw new ConflictException(MSG.onePending);
        }
        throw err;
      });

    return this.findOne(id);
  }

  async listMine(userId: string): Promise<ChangeRequestResponseDto[]> {
    const rows = await this.requests.find({
      where: { userId },
      relations: { user: { designation: true }, reviewedBy: true },
      order: { createdAt: 'DESC' },
    });
    return this.toResponses(rows);
  }

  /** The officer withdraws their own PENDING request. */
  async cancel(
    actor: AuthUser,
    id: string,
    ip: string | null,
  ): Promise<ChangeRequestResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const request = await this.lockRequest(manager, id);
      // Someone else's request looks like "not found": nothing about it is revealed.
      if (!request || request.userId !== actor.id)
        throw new NotFoundException(MSG.notFound);
      if (request.status !== ChangeRequestStatus.PENDING) {
        throw new ConflictException(MSG.notPending);
      }
      await manager
        .getRepository(ChangeRequest)
        .update(id, { status: ChangeRequestStatus.CANCELLED });
      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.CHANGE_REQUEST_CANCEL,
          entityType: 'change_request',
          entityId: id,
          before: { status: ChangeRequestStatus.PENDING },
          after: { status: ChangeRequestStatus.CANCELLED },
          ip,
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  // ---------------------------------------------------------------- admin

  async list(
    query: ChangeRequestQueryDto,
  ): Promise<PaginatedResponseDto<ChangeRequestResponseDto>> {
    const [rows, total] = await this.requests.findAndCount({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      relations: { user: { designation: true }, reviewedBy: true },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(await this.toResponses(rows), total, query);
  }

  /**
   * Re-validates and applies the change in ONE transaction. If anything fails (e.g. the email
   * was taken meanwhile), nothing changes and the request stays PENDING.
   */
  async approve(
    actor: AuthUser,
    id: string,
    dto: ApproveChangeRequestDto,
    ip: string | null,
  ): Promise<ChangeRequestResponseDto> {
    await this.dataSource
      .transaction(async (manager) => {
        const request = await this.lockPending(manager, id);
        if (request.userId === actor.id)
          throw new ForbiddenException(MSG.ownRequest);

        const users = manager.getRepository(User);
        const user = await users.findOneOrFail({
          where: { id: request.userId },
          relations: { designation: true },
        });
        const value = request.newValue as RequestedValue;
        const note = dto.note ?? null;
        let before: Record<string, unknown>;
        let summary: { current: string; requested: string };

        if ('loginEmail' in value) {
          const taken = await users.exists({
            where: { loginEmail: value.loginEmail, id: Not(user.id) },
          });
          if (taken) throw new ConflictException(MSG.loginEmailTaken);
          before = { loginEmail: user.loginEmail };
          summary = { current: user.loginEmail, requested: value.loginEmail };
          await users.update(user.id, { loginEmail: value.loginEmail });
          // The login identity changed: every session must log in again.
          await this.tokens.revokeAllForUser(user.id, manager);
          const changedMail = loginEmailChangedMail({
            nameBn: user.nameBn,
            oldEmail: user.loginEmail,
            newEmail: value.loginEmail,
            loginUrl: `${this.frontendUrl}/login`,
          });
          await this.mail.enqueue(
            { to: user.loginEmail, ...changedMail },
            manager,
          );
          await this.mail.enqueue(
            { to: value.loginEmail, ...changedMail },
            manager,
          );
        } else {
          const designation = await manager
            .getRepository(Designation)
            .findOneBy({ id: value.designationId });
          if (!designation?.isActive)
            throw new ConflictException(MSG.designationGone);
          before = { designationId: user.designationId };
          summary = {
            current: user.designation?.nameBn ?? '—',
            requested: designation.nameBn,
          };
          // Only future meetings use the new priority; stored meeting priorities are snapshots.
          await users.update(user.id, { designationId: designation.id });
        }

        await this.decide(
          manager,
          request,
          actor,
          ChangeRequestStatus.APPROVED,
          note,
        );
        await this.notifyRequester(
          manager,
          user,
          request.type,
          true,
          note,
          summary,
        );
        await this.audit.log(
          {
            actorId: actor.id,
            action: AuditAction.CHANGE_REQUEST_APPROVE,
            entityType: 'change_request',
            entityId: id,
            before,
            after: { ...value, userId: user.id },
            ip,
          },
          manager,
        );
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err, LOGIN_EMAIL_INDEX)) {
          throw new ConflictException(MSG.loginEmailTaken);
        }
        throw err;
      });
    return this.findOne(id);
  }

  async reject(
    actor: AuthUser,
    id: string,
    dto: RejectChangeRequestDto,
    ip: string | null,
  ): Promise<ChangeRequestResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const request = await this.lockPending(manager, id);
      const user = await manager.getRepository(User).findOneOrFail({
        where: { id: request.userId },
        relations: { designation: true },
      });
      const display = await this.displayValues(manager, request, user);

      await this.decide(
        manager,
        request,
        actor,
        ChangeRequestStatus.REJECTED,
        dto.note,
      );
      await this.notifyRequester(
        manager,
        user,
        request.type,
        false,
        dto.note,
        display,
      );
      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.CHANGE_REQUEST_REJECT,
          entityType: 'change_request',
          entityId: id,
          after: { note: dto.note },
          ip,
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  // ---------------------------------------------------------------- helpers

  async findOne(id: string): Promise<ChangeRequestResponseDto> {
    const row = await this.requests.findOne({
      where: { id },
      relations: { user: { designation: true }, reviewedBy: true },
    });
    if (!row) throw new NotFoundException(MSG.notFound);
    return (await this.toResponses([row]))[0];
  }

  /** Row lock: two admins clicking at the same time cannot both decide. */
  private lockRequest(
    manager: EntityManager,
    id: string,
  ): Promise<ChangeRequest | null> {
    return manager
      .getRepository(ChangeRequest)
      .createQueryBuilder('r')
      .where('r.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }

  private async lockPending(
    manager: EntityManager,
    id: string,
  ): Promise<ChangeRequest> {
    const request = await this.lockRequest(manager, id);
    if (!request) throw new NotFoundException(MSG.notFound);
    if (request.status !== ChangeRequestStatus.PENDING) {
      throw new ConflictException(MSG.notPending);
    }
    return request;
  }

  private async decide(
    manager: EntityManager,
    request: ChangeRequest,
    actor: AuthUser,
    status: ChangeRequestStatus.APPROVED | ChangeRequestStatus.REJECTED,
    note: string | null,
  ): Promise<void> {
    await manager.getRepository(ChangeRequest).update(request.id, {
      status,
      reviewedById: actor.id,
      reviewedAt: new Date(),
      reviewNote: note,
    });
  }

  /** Bell + mail to every active ADMIN / SUPER_ADMIN except the requester. */
  private async notifyAdmins(
    manager: EntityManager,
    requester: User,
    requestId: string,
    type: ChangeRequestType,
    value: RequestedValue,
  ): Promise<void> {
    const admins = await manager.getRepository(User).find({
      select: { id: true },
      where: {
        role: In([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
        isActive: true,
        id: Not(requester.id),
      },
    });
    const typeLabel = MSG.typeLabel[type];
    const display = await this.displayFor(manager, requester, value);

    await this.notifications.notify(
      admins.map((a) => a.id),
      {
        type: NotificationType.CHANGE_REQUEST_SUBMITTED,
        title: MSG.submittedTitle(typeLabel),
        body: MSG.submittedBody(requester.nameBn, typeLabel),
        link: ADMIN_LINK(requestId),
        email: (admin) =>
          changeRequestSubmittedMail({
            adminNameBn: admin.nameBn,
            requesterNameBn: requester.nameBn,
            typeLabel,
            currentValue: display.current,
            requestedValue: display.requested,
            link: `${this.frontendUrl}${ADMIN_LINK(requestId)}`,
          }),
      },
      ALL_CHANNELS,
      manager,
    );
  }

  /** Bell + mail to the officer about the decision. */
  private async notifyRequester(
    manager: EntityManager,
    user: User,
    type: ChangeRequestType,
    approved: boolean,
    note: string | null,
    display: { current: string; requested: string },
  ): Promise<void> {
    const typeLabel = MSG.typeLabel[type];
    await this.notifications.notify(
      [user.id],
      {
        type: approved
          ? NotificationType.CHANGE_REQUEST_APPROVED
          : NotificationType.CHANGE_REQUEST_REJECTED,
        title: MSG.decidedTitle(typeLabel, approved),
        body: MSG.decidedBody(approved, note),
        link: OFFICER_LINK,
        email: (r) =>
          changeRequestDecisionMail({
            nameBn: r.nameBn,
            approved,
            note,
            typeLabel,
            currentValue: display.current,
            requestedValue: display.requested,
            link: `${this.frontendUrl}${OFFICER_LINK}`,
          }),
      },
      ALL_CHANNELS,
      manager,
    );
  }

  private displayValues(
    manager: EntityManager,
    request: ChangeRequest,
    user: User,
  ): Promise<{ current: string; requested: string }> {
    return this.displayFor(manager, user, request.newValue as RequestedValue);
  }

  /** Human-readable current/requested values for mails (Bangla designation names). */
  private async displayFor(
    manager: EntityManager,
    user: User,
    value: RequestedValue,
  ): Promise<{ current: string; requested: string }> {
    if ('loginEmail' in value) {
      return { current: user.loginEmail, requested: value.loginEmail };
    }
    const designation = await manager
      .getRepository(Designation)
      .findOneBy({ id: value.designationId });
    return {
      current: user.designation?.nameBn ?? '—',
      requested: designation?.nameBn ?? '—',
    };
  }

  private async toResponses(
    rows: ChangeRequest[],
  ): Promise<ChangeRequestResponseDto[]> {
    // One query for every designation that is requested in this page.
    const designationIds = rows
      .map((r) => (r.newValue as { designationId?: string }).designationId)
      .filter((v): v is string => typeof v === 'string');
    const designations = designationIds.length
      ? await this.dataSource
          .getRepository(Designation)
          .findBy({ id: In([...new Set(designationIds)]) })
      : [];
    const byId = new Map(designations.map((d) => [d.id, d]));
    const ref = (d: Designation | null | undefined) =>
      d
        ? { id: d.id, nameBn: d.nameBn, nameEn: d.nameEn, priority: d.priority }
        : null;

    return rows.map((r) => {
      const value = r.newValue as {
        loginEmail?: string;
        designationId?: string;
      };
      const isEmail = r.type === ChangeRequestType.LOGIN_EMAIL;
      const currentValue: ChangeValueDto = isEmail
        ? { loginEmail: r.user.loginEmail }
        : { designation: ref(r.user.designation) };
      const requestedValue: ChangeValueDto = isEmail
        ? { loginEmail: value.loginEmail ?? null }
        : { designation: ref(byId.get(value.designationId ?? '')) };
      return {
        id: r.id,
        type: r.type,
        status: r.status,
        requester: {
          id: r.user.id,
          nameBn: r.user.nameBn,
          nameEn: r.user.nameEn,
          loginEmail: r.user.loginEmail,
        },
        currentValue,
        requestedValue,
        reviewedBy: r.reviewedBy
          ? {
              id: r.reviewedBy.id,
              nameBn: r.reviewedBy.nameBn,
              nameEn: r.reviewedBy.nameEn,
            }
          : null,
        reviewedAt: r.reviewedAt,
        reviewNote: r.reviewNote,
        createdAt: r.createdAt,
      };
    });
  }
}
