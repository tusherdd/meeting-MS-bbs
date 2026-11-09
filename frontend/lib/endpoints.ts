/**
 * Typed functions for each backend endpoint used by the frontend, plus React Query keys.
 * Pages call these instead of writing URLs themselves.
 *
 * Key prefixes matter: lib/invalidate.ts refreshes whole groups ("meetings", "conflicts", …).
 */
import { api } from "./api";
import type {
  AppNotification,
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
  verifyEmail: (token: string) => ["profile", "verify-email", token] as const,
  directory: (query: DirectoryQuery) => ["directory", query] as const,
  wings: ["wings", "active"] as const,
};

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
export const reportsApi = {
  me: (period: ReportPeriod, date: string) =>
    api<PersonalReport>("/reports/me", { query: { period, date, limit: 1 } }),
};
