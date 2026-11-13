/**
 * Typed functions for each backend endpoint used by the frontend, plus React Query keys.
 * Pages call these instead of writing URLs themselves.
 *
 * Key prefixes matter: lib/invalidate.ts refreshes whole groups ("meetings", "conflicts", …).
 */
import { api, apiDownload } from "./api";
import type {
  AdminStats,
  AppNotification,
  AuditAction,
  AuditLogItem,
  ChangeRequest,
  ChangeRequestStatus,
  ChangeRequestType,
  CreateChangeRequestInput,
  CreateDesignationInput,
  CreateUserInput,
  CreateWingInput,
  Designation,
  EmailOutboxItem,
  EmailStatus,
  Profile,
  UpdateDesignationInput,
  UpdateProfileInput,
  UpdateUserInput,
  UpdateWingInput,
  UserDetail,
  UserMessage,
  UserSummary,
  ChangePasswordInput,
  ChangePasswordResponse,
  CheckConflictsInput,
  CheckConflictsResponse,
  ConflictListItem,
  ConflictStatus,
  CreateMeetingInput,
  DirectoryEntry,
  ForgotPasswordInput,
  LoginInput,
  LoginResponse,
  Me,
  MeetingDetail,
  MeetingStatus,
  MeetingSummary,
  MessageResponse,
  OfficeReport,
  Paginated,
  PersonalReport,
  ReportPeriod,
  ResetPasswordInput,
  UnreadCount,
  UpdateMeetingInput,
  Wing,
} from "./types";

export interface MeetingListQuery {
  from?: string;
  to?: string;
  status?: MeetingStatus;
  role?: "organizer" | "participant";
  scope?: "mine" | "all";
  page?: number;
  limit?: number;
}

export interface DirectoryQuery {
  q?: string;
  wingId?: string;
  page?: number;
  limit?: number;
}

export const queryKeys = {
  me: ["auth", "me"] as const,
  meetingsToday: ["meetings", "today"] as const,
  meetingsRange: (from: string, to: string) => ["meetings", "range", from, to] as const,
  meetingsList: (query: MeetingListQuery) => ["meetings", "list", query] as const,
  meetingsCalendar: (from: string, to: string) => ["meetings", "calendar", from, to] as const,
  meeting: (id: string) => ["meetings", "detail", id] as const,
  myConflicts: ["conflicts", "mine", "PENDING"] as const,
  myConflictsByStatus: (status: ConflictStatus) => ["conflicts", "mine", status] as const,
  allConflicts: (status: ConflictStatus | undefined, page: number) =>
    ["conflicts", "all", status ?? "ALL", page] as const,
  unreadCount: ["notifications", "unread-count"] as const,
  latestNotifications: ["notifications", "latest"] as const,
  notificationsList: (unread: boolean, page: number) =>
    ["notifications", "list", unread, page] as const,
  myReport: (period: ReportPeriod, date: string) => ["reports", "me", period, date] as const,
  myReportPage: (period: ReportPeriod, date: string, page: number) =>
    ["reports", "me", period, date, "page", page] as const,
  officeReport: (period: ReportPeriod, date: string, filter: OfficeFilter, page: number) =>
    ["reports", "office", period, date, filter, page] as const,
  verifyEmail: (token: string) => ["profile", "verify-email", token] as const,
  directory: (query: DirectoryQuery) => ["directory", query] as const,
  wings: ["wings", "active"] as const,
  profile: ["profile", "me"] as const,
  myChangeRequests: ["profile", "change-requests"] as const,
  designations: (activeOnly: boolean) => ["designations", activeOnly ? "active" : "all"] as const,
  allWings: ["wings", "all"] as const,
  users: (query: UserListQuery) => ["users", "list", query] as const,
  user: (id: string) => ["users", "detail", id] as const,
  changeRequests: (status: ChangeRequestStatus, page: number) =>
    ["change-requests", status, page] as const,
  adminStats: ["admin", "stats"] as const,
  emailOutbox: (status: EmailStatus | undefined, page: number) =>
    ["admin", "email-outbox", status ?? "ALL", page] as const,
  auditLogs: (query: AuditLogQuery) => ["admin", "audit-logs", query] as const,
};

export interface UserListQuery {
  q?: string;
  wingId?: string;
  designationId?: string;
  role?: UserSummary["role"];
  isActive?: boolean;
  passwordIsDefault?: boolean;
  page?: number;
  limit?: number;
}

export interface AuditLogQuery {
  action?: AuditAction;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
}

// Auth -------------------------------------------------------------------------------------------
export const authApi = {
  me: () => api<Me>("/auth/me"),
  login: (input: LoginInput) =>
    api<LoginResponse>("/auth/login", { method: "POST", body: input, noRefresh: true }),
  logout: () => api<MessageResponse>("/auth/logout", { method: "POST" }),
  changePassword: (input: ChangePasswordInput) =>
    api<ChangePasswordResponse>("/auth/change-password", { method: "POST", body: input }),
  forgotPassword: (input: ForgotPasswordInput) =>
    api<MessageResponse>("/auth/forgot-password", {
      method: "POST",
      body: input,
      noRefresh: true,
    }),
  resetPassword: (input: ResetPasswordInput) =>
    api<MessageResponse>("/auth/reset-password", {
      method: "POST",
      body: input,
      noRefresh: true,
    }),
  verifyNotificationEmail: (token: string) =>
    api<MessageResponse>("/profile/notification-email/verify", {
      query: { token },
      noRefresh: true,
    }),
};

// Meetings and conflicts -------------------------------------------------------------------------
const meetingPath = (id: string) => `/meetings/${encodeURIComponent(id)}`;

/** Backend page size maximum. */
export const MAX_PAGE_SIZE = 100;

export const meetingsApi = {
  today: () => api<MeetingSummary[]>("/meetings/today"),
  list: (query: MeetingListQuery) =>
    api<Paginated<MeetingSummary>>("/meetings", { query: { ...query } }),
  /** Every meeting in a range (all pages; used by the calendar). */
  async listAll(from: string, to: string): Promise<MeetingSummary[]> {
    const items: MeetingSummary[] = [];
    for (let page = 1; ; page++) {
      const res = await meetingsApi.list({ from, to, page, limit: MAX_PAGE_SIZE });
      items.push(...res.items);
      if (page >= res.totalPages) return items;
    }
  },
  get: (id: string) => api<MeetingDetail>(meetingPath(id)),
  create: (input: CreateMeetingInput) =>
    api<MeetingDetail>("/meetings", { method: "POST", body: input }),
  update: (id: string, input: UpdateMeetingInput) =>
    api<MeetingDetail>(meetingPath(id), { method: "PATCH", body: input }),
  cancel: (id: string, reason: string) =>
    api<MeetingDetail>(`${meetingPath(id)}/cancel`, { method: "POST", body: { reason } }),
  complete: (id: string, notes: string | null) =>
    api<MeetingDetail>(`${meetingPath(id)}/complete`, { method: "POST", body: { notes } }),
  remove: (id: string) => api<void>(meetingPath(id), { method: "DELETE" }),
  checkConflicts: (input: CheckConflictsInput, signal?: AbortSignal) =>
    api<CheckConflictsResponse>("/meetings/check-conflicts", {
      method: "POST",
      body: input,
      signal,
    }),
  myConflicts: (status: ConflictStatus = "PENDING") =>
    api<ConflictListItem[]>("/conflicts/mine", { query: { status } }),
  allConflicts: (status: ConflictStatus | undefined, page: number) =>
    api<Paginated<ConflictListItem>>("/conflicts", { query: { status, page, limit: 20 } }),
};

// People -----------------------------------------------------------------------------------------
export const peopleApi = {
  directory: (query: DirectoryQuery, signal?: AbortSignal) =>
    api<Paginated<DirectoryEntry>>("/users/directory", { query: { ...query }, signal }),
  /** Every active officer of a wing (all pages). */
  async wingMembers(wingId: string): Promise<DirectoryEntry[]> {
    const items: DirectoryEntry[] = [];
    for (let page = 1; ; page++) {
      const res = await peopleApi.directory({ wingId, page, limit: MAX_PAGE_SIZE });
      items.push(...res.items);
      if (page >= res.totalPages) return items;
    }
  },
  wings: () => api<Wing[]>("/wings", { query: { activeOnly: true } }),
};

// Notifications ----------------------------------------------------------------------------------
export const notificationsApi = {
  unreadCount: () => api<UnreadCount>("/notifications/unread-count"),
  latest: (limit = 10) => api<Paginated<AppNotification>>("/notifications", { query: { limit } }),
  list: (unread: boolean, page: number) =>
    api<Paginated<AppNotification>>("/notifications", {
      query: { page, limit: 20, unread: unread || undefined },
    }),
  markRead: (id: string) =>
    api<AppNotification>(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
  markAllRead: () => api<unknown>("/notifications/read-all", { method: "PATCH" }),
};

// Reports ----------------------------------------------------------------------------------------
export interface OfficeFilter {
  wingId?: string;
  designationId?: string;
}

export const REPORT_PAGE_SIZE = 20;

export const reportsApi = {
  me: (period: ReportPeriod, date: string) =>
    api<PersonalReport>("/reports/me", { query: { period, date, limit: 1 } }),
  mePage: (period: ReportPeriod, date: string, page: number) =>
    api<PersonalReport>("/reports/me", {
      query: { period, date, page, limit: REPORT_PAGE_SIZE },
    }),
  mePdf: (period: ReportPeriod, date: string) =>
    apiDownload("/reports/me/pdf", {
      query: { period, date },
      fallbackName: `meeting-report-${date}.pdf`,
    }),
  office: (period: ReportPeriod, date: string, filter: OfficeFilter, page: number) =>
    api<OfficeReport>("/reports/office", {
      query: { period, date, ...filter, page, limit: REPORT_PAGE_SIZE },
    }),
  officePdf: (period: ReportPeriod, date: string, filter: OfficeFilter) =>
    apiDownload("/reports/office/pdf", {
      query: { period, date, ...filter },
      fallbackName: `office-meeting-report-${date}.pdf`,
    }),
};

// Profile (my own) -------------------------------------------------------------------------------
export const profileApi = {
  get: () => api<Profile>("/profile"),
  update: (input: UpdateProfileInput) => api<Profile>("/profile", { method: "PATCH", body: input }),
  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<Profile>("/profile/photo", { method: "POST", body: form });
  },
  deletePhoto: () => api<MessageResponse>("/profile/photo", { method: "DELETE" }),
  requestNotificationEmail: (email: string) =>
    api<MessageResponse>("/profile/notification-email", { method: "POST", body: { email } }),
  changeRequests: () => api<ChangeRequest[]>("/profile/change-requests"),
  createChangeRequest: (input: CreateChangeRequestInput) =>
    api<ChangeRequest>("/profile/change-requests", { method: "POST", body: input }),
  cancelChangeRequest: (id: string) =>
    api<ChangeRequest>(`/profile/change-requests/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

// Designations and wings -------------------------------------------------------------------------
const id = (value: string) => encodeURIComponent(value);

export const designationsApi = {
  list: (activeOnly: boolean) =>
    api<Designation[]>("/designations", { query: { activeOnly: activeOnly || undefined } }),
  create: (input: CreateDesignationInput) =>
    api<Designation>("/designations", { method: "POST", body: input }),
  update: (designationId: string, input: UpdateDesignationInput) =>
    api<Designation>(`/designations/${id(designationId)}`, { method: "PATCH", body: input }),
  remove: (designationId: string) =>
    api<void>(`/designations/${id(designationId)}`, { method: "DELETE" }),
};

export const wingsApi = {
  list: () => api<Wing[]>("/wings"),
  create: (input: CreateWingInput) => api<Wing>("/wings", { method: "POST", body: input }),
  update: (wingId: string, input: UpdateWingInput) =>
    api<Wing>(`/wings/${id(wingId)}`, { method: "PATCH", body: input }),
  remove: (wingId: string) => api<void>(`/wings/${id(wingId)}`, { method: "DELETE" }),
};

// Users (admin) ----------------------------------------------------------------------------------
export const usersApi = {
  list: (query: UserListQuery) =>
    api<Paginated<UserSummary>>("/users", { query: { limit: 20, ...query } }),
  get: (userId: string) => api<UserDetail>(`/users/${id(userId)}`),
  create: (input: CreateUserInput) => api<UserDetail>("/users", { method: "POST", body: input }),
  update: (userId: string, input: UpdateUserInput) =>
    api<UserDetail>(`/users/${id(userId)}`, { method: "PATCH", body: input }),
  setActive: (userId: string, isActive: boolean) =>
    api<UserDetail>(`/users/${id(userId)}/status`, { method: "PATCH", body: { isActive } }),
  setRole: (userId: string, role: "ADMIN" | "OFFICER") =>
    api<UserDetail>(`/users/${id(userId)}/role`, { method: "PATCH", body: { role } }),
  resetPassword: (userId: string) =>
    api<UserMessage>(`/users/${id(userId)}/reset-password`, { method: "POST" }),
};

// Change requests (admin) ------------------------------------------------------------------------
export const changeRequestsApi = {
  list: (status: ChangeRequestStatus, page: number, type?: ChangeRequestType) =>
    api<Paginated<ChangeRequest>>("/change-requests", {
      query: { status, type, page, limit: 20 },
    }),
  approve: (requestId: string, note?: string) =>
    api<ChangeRequest>(`/change-requests/${id(requestId)}/approve`, {
      method: "POST",
      body: note ? { note } : {},
    }),
  reject: (requestId: string, note: string) =>
    api<ChangeRequest>(`/change-requests/${id(requestId)}/reject`, {
      method: "POST",
      body: { note },
    }),
};

// Admin ------------------------------------------------------------------------------------------
export const adminApi = {
  stats: () => api<AdminStats>("/admin/stats"),
  emailOutbox: (status: EmailStatus | undefined, page: number) =>
    api<Paginated<EmailOutboxItem>>("/admin/email-outbox", { query: { status, page, limit: 20 } }),
  retryEmail: (mailId: string) =>
    api<EmailOutboxItem>(`/admin/email-outbox/${id(mailId)}/retry`, { method: "POST" }),
  auditLogs: (query: AuditLogQuery) =>
    api<Paginated<AuditLogItem>>("/audit-logs", { query: { limit: 20, ...query } }),
};
