import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ConflictListItem } from "@/lib/types";
import { t } from "@/messages";

const SHOW_AT_MOST = 3;

/** Warning box: my meetings that a higher-priority meeting overrides (pending conflicts). */
export function ConflictWarning({ conflicts }: { conflicts: ConflictListItem[] }) {
  const pending = conflicts.filter((c) => c.status === "PENDING");
  if (pending.length === 0) return null;

  // One line per affected (lower) meeting.
  const byMeeting = new Map<string, ConflictListItem[]>();
  for (const c of pending) {
    byMeeting.set(c.lowerMeeting.id, [...(byMeeting.get(c.lowerMeeting.id) ?? []), c]);
  }
  const groups = [...byMeeting.values()];
  const hidden = groups.length - SHOW_AT_MOST;

  return (
    <section
      role="alert"
      aria-labelledby="conflict-box-title"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:p-5"
    >
      <div>
        <div className="min-w-0">
          <h2 id="conflict-box-title" className="font-semibold">
            {t.dashboard.conflictBoxTitle}
          </h2>
          <p className="mt-1 text-sm">{t.dashboard.conflictBoxBody(formatNumber(groups.length))}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {groups.slice(0, SHOW_AT_MOST).map((items) => {
              const lower = items[0].lowerMeeting;
              const officers = [...new Set(items.map((c) => c.officer.nameBn))].join(", ");
              return (
                <li key={lower.id} className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="font-medium">
                    {lower.title}{" "}
                    <span className="font-normal text-amber-800">
                      ({formatDateTime(lower.startAt)})
                    </span>
                  </p>
                  <p className="text-amber-900">
                    {t.dashboard.conflictWith} {items[0].higherMeeting.title} ·{" "}
                    {t.dashboard.sharedOfficer} {officers}
                  </p>
                </li>
              );
            })}
          </ul>
          {hidden > 0 && <p className="mt-2 text-sm">{t.dashboard.more(formatNumber(hidden))}</p>}
          <Link
            href="/conflicts"
            className={buttonClass("secondary", "sm", "mt-3 border-amber-300")}
          >
            {t.dashboard.viewConflicts}
          </Link>
        </div>
      </div>
    </section>
  );
}
