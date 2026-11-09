import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.calendar.title };

export default function Page() {
  return <CalendarView />;
}
