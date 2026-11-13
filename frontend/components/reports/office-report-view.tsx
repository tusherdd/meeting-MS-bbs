"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { LoadingBlock } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import {
  designationsApi,
  queryKeys,
  reportsApi,
  wingsApi,
  type OfficeFilter,
} from "@/lib/endpoints";
import { formatHours, formatNumber, formatPlainDate } from "@/lib/format";
import type { DesignationCount, DayCount, GroupCount, OrganizerCount } from "@/lib/types";
import { t } from "@/messages";
import { PeriodPicker } from "./period-picker";
import { PdfDownloadButton, ReportMeetingsTable, StatCards, StatusBreakdown } from "./report-parts";
import { useReportParams } from "./use-report-params";

/** /admin/reports: office-wide report, filterable by the organizer's wing and designation. */
export function OfficeReportView() {
  const { period, date, page, wingId, designationId, update } = useReportParams();
  const filter: OfficeFilter = {
    wingId: wingId || undefined,
    designationId: designationId || undefined,
  };

  const report = useQuery({
    queryKey: queryKeys.officeReport(period, date, filter, page),
    queryFn: () => reportsApi.office(period, date, filter, page),
    placeholderData: keepPreviousData,
  });
  const wings = useQuery({ queryKey: queryKeys.allWings, queryFn: wingsApi.list });
  const designations = useQuery({
    queryKey: queryKeys.designations(false),
    queryFn: () => designationsApi.list(false),
  });
  const data = report.data;
  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t.reports.officeTitle}</h1>
        <PdfDownloadButton download={() => reportsApi.officePdf(period, date, filter)} />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <PeriodPicker
            idPrefix="office-report"
            period={period}
            date={date}
            loaded={data && data.period.period === period ? data.period : undefined}
            onChange={(next) => update(next)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="office-report-wing"
              label={t.reports.filterWing}
              placeholder={t.reports.allWings}
              value={wingId}
              onChange={(e) => update({ wingId: e.target.value })}
              options={(wings.data ?? []).map((w) => ({ value: w.id, label: w.nameBn }))}
            />
            <Select
              id="office-report-designation"
              label={t.reports.filterDesignation}
              placeholder={t.reports.allDesignations}
              value={designationId}
              onChange={(e) => update({ designationId: e.target.value })}
              options={(designations.data ?? []).map((d) => ({ value: d.id, label: d.nameBn }))}
            />
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
              { label: t.reports.cards.hours, value: formatHours(s.totalHours) },
              {
                label: t.reports.cards.pendingConflicts,
                value: formatNumber(s.conflicts.pending),
                warn: s.conflicts.pending > 0,
              },
              {
                label: t.reports.cards.resolvedConflicts,
                value: formatNumber(s.conflicts.resolved),
              },
            ]}
          />
          <Card>
            <CardBody>
              <StatusBreakdown byStatus={s.byStatus} />
              <p className="mt-2 text-xs text-slate-600">{t.reports.hoursNote}</p>
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <GroupTable
              title={t.reports.byWingTitle}
              rows={s.byWing}
              nameLabel={t.reports.colWing}
            />
            <DesignationTable rows={s.byDesignation} />
            <OrganizerTable rows={s.topOrganizers} />
            <BusiestDays rows={s.busiestDays} />
          </div>

          <Card>
            <CardHeader
              title={t.reports.meetingsTitle}
              actions={
                <span className="text-sm text-slate-600">
                  {t.meetingsList.total(formatNumber(data.meetings.total))}
                </span>
              }
            />
            <ReportMeetingsTable meetings={data.meetings.items} showMyRole={false} />
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

function SmallTable({
  title,
  head,
  children,
  empty,
}: {
  title: string;
  head: ReactNode;
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      {empty ? (
        <p className="px-5 py-4 text-sm text-slate-500">{t.reports.noRows}</p>
      ) : (
        <Table>
          <THead>
            <tr>{head}</tr>
          </THead>
          <TBody>{children}</TBody>
        </Table>
      )}
    </Card>
  );
}

function GroupTable({
  title,
  rows,
  nameLabel,
}: {
  title: string;
  rows: GroupCount[];
  nameLabel: string;
}) {
  return (
    <SmallTable
      title={title}
      empty={rows.length === 0}
      head={
        <>
          <Th>{nameLabel}</Th>
          <Th>{t.reports.colMeetings}</Th>
          <Th>{t.reports.colHours}</Th>
        </>
      }
    >
      {rows.map((r) => (
        <Tr key={r.id ?? "none"}>
          <Td>{r.nameBn || t.reports.noWingName}</Td>
          <Td>{formatNumber(r.meetings)}</Td>
          <Td>{formatNumber(r.hours)}</Td>
        </Tr>
      ))}
    </SmallTable>
  );
}

function DesignationTable({ rows }: { rows: DesignationCount[] }) {
  return (
    <SmallTable
      title={t.reports.byDesignationTitle}
      empty={rows.length === 0}
      head={
        <>
          <Th>{t.reports.colDesignation}</Th>
          <Th>{t.reports.colPriority}</Th>
          <Th>{t.reports.colMeetings}</Th>
          <Th>{t.reports.colHours}</Th>
        </>
      }
    >
      {rows.map((r) => (
        <Tr key={r.id ?? "none"}>
          <Td>{r.nameBn}</Td>
          <Td>{r.priority === null ? t.profile.none : formatNumber(r.priority)}</Td>
          <Td>{formatNumber(r.meetings)}</Td>
          <Td>{formatNumber(r.hours)}</Td>
        </Tr>
      ))}
    </SmallTable>
  );
}

function OrganizerTable({ rows }: { rows: OrganizerCount[] }) {
  return (
    <SmallTable
      title={t.reports.topOrganizersTitle}
      empty={rows.length === 0}
      head={
        <>
          <Th>{t.reports.colName}</Th>
          <Th>{t.reports.colMeetings}</Th>
          <Th>{t.reports.colHours}</Th>
        </>
      }
    >
      {rows.map((r) => (
        <Tr key={r.userId}>
          <Td>
            {r.nameBn}
            {r.designationBn && (
              <span className="block text-xs text-slate-600">{r.designationBn}</span>
            )}
          </Td>
          <Td>{formatNumber(r.meetings)}</Td>
          <Td>{formatNumber(r.hours)}</Td>
        </Tr>
      ))}
    </SmallTable>
  );
}

function BusiestDays({ rows }: { rows: DayCount[] }) {
  return (
    <SmallTable
      title={t.reports.busiestDaysTitle}
      empty={rows.length === 0}
      head={
        <>
          <Th>{t.reports.colDate}</Th>
          <Th>{t.reports.colMeetings}</Th>
          <Th>{t.reports.colHours}</Th>
        </>
      }
    >
      {rows.map((r) => (
        <Tr key={r.date}>
          <Td>{formatPlainDate(r.date)}</Td>
          <Td>{formatNumber(r.meetings)}</Td>
          <Td>{formatNumber(r.hours)}</Td>
        </Tr>
      ))}
    </SmallTable>
  );
}
