export enum ChangeRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  /** Withdrawn by the officer before a decision (step 6). */
  CANCELLED = 'CANCELLED',
}
