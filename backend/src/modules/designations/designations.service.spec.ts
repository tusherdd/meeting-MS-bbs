import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { User } from '../users/entities/user.entity';
import { DESIGNATION_MESSAGES } from './designations.messages';
import { DesignationsService } from './designations.service';
import { Designation } from './entities/designation.entity';

function designation(overrides: Partial<Designation> = {}): Designation {
  return Object.assign(new Designation(), {
    id: 'd1',
    nameBn: 'প্রোগ্রামার',
    nameEn: 'Programmer',
    priority: 6,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function setup() {
  const nameQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(false),
  };
  const designations = {
    findOneBy: jest.fn(),
    createQueryBuilder: jest.fn(() => nameQuery),
  };
  const users = { countBy: jest.fn().mockResolvedValue(0) };
  const audit = { log: jest.fn() };
  const txRepo = {
    update: jest.fn(),
    delete: jest.fn(),
    save: jest.fn((d: Designation) => Promise.resolve({ ...d, id: 'new' })),
    create: jest.fn((d: Partial<Designation>) => designation(d)),
  };
  const manager = { getRepository: jest.fn(() => txRepo) };
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      Promise.resolve(cb(manager as unknown as EntityManager)),
    ),
  };
  const service = new DesignationsService(
    designations as unknown as Repository<Designation>,
    users as unknown as Repository<User>,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
  );
  return { service, designations, users, audit, txRepo, nameQuery };
}

describe('DesignationsService', () => {
  describe('update', () => {
    it('a priority change is audited with old and new values', async () => {
      const { service, designations, audit, txRepo } = setup();
      designations.findOneBy.mockResolvedValue(designation());

      await service.update('d1', { priority: 5 }, 'admin', '127.0.0.1');

      expect(txRepo.update).toHaveBeenCalledWith('d1', { priority: 5 });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin',
          action: AuditAction.DESIGNATION_PRIORITY_CHANGE,
          entityId: 'd1',
          before: { priority: 6 },
          after: { priority: 5 },
        }),
        expect.anything(),
      );
    });

    it('only touches the designations table (meeting priorities are snapshots)', async () => {
      const { service, designations, txRepo } = setup();
      designations.findOneBy.mockResolvedValue(designation());
      await service.update('d1', { priority: 1 }, 'admin', null);
      // The transaction only ever updates this one designation row.
      expect(txRepo.update).toHaveBeenCalledTimes(1);
      expect(txRepo.update).toHaveBeenCalledWith('d1', { priority: 1 });
    });

    it('a rename without priority change uses DESIGNATION_UPDATE', async () => {
      const { service, designations, audit } = setup();
      designations.findOneBy.mockResolvedValue(designation());
      await service.update(
        'd1',
        { nameBn: 'প্রোগ্রামার (নতুন)' },
        'admin',
        null,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.DESIGNATION_UPDATE }),
        expect.anything(),
      );
    });

    it('no real change → nothing written, nothing audited', async () => {
      const { service, designations, audit, txRepo } = setup();
      designations.findOneBy.mockResolvedValue(designation());
      await service.update(
        'd1',
        { priority: 6, nameEn: 'Programmer' },
        'admin',
        null,
      );
      expect(txRepo.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('a duplicate English name (case-insensitive) → 409', async () => {
      const { service, designations, nameQuery } = setup();
      designations.findOneBy.mockResolvedValue(designation());
      nameQuery.getExists.mockResolvedValue(true);
      await expect(
        service.update('d1', { nameEn: 'DIRECTOR' }, 'admin', null),
      ).rejects.toThrow(
        new ConflictException(DESIGNATION_MESSAGES.duplicateName),
      );
    });

    it('unknown id → 404', async () => {
      const { service, designations } = setup();
      designations.findOneBy.mockResolvedValue(null);
      await expect(
        service.update('x', { priority: 1 }, 'admin', null),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('refuses to delete a designation that users have (409, Bangla, with count)', async () => {
      const { service, designations, users, txRepo } = setup();
      designations.findOneBy.mockResolvedValue(designation());
      users.countBy.mockResolvedValue(41);

      await expect(service.remove('d1', 'admin', null)).rejects.toThrow(
        new ConflictException(DESIGNATION_MESSAGES.inUse(41)),
      );
      expect(txRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes an unused designation and audits it', async () => {
      const { service, designations, audit, txRepo } = setup();
      designations.findOneBy.mockResolvedValue(designation());

      await service.remove('d1', 'admin', null);
      expect(txRepo.delete).toHaveBeenCalledWith('d1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DESIGNATION_DELETE,
          before: { nameBn: 'প্রোগ্রামার', nameEn: 'Programmer', priority: 6 },
        }),
        expect.anything(),
      );
    });
  });

  describe('create', () => {
    it('rejects a duplicate English name before writing', async () => {
      const { service, nameQuery, txRepo } = setup();
      nameQuery.getExists.mockResolvedValue(true);
      await expect(
        service.create(
          { nameBn: 'ক', nameEn: 'programmer', priority: 6 },
          'admin',
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it('creates and audits', async () => {
      const { service, audit } = setup();
      const result = await service.create(
        { nameBn: 'নতুন', nameEn: 'New Post', priority: 8 },
        'admin',
        null,
      );
      expect(result).toMatchObject({
        nameEn: 'New Post',
        priority: 8,
        userCount: 0,
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.DESIGNATION_CREATE }),
        expect.anything(),
      );
    });
  });
});
