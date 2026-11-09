/** Stored as varchar, so new roles need no enum migration. */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  OFFICER = 'OFFICER',
}
