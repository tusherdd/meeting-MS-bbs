/**
 * Dedicated test officers. Never real officers' accounts: global-setup.ts creates them through
 * the admin API, so they use the default officer password. Saved browser sessions live only in
 * the git-ignored e2e/.state/ folder.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TestOfficer {
  loginEmail: string;
  nameBn: string;
  nameEn: string;
  /** English designation name in the database (sets the meeting priority). */
  designationEn: string;
  /** ADMIN test account (promoted by global-setup). Default: OFFICER. */
  role?: "ADMIN";
}

export const OFFICERS = {
  /** F1 auth tests. */
  officer: {
    loginEmail: "e2e-officer@example.com",
    nameBn: "ই২ই পরীক্ষা কর্মকর্তা",
    nameEn: "E2E Test Officer",
    designationEn: "Statistical Officer",
  },
  /** Deputy Directors (priority 6): equal priority → blocking clash. */
  dd1: {
    loginEmail: "e2e-dd1@example.com",
    nameBn: "ই২ই উপপরিচালক প্রথম",
    nameEn: "E2E Deputy Director One",
    designationEn: "Deputy Director",
  },
  dd2: {
    loginEmail: "e2e-dd2@example.com",
    nameBn: "ই২ই উপপরিচালক দ্বিতীয়",
    nameEn: "E2E Deputy Director Two",
    designationEn: "Deputy Director",
  },
  /** Director General (priority 2): overrides the others. */
  dg: {
    loginEmail: "e2e-dg@example.com",
    nameBn: "ই২ই মহাপরিচালক",
    nameEn: "E2E Director General",
    designationEn: "Director General",
  },
  /** Statistical Officer (priority 7): the outsider. */
  so: {
    loginEmail: "e2e-so@example.com",
    nameBn: "ই২ই পরিসংখ্যান কর্মকর্তা",
    nameEn: "E2E Statistical Officer",
    designationEn: "Statistical Officer",
  },
  /** F3 admin panel tests: an ADMIN (never the SUPER_ADMIN, so its protections are tested). */
  admin: {
    loginEmail: "e2e-admin@example.com",
    nameBn: "ই২ই অ্যাডমিন",
    nameEn: "E2E Admin",
    designationEn: "Deputy Director",
    role: "ADMIN",
  },
} as const satisfies Record<string, TestOfficer>;

export type OfficerKey = keyof typeof OFFICERS;

/** Prefix of every meeting the tests create (so leftovers can be found and cancelled). */
export const TEST_MEETING_PREFIX = "ই২ই পরীক্ষা সভা";

export const STATE_DIR = join(__dirname, "..", ".state");
/** Saved browser session (cookies) of an officer, made by global-setup. */
export const storageStateOf = (key: OfficerKey) => join(STATE_DIR, `session-${key}.json`);

export const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");
export const FRONTEND_ORIGIN = "http://localhost:3000";

/**
 * The default officer password (owner decision 2026-11-09): test officers are created by the
 * admin API, so they use it. Read from E2E_OFFICER_PASSWORD, else only the DEFAULT_OFFICER_PASSWORD
 * line of backend/.env (no other backend setting is loaded). Never printed.
 */
export function defaultOfficerPassword(): string {
  const fromEnv = process.env.E2E_OFFICER_PASSWORD;
  if (fromEnv) return fromEnv;
  const file = join(__dirname, "..", "..", "..", "backend", ".env");
  if (existsSync(file)) {
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DEFAULT_OFFICER_PASSWORD="));
    const value = line
      ?.slice("DEFAULT_OFFICER_PASSWORD=".length)
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    if (value) return value;
  }
  throw new Error("Default officer password not found: set E2E_OFFICER_PASSWORD or backend/.env.");
}

export function credentialsOf(key: OfficerKey): { loginEmail: string; password: string } {
  return { loginEmail: OFFICERS[key].loginEmail, password: defaultOfficerPassword() };
}
