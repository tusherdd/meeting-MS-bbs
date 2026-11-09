/**
 * Escapes LIKE/ILIKE wildcards so user input is matched literally. The value itself is always
 * passed as a bound parameter (SPEC.md §9.11); this only stops "%" and "_" acting as wildcards.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
