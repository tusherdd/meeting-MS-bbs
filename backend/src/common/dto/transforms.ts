import type { TransformFnParams } from 'class-transformer';
import { toAsciiDigits } from '../utils/digits';
import { normalizeBdMobile } from '../utils/phone';

/** Trims strings and collapses inner whitespace; other values unchanged. */
export const trimText = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/** Trims; an empty string becomes null (= clear an optional field). */
export const trimToNull = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed;
};

/** Trims and lowercases emails. */
export const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Phone numbers: Bangla digits → ASCII, trimmed; empty string → null. */
export const normalizePhone = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const cleaned = toAsciiDigits(value).trim().replace(/\s+/g, ' ');
  return cleaned === '' ? null : cleaned;
};

/** Query-string booleans: "true"/"false" → true/false (anything else is left for validation). */
export const toBoolean = ({ value }: TransformFnParams): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** Bangladesh mobile → 01XXXXXXXXX (Bangla digits, +880 etc. accepted); empty → null. */
export const normalizeMobile = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const cleaned = normalizeBdMobile(value);
  return cleaned === '' ? null : cleaned;
};
