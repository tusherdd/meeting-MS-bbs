"use client";

import { useSearchParams } from "next/navigation";
import { DEFAULT_MEETING_MINUTES, defaultSlot, fromIso } from "@/lib/meeting-time";
import { MeetingForm } from "./meeting-form";

/** /meetings/new?start=<ISO>&end=<ISO> (prefilled times) or the next free half hour (45 min by default, v1.18). */
export function NewMeeting() {
  const params = useSearchParams();
  const start = params.get("start");
  const end = params.get("end");
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;

  let slot = defaultSlot();
  if (startDate && !Number.isNaN(startDate.getTime())) {
    const s = fromIso(startDate);
    const validEnd = endDate && !Number.isNaN(endDate.getTime()) && endDate > startDate;
    const e = fromIso(validEnd ? endDate : new Date(startDate.getTime() + DEFAULT_MEETING_MINUTES * 60_000));
    // One form date: an end on another day is cut to the same day's end.
    slot = { date: s.date, start: s.time, end: e.date === s.date ? e.time : "23:55" };
  }
  return <MeetingForm initialSlot={slot} />;
}
