/**
 * Friendly names for the backend DTOs. The source of truth is lib/api-schema.ts, generated from
 * docs/openapi.json (`npm run gen:api`) — never edit that file by hand.
 */
import type { components } from "./api-schema";

type S = components["schemas"];

// Errors -----------------------------------------------------------------------------------------
/** Every backend error: `{ statusCode, message, error, requestId }` (+ extra fields like `blocking`). */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  requestId?: string;
  [extra: string]: unknown;
}
export type MeetingConflictError = S["MeetingConflictErrorDto"];

// Auth -------------------------------------------------------------------------------------------
export type Me = S["MeResponseDto"];
export type Role = Me["role"];
export type LoginInput = S["LoginDto"];
export type LoginResponse = S["LoginResponseDto"];
export type ChangePasswordInput = S["ChangePasswordDto"];
export type ChangePasswordResponse = S["ChangePasswordResponseDto"];
export type ForgotPasswordInput = S["ForgotPasswordDto"];
export type ResetPasswordInput = S["ResetPasswordDto"];
export type MessageResponse = S["MessageResponseDto"];
export type AccessTokenResponse = S["AccessTokenResponseDto"];

// Users, designations, wings, profile ------------------------------------------------------------
export type DirectoryEntry = S["DirectoryEntryDto"];
export type UserSummary = S["UserSummaryDto"];
export type UserDetail = S["UserDetailDto"];
export type CreateUserInput = S["CreateUserDto"];
export type UpdateUserInput = S["UpdateUserDto"];
export type Designation = S["DesignationResponseDto"];
export type Wing = S["WingResponseDto"];
export type WingRef = S["WingRefDto"];
export type Profile = S["ProfileResponseDto"];
export type UpdateProfileInput = S["UpdateProfileDto"];
export type ChangeRequest = S["ChangeRequestResponseDto"];
export type CreateChangeRequestInput = S["CreateChangeRequestDto"];
export type ChangeRequestStatus = ChangeRequest["status"];
export type ChangeRequestType = ChangeRequest["type"];
/** `isActive` has a server default (true), so it is optional here (the generator marks it required). */
type OptionalActive<T> = Omit<T, "isActive"> & { isActive?: boolean };
export type CreateDesignationInput = OptionalActive<S["CreateDesignationDto"]>;
export type UpdateDesignationInput = Partial<S["UpdateDesignationDto"]>;
export type CreateWingInput = OptionalActive<S["CreateWingDto"]>;
export type UpdateWingInput = Partial<S["UpdateWingDto"]>;
export type UserMessage = S["UserMessageResponseDto"];

// Meetings and conflicts -------------------------------------------------------------------------
export type MeetingSummary = S["MeetingSummaryDto"];
export type MeetingDetail = S["MeetingDetailDto"];
export type MeetingStatus = MeetingSummary["status"];
export type MeetingRole = NonNullable<MeetingSummary["myRole"]>;
export type Person = S["PersonDto"];
export type Participant = S["ParticipantDto"];
export type CreateMeetingInput = S["CreateMeetingDto"];
export type UpdateMeetingInput = S["UpdateMeetingDto"];
export type CheckConflictsInput = S["CheckConflictsDto"];
export type CheckConflictsResponse = S["CheckConflictsResponseDto"];
export type Clash = S["ClashDto"];
export type CancelMeetingInput = S["CancelMeetingDto"];
export type CompleteMeetingInput = S["CompleteMeetingDto"];
export type MeetingConflict = S["MeetingConflictDto"];
export type ConflictListItem = S["ConflictListItemDto"];
export type ConflictMeetingRef = S["ConflictMeetingRefDto"];
export type ConflictStatus = ConflictListItem["status"];

// Notifications ----------------------------------------------------------------------------------
export type AppNotification = S["NotificationResponseDto"];
export type UnreadCount = S["UnreadCountDto"];

// Reports and admin ------------------------------------------------------------------------------
export type ReportPeriod = S["PeriodDto"]["period"];
export type PersonalReport = S["PersonalReportDto"];
export type PersonalSummary = S["PersonalSummaryDto"];
export type OfficeReport = S["OfficeReportDto"];
export type AdminStats = S["AdminStatsDto"];
export type AuditLogItem = S["AuditLogItemDto"];
export type EmailOutboxItem = S["EmailOutboxItemDto"];
export type EmailStatus = EmailOutboxItem["status"];
export type AuditAction = AuditLogItem["action"];

// Pagination -------------------------------------------------------------------------------------
export type PageMeta = S["PaginatedResponseDto"];
export type Paginated<T> = PageMeta & { items: T[] };
export type PeriodDto = S["PeriodDto"];
export type ReportMeeting = S["ReportMeetingDto"];
export type DayCount = S["DayCountDto"];
export type StatusCounts = S["StatusCountsDto"];
export type OfficeSummary = S["OfficeSummaryDto"];
export type GroupCount = S["GroupCountDto"];
export type DesignationCount = S["DesignationCountDto"];
export type OrganizerCount = S["OrganizerCountDto"];
