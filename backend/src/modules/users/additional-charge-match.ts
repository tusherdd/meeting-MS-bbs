/**
 * v1.16 (SPEC.md §6.2): turns an old free-text additional charge into a structured one. Used by
 * the migration StructuredAdditionalCharges1795200000000 and by the officer seed; unit-tested in
 * additional-charge-match.spec.ts.
 *
 * "Safe" match only:
 * - a designation or wing name counts when it appears as a WHOLE word (Bangla exactly, English
 *   ignoring case); a name inside a longer matched name is ignored ("Director" in "Director General");
 * - a designation name that lies inside a matched WING name is ignored ("Director General's Office"
 *   is a wing, not the DG designation — it must never grant the DG's office report scope);
 * - exactly ONE designation → matched; none or several → needs review (designation null);
 * - wing: exactly one → set; none → null; several → needs review.
 * The original text is always kept (as the note) — nothing is deleted.
 */
export interface NamedRef {
  id: string;
  nameBn: string;
  nameEn: string;
}

export interface ChargeMatch {
  designationId: string | null;
  wingId: string | null;
  needsReview: boolean;
}

interface Hit {
  id: string;
  start: number;
  end: number;
}

/** Letters, digits and Bangla signs: a name must not touch one of them on either side. */
const WORD_CHAR = /[\p{L}\p{N}ঀ-৿]/u;

function hits(text: string, refs: readonly NamedRef[]): Hit[] {
  const lower = text.toLowerCase();
  const found: Hit[] = [];
  for (const ref of refs) {
    for (const [hay, raw] of [
      [text, ref.nameBn],
      [lower, ref.nameEn.toLowerCase()],
    ] as const) {
      const name = raw.trim();
      if (!name) continue;
      for (let i = hay.indexOf(name); i >= 0; i = hay.indexOf(name, i + 1)) {
        const before = i > 0 ? hay[i - 1] : '';
        const after = hay[i + name.length] ?? '';
        if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) continue;
        found.push({ id: ref.id, start: i, end: i + name.length });
      }
    }
  }
  return found;
}

const inside = (h: Hit, other: Hit) =>
  other !== h &&
  other.start <= h.start &&
  h.end <= other.end &&
  other.end - other.start > h.end - h.start;

/** Hits not covered by a longer hit of the same list. */
function outermost(list: Hit[]): Hit[] {
  return list.filter((h) => !list.some((o) => inside(h, o)));
}

export function matchCharge(
  text: string,
  designations: readonly NamedRef[],
  wings: readonly NamedRef[],
): ChargeMatch {
  const wingHits = outermost(hits(text, wings));
  const designationHits = outermost(hits(text, designations)).filter(
    (d) => !wingHits.some((w) => w.start <= d.start && d.end <= w.end),
  );
  const designationIds = [...new Set(designationHits.map((h) => h.id))];
  const wingIds = [...new Set(wingHits.map((h) => h.id))];
  const designationId = designationIds.length === 1 ? designationIds[0] : null;
  const wingId = wingIds.length === 1 ? wingIds[0] : null;
  return {
    designationId,
    wingId,
    needsReview: designationId === null || wingIds.length > 1,
  };
}
