/**
 * Dedicated test officers. Never real officers' accounts: global-setup.ts creates them through
 * the admin API. Their passwords and saved browser sessions live only in the git-ignored
 * e2e/.state/ folder.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TestOfficer {
  loginEmail: string;
  nameBn: string;
  nameEn: string;
  /** English designation name in the database (sets the meeting priority). */
  designationEn: string;
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
} as const satisfies Record<string, TestOfficer>;

export type OfficerKey = keyof typeof OFFICERS;

/** Prefix of every meeting the tests create (so leftovers can be found and cancelled). */
export const TEST_MEETING_PREFIX = "ই২ই পরীক্ষা সভা";

export const STATE_DIR = join(__dirname, "..", ".state");
export const PASSWORDS_FILE = join(STATE_DIR, "passwords.json");
/** Saved browser session (cookies) of an officer, made by global-setup. */
export const storageStateOf = (key: OfficerKey) => join(STATE_DIR, `session-${key}.json`);

export const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");
export const FRONTEND_ORIGIN = "http://localhost:3000";

export function readPasswords(): Partial<Record<OfficerKey, string>> {
  if (!existsSync(PASSWORDS_FILE)) return {};
  return JSON.parse(readFileSync(PASSWORDS_FILE, "utf8")) as Partial<Record<OfficerKey, string>>;
}

export function credentialsOf(key: OfficerKey): { loginEmail: string; password: string } {
  const password = readPasswords()[key];
  if (!password)
    throw new Error(`No password for test officer "${key}": global-setup did not run.`);
  return { loginEmail: OFFICERS[key].loginEmail, password };
}
