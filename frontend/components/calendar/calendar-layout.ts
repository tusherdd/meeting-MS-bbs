/**
 * Pure calendar maths (no React): which day a meeting belongs to, where it sits in the
 * 08:00–18:00 grid, and how overlapping meetings share the column width.
 */
import { fromIso } from "@/lib/meeting-time";
import type { MeetingSummary } from "@/lib/types";

export const GRID_START_MIN = 8 * 60;
export const GRID_END_MIN = 18 * 60;
export const GRID_HOURS = (GRID_END_MIN - GRID_START_MIN) / 60;

export interface PlacedMeeting {
  meeting: MeetingSummary;
  /** Dhaka calendar date of the start. */
  date: string;
  /** Minutes after Dhaka midnight (end is capped at 24:00 for meetings that run past midnight). */
  startMin: number;
  endMin: number;
  /** Fully inside 08:00–18:00 → in the grid; otherwise in the "other times" row. */
  inGrid: boolean;
}

/** "10:30" → 630 */
export function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function placeMeeting(meeting: MeetingSummary): PlacedMeeting {
  const start = fromIso(meeting.startAt);
  const end = fromIso(meeting.endAt);
  const startMin = minutesOf(start.time);
  const endMin = end.date === start.date ? minutesOf(end.time) : 24 * 60;
  return {
    meeting,
    date: start.date,
    startMin,
    endMin,
    inGrid: startMin >= GRID_START_MIN && endMin <= GRID_END_MIN,
  };
}

export function groupByDate(meetings: MeetingSummary[]): Map<string, PlacedMeeting[]> {
  const byDate = new Map<string, PlacedMeeting[]>();
  for (const m of meetings) {
    const placed = placeMeeting(m);
    byDate.set(placed.date, [...(byDate.get(placed.date) ?? []), placed]);
  }
  for (const list of byDate.values())
    list.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  return byDate;
}

export interface Column {
  /** 0-based column inside its overlap group. */
  col: number;
  /** Number of columns in the group (width = 1 / cols). */
  cols: number;
}

/**
 * Overlapping meetings side by side. Meetings that overlap (directly or through a chain) form a
 * group; inside a group each meeting takes the first free column. Touching meetings
 * (10:00–11:00 and 11:00–12:00) do not overlap.
 */
export function layoutColumns(
  items: { id: string; startMin: number; endMin: number }[],
): Map<string, Column> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const result = new Map<string, Column>();
  let group: { id: string; col: number }[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;

  const closeGroup = () => {
    for (const g of group) result.set(g.id, { col: g.col, cols: columnEnds.length });
    group = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (item.startMin >= groupEnd) closeGroup();
    let col = columnEnds.findIndex((end) => end <= item.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[col] = item.endMin;
    }
    group.push({ id: item.id, col });
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  closeGroup();
  return result;
}
