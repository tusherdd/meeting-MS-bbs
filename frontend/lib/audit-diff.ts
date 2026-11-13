/**
 * Audit entries keep `before` / `after` snapshots (secrets removed, phones masked by the backend).
 * For the table we show only what changed: one row per field whose value differs.
 */
export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

type Json = Record<string, unknown> | null | undefined;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A short readable text for one value (objects as compact JSON). */
export function valueText(value: unknown, formatDate: (iso: string) => string): string | null {
  if (value === undefined) return null;
  if (value === null) return "null";
  if (typeof value === "string") return ISO_DATE.test(value) ? formatDate(value) : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value.join(", ");
  return JSON.stringify(value);
}

export function auditChanges(
  before: Json,
  after: Json,
  formatDate: (iso: string) => string,
): FieldChange[] {
  const b = before ?? {};
  const a = after ?? {};
  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const was = b[field];
    const now = a[field];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    changes.push({
      field,
      before: field in b ? valueText(was, formatDate) : null,
      after: field in a ? valueText(now, formatDate) : null,
    });
  }
  return changes;
}
