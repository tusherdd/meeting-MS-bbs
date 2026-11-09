import { hashPassword } from '../../common/utils/password';

/**
 * Columns for "this account now uses the default officer password" (SPEC.md §6.2, owner
 * decision 2026-11-09): no forced change, no reminder. Used by the seed, POST /users, the admin
 * reset and the apply-default-password command. Never for the SUPER_ADMIN account.
 */
export async function defaultPasswordColumns(defaultPassword: string): Promise<{
  passwordHash: string;
  passwordIsDefault: true;
  mustChangePassword: false;
}> {
  return {
    passwordHash: await hashPassword(defaultPassword),
    passwordIsDefault: true,
    mustChangePassword: false,
  };
}
