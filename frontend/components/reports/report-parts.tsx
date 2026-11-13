"use client";

import Link from "next/link";
import { useState } from "react";
import { RoleBadge, StatusBadge } from "@/components/dashboard/meeting-badges";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { saveBlob, type DownloadedFile } from "@/lib/api";
import {
  formatDateWithWeekday,
  formatNumber,
  formatPlainDay,
  formatPlainDayMonth,
  formatPlainMonth,
  formatPlainMonthYear,
  formatTimeRange,
} from "@/lib/format";
import { chartBars } from "@/lib/report-period";
import type { DayCount, PeriodDto, ReportMeeting, StatusCounts } from "@/lib/types";
import { t } from "@/messages";

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
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
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

/** "নির্ধারিত ৩ · সম্পন্ন ১০ · বাতিল ২" as badges with numbers. */
export function StatusBreakdown({ byStatus }: { byStatus: StatusCounts }) {
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
  period,
  date,
  byDay,
}: {
  period: PeriodDto["period"];
  date: string;
  byDay: DayCount[];
}) {
  const { unit, bars } = chartBars(period, date, byDay);
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
                  <span className="text-[11px] text-slate-700">{formatNumber(bar.meetings)}</span>
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
                className="min-w-0 flex-1 truncate text-center text-[11px] text-slate-600"
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
}: {
  meetings: ReportMeeting[];
  showMyRole: boolean;
}) {
  if (meetings.length === 0) return <EmptyState title={t.reports.meetingsEmpty} />;
  return (
    <Table>
      <THead>
        <tr>
          <Th className="w-56">{t.meeting.dateTime}</Th>
          <Th>{t.meeting.title}</Th>
          <Th>{t.meeting.room}</Th>
          <Th>{t.reports.organizer}</Th>
          {showMyRole && <Th>{t.meeting.role}</Th>}
          <Th>{t.meeting.statusLabel}</Th>
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
            </Td>
            <Td>{m.room ?? <span className="text-slate-500">{t.meeting.noRoom}</span>}</Td>
            <Td>
              {m.organizerNameBn}
              {m.organizerDesignationBn && (
                <span className="block text-xs text-slate-600">{m.organizerDesignationBn}</span>
              )}
            </Td>
            {showMyRole && (
              <Td>
                <RoleBadge role={m.myRole} />
              </Td>
            )}
            <Td>
              <StatusBadge status={m.status} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

/**
 * "PDF ডাউনলোড": fetches the PDF as a Blob (same filters as the page), shows "তৈরি হচ্ছে…"
 * meanwhile, and saves it under the name from Content-Disposition. Errors show the backend text.
 */
export function PdfDownloadButton({ download }: { download: () => Promise<DownloadedFile> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      saveBlob(await download());
      toast.show(t.reports.pdfDone);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={onClick} loading={busy} loadingText={t.reports.pdfLoading}>
        {t.reports.pdf}
      </Button>
      {error !== null && <ErrorAlert error={error} />}
    </div>
  );
}
