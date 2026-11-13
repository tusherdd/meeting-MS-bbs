/**
 * Runs once before the tests: every dedicated test officer (support/officers.ts) must exist and
 * log in with the default officer password (owner decision 2026-11-09). Then one logged-in
 * browser session per officer is saved, so the tests do not log in over and over (the backend
 * allows only 10 logins per minute per IP).
 *
 *  1. With the admin login from .env.e2e: check each officer through the admin API; create it
 *     (POST /users) or reset it (POST /users/:id/reset-password) if missing / not on the default
 *     password. Both set the default password — no mail or link is needed any more.
 *  2. Log each officer in with the default password and save the session.
 * Passwords are never printed.
 */
import { request } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { components } from "../lib/api-schema";
import {
  BACKEND_URL,
  FRONTEND_ORIGIN,
  OFFICERS,
  STATE_DIR,
  defaultOfficerPassword,
  storageStateOf,
  type OfficerKey,
} from "./support/officers";

type S = components["schemas"];

const API = `${BACKEND_URL}/api/v1`;

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

function loadEnvFile() {
  const file = join(__dirname, "..", ".env.e2e");
  if (existsSync(file)) process.loadEnvFile(file);
}

let adminToken: string | null = null;
/** Logins this setup made (the backend allows 10 per minute per IP; the tests need about 5). */
let loginCount = 0;
const LOGIN_WINDOW_MS = 60_000;
const LOGINS_LEFT_FOR_TESTS = 5;
const LOGIN_LIMIT = 10;

async function admin(): Promise<string> {
  if (adminToken) return adminToken;
  const loginEmail = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!loginEmail || !password) {
    throw new Error(
      "Test officers are missing: set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in frontend/.env.e2e " +
        "(see .env.e2e.example) so the setup can create them.",
    );
  }
  const res = await call<S["LoginResponseDto"]>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ loginEmail, password }),
  }).catch((err: Error) => {
    if (err.message.includes("→ 429")) {
      throw new Error("Login rate limit hit (10 per minute per IP): wait one minute and rerun.");
    }
    return null;
  });
  if (!res) throw new Error("Admin login failed: check E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.");
  if (res.mustChangePassword) {
    throw new Error("The admin must change its first password in the app, then update .env.e2e.");
  }
  if (res.user.role === "OFFICER") throw new Error("E2E_ADMIN_EMAIL is not an ADMIN account.");
  loginCount++;
  adminToken = res.accessToken;
  return adminToken;
}

/**
 * Admin API: make sure the officer exists, is active and still uses the default password
 * (create → default password; reset → default password). No login attempt is wasted.
 */
async function ensureOfficer(key: OfficerKey) {
  const token = await admin();
  const o = OFFICERS[key];
  const users = await call<{ items: S["UserSummaryDto"][] }>(
    `/users?q=${encodeURIComponent(o.loginEmail)}&limit=5`,
    { token },
  );
  const existing = users.items.find((u) => u.loginEmail === o.loginEmail);
  if (existing) {
    if (!existing.isActive) {
      await call(`/users/${existing.id}/status`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive: true }),
      });
    }
    if (!existing.passwordIsDefault || !existing.isActive) {
      await call(`/users/${existing.id}/reset-password`, { method: "POST", token });
    }
    await ensureRole(existing.id, existing.role, o, token);
    return;
  }
  const designations = await call<S["DesignationResponseDto"][]>("/designations?activeOnly=true", {
    token,
  });
  const designation = designations.find((d) => d.nameEn === o.designationEn);
  if (!designation) throw new Error(`Designation "${o.designationEn}" not found.`);
  const created = await call<S["UserDetailDto"]>("/users", {
    method: "POST",
    token,
    body: JSON.stringify({
      loginEmail: o.loginEmail,
      nameBn: o.nameBn,
      nameEn: o.nameEn,
      designationId: designation.id,
    }),
  });
  await ensureRole(created.id, created.role, o, token);
}

/** The test admin must be ADMIN; every other test officer stays OFFICER. */
async function ensureRole(
  userId: string,
  current: S["UserSummaryDto"]["role"],
  o: (typeof OFFICERS)[OfficerKey],
  token: string,
) {
  const wanted = "role" in o && o.role === "ADMIN" ? "ADMIN" : "OFFICER";
  if (current === wanted || current === "SUPER_ADMIN") return;
  await call(`/users/${userId}/role`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ role: wanted }),
  });
}

/**
 * A session saved by an earlier run that still works (GET /auth/me as that officer) is kept, so
 * running the suite again soon does not spend logins (10 per minute per IP).
 */
async function savedSessionWorks(key: OfficerKey): Promise<boolean> {
  if (!existsSync(storageStateOf(key))) return false;
  const context = await request.newContext({
    baseURL: FRONTEND_ORIGIN,
    storageState: storageStateOf(key),
  });
  try {
    const res = await context.get("/api/v1/auth/me");
    if (!res.ok()) return false;
    const me = (await res.json()) as { loginEmail?: string };
    // Reuse only with at least 10 more minutes of access token: the whole run must finish before
    // it expires. Otherwise several contexts made from the same saved state would refresh with
    // the same refresh token, and the backend's reuse detection would (rightly) end all sessions.
    const cookies = (await context.storageState()).cookies;
    const access = cookies.find((c) => c.name === "access_token");
    const longEnough =
      !!access && (access.expires === -1 || access.expires * 1000 > Date.now() + 10 * 60_000);
    return me.loginEmail === OFFICERS[key].loginEmail && longEnough;
  } catch {
    return false;
  } finally {
    await context.dispose();
  }
}

/** Log in through the frontend proxy (like the browser) and save the session cookies. */
async function saveSession(key: OfficerKey): Promise<boolean> {
  if (await savedSessionWorks(key)) return true;
  loginCount++;
  const context = await request.newContext({
    baseURL: FRONTEND_ORIGIN,
    extraHTTPHeaders: { Origin: FRONTEND_ORIGIN },
  });
  try {
    const res = await context.post("/api/v1/auth/login", {
      data: { loginEmail: OFFICERS[key].loginEmail, password: defaultOfficerPassword() },
    });
    if (res.status() === 429) throw new Error("Login rate limit hit: wait one minute and rerun.");
    if (!res.ok()) return false;
    await context.storageState({ path: storageStateOf(key) });
    return true;
  } finally {
    await context.dispose();
  }
}

export default async function globalSetup() {
  loadEnvFile();
  // Public-page tests only (no test officers needed): E2E_SKIP_SETUP=1 npm run test:e2e -- --grep public
  if (process.env.E2E_SKIP_SETUP === "1") return;
  try {
    await call("/health");
  } catch {
    throw new Error(
      `Backend not reachable at ${BACKEND_URL}. Start it: cd backend && npm run start:dev`,
    );
  }
  mkdirSync(STATE_DIR, { recursive: true });

  const keys = Object.keys(OFFICERS) as OfficerKey[];
  // With an admin login: check/create through the admin API first (1 login instead of failures).
  if (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) {
    for (const key of keys) await ensureOfficer(key);
  }
  for (const key of keys) {
    if (!(await saveSession(key))) {
      if (!adminToken) await admin(); // throws the "set E2E_ADMIN_…" message
      throw new Error(`Test officer "${key}" cannot log in with the default officer password.`);
    }
  }
  // A cold start logs every test officer in. Together with the logins inside the tests that is
  // more than the per-IP login limit, so let the one-minute window pass first.
  if (loginCount > LOGIN_LIMIT - LOGINS_LEFT_FOR_TESTS) {
    console.log(`Setup made ${loginCount} logins; waiting 60 s for the login rate limit window.`);
    await new Promise((resolve) => setTimeout(resolve, LOGIN_WINDOW_MS + 2_000));
  }
}
