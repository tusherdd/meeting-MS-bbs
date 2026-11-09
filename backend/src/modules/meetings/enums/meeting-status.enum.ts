/** Only SCHEDULED meetings take part in conflict checks (SPEC.md §6.3). */
export enum MeetingStatus {
  SCHEDULED = 'SCHEDULED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}
