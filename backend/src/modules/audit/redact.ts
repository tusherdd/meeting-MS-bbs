/**
 * Redaction for audit-log snapshots shown through the API (step 10). Secrets are removed
 * completely; phone numbers are masked (last 3 digits kept so an admin can tell them apart).
 */
export const REDACTED = '[REDACTED]';

const SECRET_KEY = /pass(word)?|secret|token|hash|otp|cookie|authorization/i;
const PHONE_KEY = /^(mobile|mobileAlt|officePhone|fax|phone)$/i;
/** Bangladesh-looking numbers inside free text (01XXXXXXXXX, +880…, landlines). */
const PHONE_IN_TEXT = /(\+?880[\s-]?|0)\d[\d\s-]{6,}\d/g;

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 3 ? '***' : `***${digits.slice(-3)}`;
}

export function redact(value: unknown, key = ''): unknown {
  if (key && SECRET_KEY.test(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, key));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        redact(v, k),
      ]),
    );
  }
  if (typeof value === 'string') {
    if (PHONE_KEY.test(key)) return maskPhone(value);
    return value.replace(PHONE_IN_TEXT, (m) => maskPhone(m));
  }
  return value;
}
