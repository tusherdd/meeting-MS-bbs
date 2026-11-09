import clsx from "clsx";
import { formatNumber, toBanglaDigits } from "@/lib/format";
import { addDays, dhakaToday } from "@/lib/time";
import type { MeetingSummary } from "@/lib/types";
import { t } from "@/messages";
import { groupByDate } from "./calendar-layout";
import { LineMeeting } from "./meeting-chip";
import { isWeekend } from "./week-grid";

const SHOW_PER_DAY = 3;

interface Props {
  /** Sunday on or before the 1st (first grid cell). */
  gridStart: string;
  /** "YYYY-MM" of the month shown (other days are dimmed). */
  month: string;
  weeks: number;
  meetings: MeetingSummary[];
  conflictIds: ReadonlySet<string>;
  /** Open the week view of that day. */
  onOpenDay: (date: string) => void;
}

/** Month view: up to 3 meetings per day and "+N আরও". */
export function MonthGrid({ gridStart, month, weeks, meetings, conflictIds, onOpenDay }: Props) {
  const today = dhakaToday();
  const byDate = groupByDate(meetings);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[40rem] grid-cols-7 border-l border-t border-slate-200">
        {t.calendar.weekdaysShort.map((name, i) => (
          <div
            key={name}
            className={clsx(
              "border-r border-b border-slate-200 px-2 py-1.5 text-center text-xs font-semibold text-slate-600",
              isWeekend(i) && "bg-slate-50",
            )}
          >
            {name}
          </div>
        ))}
        {days.map((d, i) => {
          const list = byDate.get(d) ?? [];
          const inMonth = d.startsWith(month);
          const hidden = list.length - SHOW_PER_DAY;
          return (
            <div
              key={d}
              className={clsx(
                "min-h-28 space-y-1 border-r border-b border-slate-200 p-1",
                isWeekend(i % 7) && "bg-slate-50",
                !inMonth && "bg-slate-100/60",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                className={clsx(
                  "flex size-7 items-center justify-center rounded-full text-sm",
                  d === today
                    ? "bg-brand-700 font-semibold text-white"
                    : inMonth
                      ? "text-slate-800 hover:bg-slate-200"
                      : "text-slate-400",
                )}
                aria-label={d}
              >
                {toBanglaDigits(Number(d.slice(8, 10)))}
              </button>
              {list.slice(0, SHOW_PER_DAY).map((p) => (
                <LineMeeting
                  key={p.meeting.id}
                  meeting={p.meeting}
                  conflict={conflictIds.has(p.meeting.id)}
                />
              ))}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenDay(d)}
                  className="w-full rounded px-1 text-left text-xs font-medium text-brand-700 hover:bg-brand-50"
                >
                  {t.calendar.more(formatNumber(hidden))}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
