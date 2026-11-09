import { expect, type Browser, type Page } from "@playwright/test";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { components } from "../../lib/api-schema";
import {
  FRONTEND_ORIGIN,
  OFFICERS,
  TEST_MEETING_PREFIX,
  credentialsOf,
  storageStateOf,
  type OfficerKey,
} from "./officers";

type S = components["schemas"];
export type MeetingSummary = S["MeetingSummaryDto"];
export type MeetingDetail = S["MeetingDetailDto"];

/** Exact text the backend returns for every failed login (auth.messages.ts). */
export const INVALID_LOGIN_MESSAGE =
  'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। পাসওয়ার্ড মনে না থাকলে "পাসওয়ার্ড ভুলে গেছেন?" ব্যবহার করে ইমেইলে রিসেট লিংক নিন।';

export async function fillLogin(page: Page, loginEmail: string, password: string) {
  await page.getByLabel("লগইন ইমেইল").fill(loginEmail);
  await page.getByLabel("পাসওয়ার্ড", { exact: true }).fill(password);
  await page.getByRole("button", { name: "লগইন করুন" }).click();
}

/** Real login through the login page (only where the login itself is tested). */
export async function loginThroughForm(page: Page, key: OfficerKey) {
  const { loginEmail, password } = credentialsOf(key);
  await page.goto("/login");
  await fillLogin(page, loginEmail, password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "ড্যাশবোর্ড", level: 1 })).toBeVisible();
}

/** A new browser context that is already logged in as `key` (session saved by global-setup). */
export async function pageAs(browser: Browser, key: OfficerKey): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStateOf(key) });
  return context.newPage();
}

/**
 * Backend call with the page's cookies (through the Next.js proxy). Unsafe methods carry the
 * Origin header exactly like a real browser does (CSRF check).
 */
export async function apiAsPage<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: { Origin: FRONTEND_ORIGIN },
  });
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// Time helpers (Asia/Dhaka) --------------------------------------------------------------------
export const DHAKA = "Asia/Dhaka";

export function dhakaDate(offsetDays = 0, now = new Date()): string {
  return formatInTimeZone(new Date(now.getTime() + offsetDays * 86_400_000), DHAKA, "yyyy-MM-dd");
}

export function dhakaIso(date: string, time: string): string {
  return fromZonedTime(`${date}T${time}:00`, DHAKA).toISOString();
}

export function uniqueTitle(label: string): string {
  return `${TEST_MEETING_PREFIX} ${label} ${Date.now().toString(36)}`;
}

/** Create a meeting through the API as the page's officer. */
export async function createMeetingAs(
  page: Page,
  input: { title: string; startAt: string; endAt: string; participantIds?: string[] },
): Promise<MeetingDetail> {
  return apiAsPage<MeetingDetail>(page, "POST", "/meetings", { room: "কক্ষ ৫০১", ...input });
}

export async function cancelMeetingAs(page: Page, id: string) {
  await apiAsPage(page, "POST", `/meetings/${id}/cancel`, { reason: "ই২ই পরীক্ষা শেষ" }).catch(
    () => undefined, // already cancelled
  );
}

/** Cancel this officer's scheduled test meetings left over from an earlier (failed) run. */
export async function cancelLeftovers(page: Page) {
  const res = await apiAsPage<{ items: MeetingSummary[] }>(
    page,
    "GET",
    "/meetings?role=organizer&status=SCHEDULED&limit=100",
  );
  for (const m of res.items) {
    if (m.title.startsWith(TEST_MEETING_PREFIX)) await cancelMeetingAs(page, m.id);
  }
}

export async function userIdOf(page: Page): Promise<string> {
  return (await apiAsPage<{ id: string }>(page, "GET", "/auth/me")).id;
}

export function nameOf(key: OfficerKey): string {
  return OFFICERS[key].nameBn;
}

/** In the meeting form: search the directory and add one person. */
export async function addParticipant(page: Page, key: OfficerKey) {
  await page.getByLabel("নাম দিয়ে খুঁজুন").fill(nameOf(key));
  const button = page.getByRole("button", { name: `${nameOf(key)}: যোগ করুন` });
  await button.click();
  await expect(page.getByTestId("selected-people")).toContainText(nameOf(key));
}

export async function fillMeetingTime(page: Page, date: string, start: string, end: string) {
  await page.getByLabel("তারিখ", { exact: true }).fill(date);
  await page.getByLabel("শুরুর সময়").fill(start);
  await page.getByLabel("শেষের সময়").fill(end);
}
