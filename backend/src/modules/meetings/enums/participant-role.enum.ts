/**
 * Role of a person in a meeting. The organizer always has a row too (step 8), so
 * meeting_participants alone answers "who are the people of this meeting".
 */
export enum ParticipantRole {
  ORGANIZER = 'ORGANIZER',
  CHAIR = 'CHAIR',
  MEMBER = 'MEMBER',
}
