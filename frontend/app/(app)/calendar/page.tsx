import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).calendar.title };
}

export default function Page() {
  return <CalendarView />;
}
