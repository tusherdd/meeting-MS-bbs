/** Why a password token was issued (step 7). Stored as varchar. */
export enum PasswordTokenPurpose {
  /** "Forgot password" (30 min) or reset by an admin (72 h). */
  RESET = 'RESET',
  /** New account created by an admin: the officer chooses the first password (72 h). */
  SET_INITIAL = 'SET_INITIAL',
}
