const BANGLA_ZERO = 0x09e6; // '০'

/** Converts Bangla digits (০-৯) to ASCII (0-9); other characters are unchanged (SPEC.md §4). */
export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BANGLA_ZERO));
}
