/**
 * The meeting form works with Dhaka wall-clock values ("2026-11-09" + "10:30");
 * the API wants ISO instants. These helpers convert between the two.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { DHAKA_TZ } from "./time";

export interface DhakaDateTime {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (24 h)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(date: string): boolean {
  return DATE_RE.test(date) && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime());
}

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

/** Dhaka date + time → ISO string (UTC), or null when incomplete. */
export function toIso(date: string, time: string): string | null {
  if (!isValidDate(date) || !isValidTime(time)) return null;
  return fromZonedTime(`${date}T${time}:00`, DHAKA_TZ).toISOString();
}

/** ISO instant → Dhaka date + time. */
export function fromIso(iso: string | Date): DhakaDateTime {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return {
    date: formatInTimeZone(d, DHAKA_TZ, "yyyy-MM-dd"),
    time: formatInTimeZone(d, DHAKA_TZ, "HH:mm"),
  };
}

/** "10:30" + 90 → "12:00" (same day; capped at 23:59). */
export function addMinutesToTime(time: string, minutes: number): string {
  if (!isValidTime(time)) return time;
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** v1.18: a new meeting lasts 45 minutes unless the user sets another end time. */
export const DEFAULT_MEETING_MINUTES = 45;

/** Minutes from start to end on the same day, or null when a value is missing or end is not after start. */
export function durationMinutes(start: string, end: string): number | null {
  if (!isValidTime(start) || !isValidTime(end)) return null;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const d = toMin(end) - toMin(start);
  return d > 0 ? d : null;
}

/**
 * v1.18: the start time changed from `prevStart` to `newStart`. The end time moves with it and keeps
 * the current duration (prevStart → end); when that duration is unknown (empty or invalid values)
 * `fallbackMinutes` is used. `endTime` is null when the new start is incomplete (end stays as it is).
 * Validation (end after start, max length) is unchanged; the end is capped at 23:59 of the same day.
 */
export function moveEndWithStart(
  prevStart: string,
  newStart: string,
  end: string,
  fallbackMinutes: number,
): { endTime: string | null; minutes: number } {
  const minutes = durationMinutes(prevStart, end) ?? fallbackMinutes;
  if (!isValidTime(newStart)) return { endTime: null, minutes };
  return { endTime: addMinutesToTime(newStart, minutes), minutes };
}

/** Default for a new meeting: the next full half hour in Dhaka, 45 minutes long (v1.18; was one hour). */
export function defaultSlot(now = new Date()): { date: string; start: string; end: string } {
  const halfHour = 30 * 60_000;
  const start = new Date(Math.ceil((now.getTime() + 5 * 60_000) / halfHour) * halfHour);
  const s = fromIso(start);
  return { date: s.date, start: s.time, end: addMinutesToTime(s.time, DEFAULT_MEETING_MINUTES) };
}
