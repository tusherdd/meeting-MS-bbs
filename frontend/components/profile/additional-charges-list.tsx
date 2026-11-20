"use client";

import { Badge } from "@/components/ui/badge";
import { chargeText } from "@/lib/additional-charge";
import type { AdditionalCharge } from "@/lib/types";
import { useNames, useT } from "@/providers/locale-provider";

/**
 * v1.16: additional charges, read only ("[পদবি] (অতিরিক্ত দায়িত্ব), [উইং] — note"). Officers see
 * them on their profile (only an admin can change them); admins on the officer detail page.
 */
export function AdditionalChargesList({
  charges,
  adminOnlyNote = false,
}: {
  charges: AdditionalCharge[];
  /** Profile page: say that only an admin can change them. */
  adminOnlyNote?: boolean;
}) {
  const t = useT();
  const names = useNames();
  return (
    <section className="space-y-2" data-testid="additional-charges">
      <h2 className="text-sm font-medium text-slate-800">{t.profile.charges}</h2>
      {charges.length === 0 ? (
        <p className="text-sm text-slate-600">{t.profile.noCharges}</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-900">
          {charges.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <span>{chargeText(c, names, t.profile.chargeSuffix)}</span>
              {c.needsReview && <Badge tone="amber">{t.profile.chargeNeedsReview}</Badge>}
            </li>
          ))}
        </ul>
      )}
      {adminOnlyNote && <p className="text-xs text-slate-600">{t.profile.chargesAdminOnly}</p>}
    </section>
  );
}
