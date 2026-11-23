"use client";

import Link from "next/link";
import { useState } from "react";
import { RoleBadge, StatusBadge } from "@/components/dashboard/meeting-badges";
import { FileViewerPanel } from "@/components/files/file-viewer-panel";
import { MeetingRowMenu } from "@/components/meetings/meeting-row-menu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import type { DownloadedFile } from "@/lib/api";

import { chartBars } from "@/lib/report-period";
import { isOrganizerOrChair, isParticipant } from "@/lib/row-actions";
import type { DayCount, ReportMeeting, StatusCounts } from "@/lib/types";
import { useFormat, useNames, useT } from "@/providers/locale-provider";

export interface StatItem {
  label: string;
  value: string;
  /** Red number (something needs attention). */
  warn?: boolean;
}

/** A row of small number cards. */
export function StatCards({ items, label }: { items: StatItem[]; label: string }) {
  return (
    <section aria-label={label}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <dt className="text-xs text-slate-600">{item.label}</dt>
            <dd
              className={`mt-1 text-xl font-semibold ${item.warn ? "text-red-700" : "text-slate-900"}`}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** "চলমান ৩ · সম্পন্ন ১০ · বাতিল ২" as badges with numbers. */
export function StatusBreakdown({ byStatus }: { byStatus: StatusCounts }) {
  const t = useT();
  const { formatNumber } = useFormat();
  const statuses = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800">{t.reports.byStatusTitle}</h3>
      <ul className="mt-2 flex flex-wrap gap-3" data-testid="status-breakdown">
        {statuses.map((s) => (
          <li key={s} className="flex items-center gap-2 text-sm">
            <StatusBadge status={s} />
            <span className="font-semibold text-slate-900">{formatNumber(byStatus[s])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Meetings per day (per month for a year) as plain HTML bars: no SVG, so nothing looks like an
 * icon (SPEC.md §13.5 allows charts; HTML keeps the no-icon check simple). Every bar has a text
 * label for screen readers, and the numbers are also listed in a hidden table.
 */
export function MeetingsBarChart({
  days,
  byDay,
}: {
  /** First and last day shown (both inclusive): the period or the custom range (v1.15). */
  days: { first: string; last: string };
  byDay: DayCount[];
}) {
  const t = useT();
  const {
    formatNumber,
    formatPlainDay,
    formatPlainDayMonth,
    formatPlainMonth,
    formatPlainMonthYear,
  } = useFormat();
  const { unit, bars } = chartBars(days, byDay);
  const max = Math.max(1, ...bars.map((b) => b.meetings));
  const total = bars.reduce((sum, b) => sum + b.meetings, 0);
  const title = unit === "day" ? t.reports.chartTitleDay : t.reports.chartTitleMonth;
  const longLabel = (label: string) =>
    unit === "day" ? formatPlainDayMonth(label) : formatPlainMonthYear(label);
  const shortLabel = (label: string) =>
    unit === "day" ? formatPlainDay(label) : formatPlainMonth(label);
  // Label every bar when there are few; otherwise every few bars so the text does not overlap.
  const labelEvery = bars.length <= 12 ? 1 : bars.length <= 16 ? 2 : 5;

  return (
    <figure className="space-y-2" data-testid="meetings-chart">
      <figcaption>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="block text-xs text-slate-600">
          {t.reports.chartDescription(formatNumber(total))}
        </span>
      </figcaption>
      {total === 0 ? (
        <p className="py-4 text-sm text-slate-500">{t.reports.chartEmpty}</p>
      ) : (
        <>
          <ul
            aria-hidden="true"
            className="flex h-44 items-end gap-0.5 border-b border-slate-300 sm:gap-1"
          >
            {bars.map((bar) => (
              <li
                key={bar.key}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                title={t.reports.chartBar(longLabel(bar.label), formatNumber(bar.meetings))}
              >
                {bar.meetings > 0 && bars.length <= 16 && (
                  <span className="text-xs text-slate-700">{formatNumber(bar.meetings)}</span>
                )}
                <span
                  className="block w-full rounded-t bg-brand-600"
                  style={{ height: `${(bar.meetings / max) * 85}%` }}
                />
              </li>
            ))}
          </ul>
          <ul aria-hidden="true" className="flex gap-0.5 sm:gap-1">
            {bars.map((bar, i) => (
              <li
                key={bar.key}
                className="min-w-0 flex-1 truncate text-center text-xs text-slate-600"
              >
                {i % labelEvery === 0 ? shortLabel(bar.label) : ""}
              </li>
            ))}
          </ul>
          <table className="sr-only">
            <caption>{title}</caption>
            <tbody>
              {bars
                .filter((b) => b.meetings > 0)
                .map((bar) => (
                  <tr key={bar.key}>
                    <th scope="row">{longLabel(bar.label)}</th>
                    <td>{formatNumber(bar.meetings)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}

/** Meeting rows of a report (personal: with my role; office: with the organizer). */
export function ReportMeetingsTable({
  meetings,
  showMyRole,
  organizerAs = "wing",
}: {
  meetings: ReportMeeting[];
  showMyRole: boolean;
  /**
   * v1.9: my report shows the organizer's wing. v1.10: the admin office report page shows the wing
   * too (like its PDF); "person" is kept for pages that need the name.
   */
  organizerAs?: "wing" | "person";
}) {
  const t = useT();
  const names = useNames();
  const { formatDateWithWeekday, formatTimeRange } = useFormat();
  if (meetings.length === 0) return <EmptyState title={t.reports.meetingsEmpty} />;
  return (
    <Table>
      <THead>
        <tr>
          <Th className="w-56">{t.meeting.dateTime}</Th>
          <Th>{t.meeting.title}</Th>
          <Th>{t.meeting.room}</Th>
          <Th>{t.reports.organizer}</Th>
          <Th>{t.reports.chair}</Th>
          {showMyRole && <Th>{t.meeting.role}</Th>}
          <Th>{t.meeting.statusLabel}</Th>
          <Th className="w-14">
            <span className="sr-only">{t.rowMenu.column}</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {meetings.map((m) => (
          <Tr key={m.id} className={m.status === "CANCELLED" ? "text-slate-500" : undefined}>
            <Td className="whitespace-nowrap">
              <span className="block text-xs text-slate-600">
                {formatDateWithWeekday(m.startAt)}
              </span>
              <span className="font-medium text-brand-800">
                {formatTimeRange(m.startAt, m.endAt)}
              </span>
            </Td>
            <Td>
              <Link
                href={`/meetings/${m.id}`}
                className="font-semibold text-slate-900 hover:underline"
              >
                {m.title}
              </Link>
              {m.guests.length > 0 && (
                // Guest officers are listed under the meeting only; they are never counted.
                <p className="mt-1 text-xs text-slate-600" data-testid="report-guests">
                  <span className="font-semibold">{t.reports.guests}:</span>{" "}
                  {m.guests.map((g) => `${g.name} — ${g.designation}`).join("; ")}
                </p>
              )}
            </Td>
            <Td>{m.room ?? <span className="text-slate-500">{t.meeting.noRoom}</span>}</Td>
            <Td>
              {organizerAs === "wing" ? (
                names.organizerFrom(
                  m.organizerWingBn,
                  m.organizerWingEn,
                  m.organizerDesignationBn,
                  m.organizerDesignationEn,
                )
              ) : (
                <>
                  {names.pick(m.organizerNameBn, m.organizerNameEn)}
                  {m.organizerDesignationBn && (
                    <span className="block text-xs text-slate-600">
                      {names.pick(m.organizerDesignationBn, m.organizerDesignationEn)}
                    </span>
                  )}
                </>
              )}
            </Td>
            <Td>{names.pickOptional(m.chairNameBn, m.chairNameEn) ?? "—"}</Td>
            {showMyRole && (
              <Td>
                <RoleBadge role={m.myRole} />
              </Td>
            )}
            <Td>
              <StatusBadge status={m.status} />
            </Td>
            <Td className="py-2 text-right">
              <MeetingRowMenu
                meeting={m}
                mine={isOrganizerOrChair(m.myRole)}
                participant={isParticipant(m.myRole)}
              />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

/**
 * v1.17 (SPEC.md §13.12, §13.22): "PDF দেখুন" / "View PDF" — opens the shared file viewer panel,
 * which fetches the PDF as a Blob (same filters as the page) and shows it; its "Download" button
 * saves it under the name from Content-Disposition. Errors show the backend text in the panel.
 */
export function PdfViewButton({
  load,
  name,
}: {
  load: () => Promise<DownloadedFile>;
  /** Shown in the panel header until the server's file name is known. */
  name: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t.common.viewPdf}</Button>
      <FileViewerPanel
        open={open}
        onClose={() => setOpen(false)}
        files={[{ id: "pdf", name, mime: "application/pdf", load }]}
        loadingText={t.reports.pdfLoading}
      />
    </>
  );
}
