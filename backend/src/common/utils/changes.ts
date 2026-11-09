export interface Changes {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  return a === b;
}

/**
 * Old/new values of the fields that really change, for audit logs. Fields that are not in
 * `patch` (undefined) are ignored. Returns null when nothing changes.
 */
export function pickChanges<T extends object>(
  current: T,
  patch: Partial<T>,
): Changes | null {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const next = patch[key];
    if (next === undefined || same(current[key], next)) continue;
    before[key as string] = current[key] ?? null;
    after[key as string] = next;
  }
  return Object.keys(after).length > 0 ? { before, after } : null;
}
