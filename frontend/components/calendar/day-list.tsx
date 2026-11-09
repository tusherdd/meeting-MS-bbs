import clsx from "clsx";
import Link from "next/link";
import { formatPlainDate } from "@/lib/format";
import { toIso } from "@/lib/meeting-time";
import { addDays, dhakaToday } from "@/lib/time";
import type { MeetingSummary } from "@/lib/types";
import { t } from "@/messages";
import { groupByDate } from "./calendar-layout";
import { LineMeeting } from "./meeting-chip";
import { isWeekend } from "./week-grid";

/** Phones: the week as a list of days. */
export function DayList({
  sunday,
  meetings,
  conflictIds,
}: {
  sunday: string;
  meetings: MeetingSummary[];
  conflictIds: ReadonlySet<string>;
}) {
  const today = dhakaToday();
  const byDate = groupByDate(meetings);
  return (
    <ul className="divide-y divide-slate-100">
      {Array.from({ length: 7 }, (_, i) => addDays(sunday, i)).map((d, i) => {
        const list = byDate.get(d) ?? [];
        const start = toIso(d, "10:00")!;
        const end = toIso(d, "11:00")!;
        return (
          <li
            key={d}
            className={clsx(
              "px-4 py-3",
              isWeekend(i) && "bg-slate-50",
              d === today && "bg-brand-50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">
                {t.calendar.weekdaysShort[i]}, {formatPlainDate(d)}
              </p>
              <Link
                href={`/meetings/new?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}
                className="rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                aria-label={`${formatPlainDate(d)}: ${t.dashboard.newMeeting}`}
              >
                + {t.dashboard.newMeeting}
              </Link>
            </div>
            {list.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">{t.calendar.empty}</p>
            ) : (
              <div className="mt-2 space-y-1">
                {list.map((p) => (
                  <LineMeeting
                    key={p.meeting.id}
                    meeting={p.meeting}
                    conflict={conflictIds.has(p.meeting.id)}
                  />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
