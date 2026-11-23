"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ErrorAlert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";

import { queryKeys, reportsApi } from "@/lib/endpoints";
import { whenDays, whenFileKey } from "@/lib/report-range";
import { useFormat, useT } from "@/providers/locale-provider";
import { ReportPeriodBar, useRangeText } from "./report-period-bar";
import {
  MeetingsBarChart,
  PdfViewButton,
  ReportMeetingsTable,
  StatCards,
  StatusBreakdown,
} from "./report-parts";
import { useReportParams } from "./use-report-params";

/**
 * /reports: my report for today / this week / this month / this year or (v1.15) a chosen date
 * range (GET /reports/me).
 */
export function MyReportView() {
  const t = useT();
  const { formatHours, formatNumber } = useFormat();
  const { when, activePeriod, page, update, choosePeriod, chooseRange } = useReportParams();

  const report = useQuery({
    queryKey: queryKeys.myReportPage(when, page),
    queryFn: () => reportsApi.mePage(when, page),
    placeholderData: keepPreviousData,
  });
  const data = report.data;
  const s = data?.summary;
  // The backend's label and exact range, once the loaded report is the one asked for.
  const loaded =
    data &&
    (when.kind === "range"
      ? data.period.period === "custom" && data.period.date === when.from
      : data.period.period === when.period)
      ? data.period
      : undefined;
  const rangeText = useRangeText(when, loaded);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t.reports.title}</h1>
        <PdfViewButton load={() => reportsApi.mePdf(when)} name={`meeting-report-${whenFileKey(when)}.pdf`} />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <ReportPeriodBar
            idPrefix="my-report"
            when={when}
            activePeriod={activePeriod}
            onPeriod={choosePeriod}
            onRange={chooseRange}
          />
          <div aria-live="polite" className="rounded-lg bg-brand-50 px-4 py-2.5 text-brand-900">
            {loaded && <p className="font-semibold">{loaded.labelBn}</p>}
            <p className="text-sm" data-testid="report-range">
              {rangeText}
            </p>
          </div>
        </CardBody>
      </Card>

      {report.isPending ? (
        <LoadingBlock />
      ) : report.isError || !s || !data ? (
        <ErrorAlert error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <div className="space-y-6" aria-busy={report.isFetching}>
          <StatCards
            label={t.reports.summaryTitle}
            items={[
              { label: t.reports.cards.total, value: formatNumber(s.totalMeetings) },
              { label: t.reports.cards.organized, value: formatNumber(s.organized) },
              { label: t.reports.cards.attended, value: formatNumber(s.attended) },
              { label: t.reports.cards.hours, value: formatHours(s.totalHours) },
              {
                label: t.reports.cards.conflicts,
                value: formatNumber(s.conflictsRaisedAgainstMyMeetings),
                warn: s.conflictsRaisedAgainstMyMeetings > 0,
              },
            ]}
          />

          <Card>
            <CardBody className="space-y-6">
              <div className="flex flex-wrap justify-between gap-4">
                <StatusBreakdown byStatus={s.byStatus} />
                <p className="text-sm text-slate-600">
                  {t.reports.cards.conflictsIRaised}:{" "}
                  <span className="font-semibold text-slate-900">
                    {formatNumber(s.conflictsIRaised)}
                  </span>
                  <span className="block text-xs">{t.reports.hoursNote}</span>
                </p>
              </div>
              <MeetingsBarChart days={whenDays(when)} byDay={s.byDay} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t.reports.meetingsTitle}
              actions={
                <span className="text-sm text-slate-600">
                  {t.meetingsList.total(formatNumber(data.meetings.total))}
                </span>
              }
            />
            <ReportMeetingsTable meetings={data.meetings.items} showMyRole />
            <Pagination
              page={data.meetings.page}
              totalPages={data.meetings.totalPages}
              onChange={(p) => update({ page: p })}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
