/**
 * Runs once before the tests. Makes sure every dedicated test officer (support/officers.ts)
 * exists and that we know its password, using only the backend API, then saves one logged-in
 * browser session per officer (so the tests do not have to log in again and again — the
 * backend allows only 10 logins per minute per IP).
 *
 *  1. Officers with a saved password are kept (no admin needed).
 *  2. The others: log in as the admin from .env.e2e, create them (or reset their password),
 *     read the one-time links from the MAIL_DRY_RUN previews (backend/tmp/mail-preview/<id>.html,
 *     written by the mail worker within about a minute) and set fresh random passwords.
 *  3. Log every officer in through the frontend (same origin as the browser) and store the
 *     cookies in e2e/.state/session-<key>.json.
 * Passwords and tokens are never printed.
 */
import { request } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { components } from "../lib/api-schema";
import {
  BACKEND_URL,
  FRONTEND_ORIGIN,
  OFFICERS,
  PASSWORDS_FILE,
  STATE_DIR,
  readPasswords,
  storageStateOf,
  type OfficerKey,
} from "./support/officers";

type S = components["schemas"];

const API = `${BACKEND_URL}/api/v1`;
const MAIL_PREVIEW_DIR = join(__dirname, "..", "..", "backend", "tmp", "mail-preview");
const MAIL_WAIT_MS = 150_000;

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = body?.message ?? res.statusText;
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${message}`);
  }
  return body as T;
}

async function tryLogin(loginEmail: string, password: string) {
  try {
    return await call<S["LoginResponseDto"]>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginEmail, password }),
    });
  } catch {
    return null;
  }
}

function newPassword(): string {
  // Letters + digits, ≥ 8 characters (backend rule); random every time.
  return `E2e${randomBytes(12)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "x")}7`;
}

function loadEnvFile() {
  const file = join(__dirname, "..", ".env.e2e");
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Wait until the dry-run previews of the password-link mails to `emails` exist; return tokens. */
async function waitForLinkTokens(
  adminToken: string,
  emails: string[],
  since: number,
): Promise<Map<string, { token: string; file: string }>> {
  const found = new Map<string, { token: string; file: string }>();
  const deadline = Date.now() + MAIL_WAIT_MS;
  while (Date.now() < deadline && found.size < emails.length) {
    const page = await call<{ items: S["EmailOutboxItemDto"][] }>("/admin/email-outbox?limit=50", {
      token: adminToken,
    });
    for (const mail of page.items) {
      const to = mail.to.toLowerCase();
      if (!emails.includes(to) || found.has(to)) continue;
      if (new Date(mail.createdAt).getTime() < since - 2_000 || mail.status !== "SENT") continue;
      const file = join(MAIL_PREVIEW_DIR, `${mail.id}.html`);
      if (!existsSync(file)) continue;
      const match = readFileSync(file, "utf8").match(
        /(?:set|reset)-password\?token=([A-Za-z0-9_%-]+)/,
      );
      if (match) found.set(to, { token: decodeURIComponent(match[1]), file });
    }
    if (found.size < emails.length) await new Promise((r) => setTimeout(r, 3_000));
  }
  if (found.size < emails.length) {
    throw new Error(
      "The password link mails did not arrive. Check that the backend runs with MAIL_DRY_RUN=true, " +
        "NODE_ENV=development and SCHEDULER_ENABLED=true (the mail worker runs every minute).",
    );
  }
  return found;
}

/** Create (or reset) the given officers through the admin API and set new random passwords. */
async function provision(keys: OfficerKey[], passwords: Partial<Record<OfficerKey, string>>) {
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in frontend/.env.e2e (see .env.e2e.example).",
    );
  }
  const admin = await tryLogin(adminEmail, adminPassword);
  if (!admin) throw new Error("Admin login failed: check E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.");
  if (admin.mustChangePassword) {
    throw new Error("The admin must change its first password in the app, then update .env.e2e.");
  }
  if (admin.user.role === "OFFICER") throw new Error("E2E_ADMIN_EMAIL is not an ADMIN account.");
  const token = admin.accessToken;

  const designations = await call<S["DesignationResponseDto"][]>("/designations?activeOnly=true", {
    token,
  });
  const since = Date.now();

  for (const key of keys) {
    const o = OFFICERS[key];
    const designation = designations.find((d) => d.nameEn === o.designationEn);
    if (!designation) throw new Error(`Designation "${o.designationEn}" not found.`);
    const users = await call<{ items: S["UserSummaryDto"][] }>(
      `/users?q=${encodeURIComponent(o.loginEmail)}&limit=5`,
      { token },
    );
    const existing = users.items.find((u) => u.loginEmail === o.loginEmail);
    if (!existing) {
      await call("/users", {
        method: "POST",
        token,
        body: JSON.stringify({
          loginEmail: o.loginEmail,
          nameBn: o.nameBn,
          nameEn: o.nameEn,
          designationId: designation.id,
        }),
      });
    } else {
      if (!existing.isActive) {
        await call(`/users/${existing.id}/status`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ isActive: true }),
        });
      }
      await call(`/users/${existing.id}/reset-password`, { method: "POST", token });
    }
  }

  const links = await waitForLinkTokens(
    token,
    keys.map((k) => OFFICERS[k].loginEmail),
    since,
  );
  for (const key of keys) {
    const link = links.get(OFFICERS[key].loginEmail)!;
    const password = newPassword();
    await call("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: link.token, newPassword: password }),
    });
    rmSync(link.file, { force: true }); // used up; do not leave it lying around
    passwords[key] = password;
  }
  writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords), { mode: 0o600 });
}

/** Log in through the frontend proxy (like the browser) and save the session cookies. */
async function saveSession(key: OfficerKey, password: string): Promise<boolean> {
  const context = await request.newContext({
    baseURL: FRONTEND_ORIGIN,
    extraHTTPHeaders: { Origin: FRONTEND_ORIGIN },
  });
  try {
    const res = await context.post("/api/v1/auth/login", {
      data: { loginEmail: OFFICERS[key].loginEmail, password },
    });
    if (res.status() === 429) throw new Error("Login rate limit hit: wait one minute and rerun.");
    if (!res.ok()) return false;
    const body = (await res.json()) as S["LoginResponseDto"];
    if (body.mustChangePassword) return false;
    await context.storageState({ path: storageStateOf(key) });
    return true;
  } finally {
    await context.dispose();
  }
}

export default async function globalSetup() {
  loadEnvFile();
  try {
    await call("/health");
  } catch {
    throw new Error(
      `Backend not reachable at ${BACKEND_URL}. Start it: cd backend && npm run start:dev`,
    );
  }
  mkdirSync(STATE_DIR, { recursive: true });

  const keys = Object.keys(OFFICERS) as OfficerKey[];
  const passwords = readPasswords();
  const missing = keys.filter((k) => !passwords[k]);
  if (missing.length > 0) await provision(missing, passwords);

  for (const key of keys) {
    if (await saveSession(key, passwords[key]!)) continue;
    // The saved password no longer works (e.g. reset by someone): provision it again, once.
    await provision([key], passwords);
    if (!(await saveSession(key, passwords[key]!))) {
      throw new Error(`Test officer "${key}" cannot log in.`);
    }
  }
}
