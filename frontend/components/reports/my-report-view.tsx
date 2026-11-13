"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ErrorAlert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { formatHours, formatNumber } from "@/lib/format";
import { queryKeys, reportsApi } from "@/lib/endpoints";
import { t } from "@/messages";
import { PeriodPicker } from "./period-picker";
import {
  MeetingsBarChart,
  PdfDownloadButton,
  ReportMeetingsTable,
  StatCards,
  StatusBreakdown,
} from "./report-parts";
import { useReportParams } from "./use-report-params";

/** /reports: my report for a day / week / month / year / fiscal year (GET /reports/me). */
export function MyReportView() {
  const { period, date, page, update } = useReportParams();

  const report = useQuery({
    queryKey: queryKeys.myReportPage(period, date, page),
    queryFn: () => reportsApi.mePage(period, date, page),
    placeholderData: keepPreviousData,
  });
  const data = report.data;
  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t.reports.title}</h1>
        <PdfDownloadButton download={() => reportsApi.mePdf(period, date)} />
      </div>

      <Card>
        <CardBody>
          <PeriodPicker
            idPrefix="my-report"
            period={period}
            date={date}
            loaded={data && data.period.period === period ? data.period : undefined}
            onChange={(next) => update(next)}
          />
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
              <MeetingsBarChart period={period} date={date} byDay={s.byDay} />
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
