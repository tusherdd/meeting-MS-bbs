"use client";

import { useSearchParams } from "next/navigation";
import { defaultSlot, fromIso } from "@/lib/meeting-time";
import { MeetingForm } from "./meeting-form";

/** /meetings/new?start=<ISO>&end=<ISO> (from the calendar) or the next free half hour. */
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
    const e = fromIso(validEnd ? endDate : new Date(startDate.getTime() + 3_600_000));
    // One form date: an end on another day is cut to the same day's end.
    slot = { date: s.date, start: s.time, end: e.date === s.date ? e.time : "23:55" };
  }
  return <MeetingForm initialSlot={slot} />;
}
