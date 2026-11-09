const BANGLA_ZERO = 0x09e6; // '০'

/** Converts Bangla digits (০-৯) to ASCII (0-9); other characters are unchanged (SPEC.md §4). */
export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BANGLA_ZERO));
}

/** ASCII digits → Bangla digits (০-৯), e.g. for PDF reports. Other characters unchanged. */
export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) =>
    String.fromCharCode(BANGLA_ZERO + Number(d)),
  );
}
