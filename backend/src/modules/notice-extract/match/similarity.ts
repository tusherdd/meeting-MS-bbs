/**
 * String similarity for officer matching (v1.21, SPEC.md §6.12). Works on Unicode code points, so a
 * Bangla vowel sign or hasanta counts as one character (an OCR misread usually changes one or two).
 */

/** Levenshtein edit distance (insert / delete / substitute = 1). */
export function levenshtein(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  let cur = new Array<number>(y.length + 1);
  for (let i = 1; i <= x.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[y.length];
}

/** 1 = equal, 0 = nothing in common: 1 − distance / longer length. */
export function similarity(a: string, b: string): number {
  const longest = Math.max([...a].length, [...b].length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}
