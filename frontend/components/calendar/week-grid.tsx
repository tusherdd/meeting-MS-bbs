"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { formatPlainDate, formatTime, toBanglaDigits } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { fromIso, toIso } from "@/lib/meeting-time";
import { addDays, dhakaToday } from "@/lib/time";
import type { MeetingSummary } from "@/lib/types";
import { t } from "@/messages";
import {
  GRID_END_MIN,
  GRID_HOURS,
  GRID_START_MIN,
  groupByDate,
  layoutColumns,
  minutesOf,
} from "./calendar-layout";
import { GridMeeting, LineMeeting } from "./meeting-chip";

const HOUR_PX = 56;
/** Friday and Saturday are the weekly holidays in Bangladesh. */
export const isWeekend = (weekday: number) => weekday === 5 || weekday === 6;

function hourLabel(hour: number) {
  return toBanglaDigits(`${String(hour).padStart(2, "0")}:০০`);
}

interface Props {
  sunday: string;
  meetings: MeetingSummary[];
  conflictIds: ReadonlySet<string>;
}

/** Week view (Sun–Sat, 08:00–18:00) for tablets and desktops. */
export function WeekGrid({ sunday, meetings, conflictIds }: Props) {
  const router = useRouter();
  const now = useNow();
  const today = dhakaToday(now);
  const nowMin = minutesOf(fromIso(now).time);
  const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  const byDate = groupByDate(meetings);
  const hours = Array.from({ length: GRID_HOURS }, (_, i) => GRID_START_MIN / 60 + i);
  const hasOther = days.some((d) => (byDate.get(d) ?? []).some((p) => !p.inGrid));

  function newMeetingAt(date: string, hour: number) {
    const time = `${String(hour).padStart(2, "0")}:00`;
    const start = toIso(date, time)!;
    const end = new Date(new Date(start).getTime() + 3_600_000).toISOString();
    router.push(`/meetings/new?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[52rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"
        role="grid"
        aria-readonly="true"
      >
        {/* Header row */}
        <div role="row" className="contents">
          <div role="columnheader" className="border-b border-slate-200" />
          {days.map((d, i) => (
            <div
              key={d}
              role="columnheader"
              className={clsx(
                "border-b border-l border-slate-200 px-2 py-2 text-center text-sm",
                isWeekend(i) && "bg-slate-50",
                d === today && "bg-brand-50",
              )}
            >
              <span className="block font-semibold">{t.calendar.weekdaysShort[i]}</span>
              <span
                className={clsx(
                  "text-xs",
                  d === today ? "font-semibold text-brand-800" : "text-slate-500",
                )}
              >
                {formatPlainDate(d)}
              </span>
            </div>
          ))}
        </div>

        {/* Meetings outside 08:00–18:00 */}
        {hasOther && (
          <div role="row" className="contents">
            <div
              role="rowheader"
              className="border-b border-slate-200 px-1 py-1 text-[11px] leading-tight text-slate-500"
            >
              {t.calendar.otherTimes}
            </div>
            {days.map((d, i) => (
              <div
                key={d}
                role="gridcell"
                className={clsx(
                  "space-y-1 border-b border-l border-slate-200 p-1",
                  isWeekend(i) && "bg-slate-50",
                )}
              >
                {(byDate.get(d) ?? [])
                  .filter((p) => !p.inGrid)
                  .map((p) => (
                    <LineMeeting
                      key={p.meeting.id}
                      meeting={p.meeting}
                      conflict={conflictIds.has(p.meeting.id)}
                    />
                  ))}
              </div>
            ))}
          </div>
        )}

        {/* Time grid */}
        <div role="row" className="contents">
          <div role="rowheader" className="relative" style={{ height: GRID_HOURS * HOUR_PX }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-500"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? "" : hourLabel(h)}
              </span>
            ))}
          </div>
          {days.map((d, i) => {
            const placed = (byDate.get(d) ?? []).filter((p) => p.inGrid);
            const columns = layoutColumns(
              placed.map((p) => ({ id: p.meeting.id, startMin: p.startMin, endMin: p.endMin })),
            );
            const showNow = d === today && nowMin >= GRID_START_MIN && nowMin <= GRID_END_MIN;
            return (
              <div
                key={d}
                role="gridcell"
                className={clsx(
                  "relative border-l border-slate-200",
                  isWeekend(i) && "bg-slate-50",
                )}
                style={{ height: GRID_HOURS * HOUR_PX }}
              >
                {/* Empty hour slots: click → new meeting at that time (+1 hour) */}
                {hours.map((h, slot) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => newMeetingAt(d, h)}
                    aria-label={`${t.calendar.weekdaysShort[i]} ${formatPlainDate(d)}, ${t.calendar.newAt(hourLabel(h))}`}
                    className="group absolute inset-x-0 border-t border-slate-100 text-left hover:bg-brand-50/60 focus-visible:bg-brand-50"
                    style={{ top: slot * HOUR_PX, height: HOUR_PX }}
                  >
                    {/* Always a visible (faint) text label: no icon-only or empty buttons. */}
                    <span className="px-1.5 text-[11px] text-slate-500 group-hover:font-medium group-hover:text-brand-800 group-focus-visible:font-medium group-focus-visible:text-brand-800">
                      {t.calendar.newSlot}
                    </span>
                  </button>
                ))}
                {placed.map((p) => {
                  const c = columns.get(p.meeting.id) ?? { col: 0, cols: 1 };
                  const height = ((p.endMin - p.startMin) / 60) * HOUR_PX;
                  return (
                    <GridMeeting
                      key={p.meeting.id}
                      meeting={p.meeting}
                      conflict={conflictIds.has(p.meeting.id)}
                      compact={height < 40}
                      style={{
                        top: ((p.startMin - GRID_START_MIN) / 60) * HOUR_PX + 1,
                        height: Math.max(height - 2, 18),
                        left: `calc(${(c.col / c.cols) * 100}% + 2px)`,
                        width: `calc(${100 / c.cols}% - 4px)`,
                      }}
                    />
                  );
                })}
                {showNow && (
                  <div
                    title={`${t.calendar.now}: ${formatTime(now)}`}
                    className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                    style={{ top: ((nowMin - GRID_START_MIN) / 60) * HOUR_PX }}
                  >
                    <span className="absolute -top-2.5 left-1 rounded bg-red-500 px-1 text-[10px] leading-4 font-semibold text-white">
                      {t.calendar.now}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
