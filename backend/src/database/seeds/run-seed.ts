/**
 * Seed steps (SPEC.md §11). Runs inside the EntityManager of ONE transaction supplied by the
 * caller: any error rolls back everything.
 *
 * Idempotent:
 * - designations / wings: upsert by nameEn (created, updated or unchanged);
 * - users: inserted only when loginEmail does not exist; existing users are never touched.
 */
import { EntityManager, In } from 'typeorm';
import {
  hashPassword,
  hashUnusablePassword,
} from '../../common/utils/password';
import { Designation } from '../../modules/designations/entities/designation.entity';
import { UserAdditionalCharge } from '../../modules/users/entities/user-additional-charge.entity';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { Wing } from '../../modules/wings/entities/wing.entity';
import type { OfficerCsvRow } from './officer-csv';
import {
  collectCsvWings,
  lookupKey,
  mapOfficerRows,
  type OfficerSeed,
  type RowNote,
} from './officer-mapper';
import {
  DESIGNATIONS,
  EXTRA_WINGS,
  SUPER_ADMIN_NAME,
  type DesignationSeed,
  type WingSeed,
} from './seed-data';

export interface SeedInput {
  csvRows: readonly OfficerCsvRow[];
  superAdminEmail: string;
  superAdminPassword: string;
  /** Empty string = every new officer gets a random unusable password. */
  officerDefaultPassword: string;
}

export interface UpsertCounts {
  created: number;
  updated: number;
  unchanged: number;
}

export interface SeedSummary {
  designations: UpsertCounts;
  wings: UpsertCounts;
  superAdmin: 'created' | 'already existing';
  officers: {
    created: number;
    alreadyExisting: number;
    skipped: RowNote[];
    warnings: RowNote[];
    additionalChargesCreated: number;
    passwordMode: 'SEED_OFFICER_DEFAULT_PASSWORD' | 'random unusable';
  };
}

/** argon2 runs on libuv's thread pool (4 threads by default). */
const HASH_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

async function upsertDesignations(
  manager: EntityManager,
  seeds: readonly DesignationSeed[],
): Promise<UpsertCounts> {
  const repo = manager.getRepository(Designation);
  const existing = new Map(
    (await repo.find()).map((d) => [lookupKey(d.nameEn), d]),
  );
  const counts: UpsertCounts = { created: 0, updated: 0, unchanged: 0 };

  for (const seed of seeds) {
    const current = existing.get(lookupKey(seed.nameEn));
    if (!current) {
      await repo.insert({ ...seed, isActive: true });
      counts.created++;
    } else if (
      current.nameBn !== seed.nameBn ||
      current.priority !== seed.priority
    ) {
      // SPEC.md §6.1: re-running the seed syncs priority (and the Bangla name) to the table.
      await repo.update(current.id, {
        nameBn: seed.nameBn,
        priority: seed.priority,
      });
      counts.updated++;
    } else {
      counts.unchanged++;
    }
  }
  return counts;
}

async function upsertWings(
  manager: EntityManager,
  seeds: readonly WingSeed[],
): Promise<UpsertCounts> {
  const repo = manager.getRepository(Wing);
  const existing = new Map(
    (await repo.find()).map((w) => [lookupKey(w.nameEn), w]),
  );
  const counts: UpsertCounts = { created: 0, updated: 0, unchanged: 0 };

  for (const seed of seeds) {
    const current = existing.get(lookupKey(seed.nameEn));
    if (!current) {
      await repo.insert({ ...seed, isActive: true });
      counts.created++;
    } else if (current.nameBn !== seed.nameBn) {
      await repo.update(current.id, { nameBn: seed.nameBn });
      counts.updated++;
    } else {
      counts.unchanged++;
    }
  }
  return counts;
}

/** CSV wings first, then the extra cells; one entry per nameEn. */
export function mergeWingSeeds(
  csvWings: readonly WingSeed[],
  extra: readonly WingSeed[],
): WingSeed[] {
  const byKey = new Map<string, WingSeed>();
  for (const wing of [...csvWings, ...extra]) {
    if (!byKey.has(lookupKey(wing.nameEn)))
      byKey.set(lookupKey(wing.nameEn), wing);
  }
  return [...byKey.values()];
}

async function seedSuperAdmin(
  manager: EntityManager,
  email: string,
  password: string,
): Promise<'created' | 'already existing'> {
  const repo = manager.getRepository(User);
  if (await repo.exists({ where: { loginEmail: email } })) {
    return 'already existing'; // never overwrite (e.g. a password already changed)
  }
  await repo.insert({
    loginEmail: email,
    notificationEmail: email,
    passwordHash: await hashPassword(password),
    ...SUPER_ADMIN_NAME,
    role: UserRole.SUPER_ADMIN,
    designationId: null, // system account: no designation = no priority
    wingId: null,
    mustChangePassword: true,
    isActive: true,
  });
  return 'created';
}

async function insertOfficers(
  manager: EntityManager,
  officers: readonly OfficerSeed[],
  defaultPassword: string,
): Promise<number> {
  const hashes = await mapWithConcurrency(officers, HASH_CONCURRENCY, () =>
    defaultPassword ? hashPassword(defaultPassword) : hashUnusablePassword(),
  );

  let chargesCreated = 0;
  for (const [i, officer] of officers.entries()) {
    const result = await manager.getRepository(User).insert({
      loginEmail: officer.loginEmail,
      notificationEmail: officer.loginEmail, // already verified (SPEC.md §11.4)
      nameBn: officer.nameBn,
      nameEn: officer.nameEn,
      designationId: officer.designationId,
      designationRemark: officer.designationRemark,
      wingId: officer.wingId,
      organizationBn: officer.organizationBn,
      organizationEn: officer.organizationEn,
      mobile: officer.mobile,
      mobileAlt: officer.mobileAlt,
      officePhone: officer.officePhone,
      fax: officer.fax,
      role: officer.role,
      passwordHash: hashes[i],
      mustChangePassword: true,
      isActive: true,
    });
    const userId = (result.identifiers[0] as { id: string }).id;

    const { additionalCharges } = officer;
    if (additionalCharges.length > 0) {
      await manager
        .getRepository(UserAdditionalCharge)
        .insert(
          additionalCharges.map((description) => ({ userId, description })),
        );
      chargesCreated += additionalCharges.length;
    }
  }
  return chargesCreated;
}

export async function runSeed(
  manager: EntityManager,
  input: SeedInput,
): Promise<SeedSummary> {
  const superAdminEmail = input.superAdminEmail.trim().toLowerCase();

  // 1. Designations and wings (validates the CSV wings before anything else is written).
  const csvWings = collectCsvWings(input.csvRows);
  const designations = await upsertDesignations(manager, DESIGNATIONS);
  const wings = await upsertWings(
    manager,
    mergeWingSeeds(csvWings, EXTRA_WINGS),
  );

  // 2. Super admin system account.
  const superAdmin = await seedSuperAdmin(
    manager,
    superAdminEmail,
    input.superAdminPassword,
  );

  // 3. Officers: map + validate every row first (throws on unknown designation/wing).
  const [allDesignations, allWings] = await Promise.all([
    manager.getRepository(Designation).find(),
    manager.getRepository(Wing).find(),
  ]);
  const { officers, skipped, warnings } = mapOfficerRows(input.csvRows, {
    designationIdByNameEn: new Map(
      allDesignations.map((d) => [lookupKey(d.nameEn), d.id]),
    ),
    wingIdByNameEn: new Map(allWings.map((w) => [lookupKey(w.nameEn), w.id])),
    reservedEmails: new Set([superAdminEmail]),
  });

  const existingEmails = new Set(
    officers.length === 0
      ? []
      : (
          await manager.getRepository(User).find({
            select: { loginEmail: true },
            where: { loginEmail: In(officers.map((o) => o.loginEmail)) },
          })
        ).map((u) => u.loginEmail),
  );
  const newOfficers = officers.filter((o) => !existingEmails.has(o.loginEmail));
  // Warnings only matter for rows actually written now (existing users are never touched).
  const newRows = new Set(newOfficers.map((o) => o.row));

  const additionalChargesCreated = await insertOfficers(
    manager,
    newOfficers,
    input.officerDefaultPassword,
  );

  return {
    designations,
    wings,
    superAdmin,
    officers: {
      created: newOfficers.length,
      alreadyExisting: officers.length - newOfficers.length,
      skipped,
      warnings: warnings.filter((w) => newRows.has(w.row)),
      additionalChargesCreated,
      passwordMode: input.officerDefaultPassword
        ? 'SEED_OFFICER_DEFAULT_PASSWORD'
        : 'random unusable',
    },
  };
}
