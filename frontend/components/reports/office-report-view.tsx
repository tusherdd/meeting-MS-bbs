"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { StatusBadge, RoleBadge } from "@/components/dashboard/meeting-badges";
import { MeetingRowMenu } from "@/components/meetings/meeting-row-menu";
import { ErrorAlert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { LoadingBlock } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { peopleApi, queryKeys, reportsApi, type OfficeFilter } from "@/lib/endpoints";
import { isOrganizerOrChair, isParticipant } from "@/lib/row-actions";
import type { OfficeMeetingRow, OfficeReport } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import { useFormat, useNames, useT } from "@/providers/locale-provider";
import { LockIcon } from "./lock-icon";
import { OfficerPicker } from "./officer-picker";
import { ReportPeriodBar } from "./report-period-bar";
import { PdfDownloadButton, StatCards } from "./report-parts";
import { useReportParams } from "./use-report-params";

const STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
const ROLES = ["ORGANIZER", "CHAIR", "MEMBER"] as const;

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * v1.15 "অফিস রিপোর্ট" / "Office report" (SPEC.md §6.10, §13.21) — one page for admins, OFFICE and
 * WING viewers (samples in docs/samples/office-report/). NONE: a 403 note (the API answers 403).
 * Every filter lives in the address; the PDF gets the same filters and the same page.
 */
export function OfficeReportView() {
  const t = useT();
  const { user } = useAuth();
  const scope = user?.officeReportScope ?? "NONE";

  if (scope === "NONE") {
    return (
      <Blocked
        code="403"
        title={t.officeReport.forbiddenTitle}
        body={t.officeReport.forbiddenBody}
      />
    );
  }
  if (scope === "WING" && !user?.wing) {
    return <Blocked title={t.officeReport.noWingTitle} body={t.officeReport.noWingBody} />;
  }
  return <OfficeReport />;
}

function Blocked({ code, title, body }: { code?: string; title: string; body: string }) {
  const t = useT();
  const { digits } = useFormat();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">{t.officeReport.title}</h1>
      <Card>
        <CardBody className="space-y-2 py-8 text-center" data-testid="office-report-blocked">
          {code && <p className="text-4xl font-bold text-brand-700">{digits(code)}</p>}
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-slate-700">{body}</p>
        </CardBody>
      </Card>
    </div>
  );
}

function OfficeReport() {
  const t = useT();
  const names = useNames();
  const { user } = useAuth();
  const { formatDate, formatNumber } = useFormat();
  const { when, activePeriod, page, get, update, choosePeriod, chooseRange } = useReportParams();
  const wingScope = user?.officeReportScope === "WING";
  const ownWing = user?.wing ?? null;

  const filter: OfficeFilter = {
    wingId: wingScope ? undefined : get("wingId") || undefined,
    officerId: get("officerId") || undefined,
    status: oneOf(get("status"), STATUSES),
    organizerWingId: wingScope ? undefined : get("organizerWingId") || undefined,
    chair: get("chair") || undefined,
    role: get("officerId") ? oneOf(get("role"), ROLES) : undefined,
  };

  const report = useQuery({
    queryKey: queryKeys.officeReport(when, filter, page),
    queryFn: () => reportsApi.office(when, filter, page),
    placeholderData: keepPreviousData,
  });
  const wings = useQuery({
    queryKey: queryKeys.wings,
    queryFn: peopleApi.wings,
    enabled: !wingScope,
    staleTime: 5 * 60_000,
  });
  const data = report.data;

  const rangeText = data
    ? `${formatDate(data.period.from)} – ${formatDate(new Date(new Date(data.period.to).getTime() - 1))}`
    : "";
  const officer = data?.officer ?? null;
  const subtitle = officer
    ? [
        [
          [t.officeReport.honorific, names.pick(officer.nameBn, officer.nameEn)]
            .filter(Boolean)
            .join(" "),
          names.pickOptional(officer.designationBn, officer.designationEn),
        ]
          .filter(Boolean)
          .join(", "),
        names.pickOptional(officer.wingBn, officer.wingEn),
        rangeText,
      ]
        .filter(Boolean)
        .join(" · ")
    : rangeText;

  const wingSelectId = "office-report-wing";
  const lockHintId = "office-report-wing-locked";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{t.officeReport.title}</h1>
          <p className="text-slate-700" aria-live="polite" data-testid="office-report-subtitle">
            {subtitle}
          </p>
        </div>
        <PdfDownloadButton
          label={t.officeReport.downloadPdf}
          download={() => reportsApi.officePdf(when, filter, page)}
        />
      </div>

      <Card>
        <CardBody>
          <ReportPeriodBar
            idPrefix="office-report"
            when={when}
            activePeriod={activePeriod}
            onPeriod={choosePeriod}
            onRange={chooseRange}
          >
            <div className="w-full sm:w-56">
              {wingScope ? (
                <div className="relative" data-locked-wing="">
                  <Select
                    id={wingSelectId}
                    label={t.officeReport.wing}
                    disabled
                    aria-describedby={lockHintId}
                    value={ownWing?.id ?? ""}
                    options={
                      ownWing
                        ? [{ value: ownWing.id, label: names.pick(ownWing.nameBn, ownWing.nameEn) }]
                        : []
                    }
                    className="appearance-none bg-slate-100 pr-9"
                    onChange={() => undefined}
                  />
                  <span className="pointer-events-none absolute right-3 bottom-3 text-slate-600 sm:bottom-2.5">
                    <LockIcon />
                  </span>
                  <span id={lockHintId} className="sr-only">
                    {t.officeReport.wingLocked}
                  </span>
                </div>
              ) : (
                <Select
                  id={wingSelectId}
                  label={t.officeReport.wing}
                  value={filter.wingId ?? ""}
                  placeholder={t.officeReport.allWings}
                  options={(wings.data ?? []).map((w) => ({ value: w.id, label: names.of(w) }))}
                  // A new wing narrows the officer list, so a chosen officer is cleared.
                  onChange={(e) =>
                    update({ wingId: e.target.value, officerId: undefined, role: undefined })
                  }
                />
              )}
            </div>
            <OfficerPicker
              idPrefix="office-report"
              wingId={wingScope ? (ownWing?.id ?? "") : (filter.wingId ?? "")}
              value={filter.officerId ?? ""}
              valueLabel={officer ? names.pick(officer.nameBn, officer.nameEn) : null}
              onChange={(id) => update({ officerId: id, role: undefined })}
            />
          </ReportPeriodBar>
        </CardBody>
      </Card>

      {report.isPending ? (
        <LoadingBlock />
      ) : report.isError || !data ? (
        <ErrorAlert error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <div className="space-y-6" aria-busy={report.isFetching}>
          <StatCards
            label={t.officeReport.cardsLabel}
            items={[
              { label: t.officeReport.cards.total, value: formatNumber(data.cards.total) },
              { label: t.officeReport.cards.scheduled, value: formatNumber(data.cards.scheduled) },
              { label: t.officeReport.cards.completed, value: formatNumber(data.cards.completed) },
              { label: t.officeReport.cards.cancelled, value: formatNumber(data.cards.cancelled) },
              { label: t.officeReport.cards.hours, value: formatNumber(data.cards.hours) },
            ]}
          />

          {data.wings && (
            <WingList
              wings={data.wings}
              onChoose={(id) => update({ wingId: id, officerId: undefined })}
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <TopParticipants report={data} />
            <BusiestDays report={data} />
          </div>

          <MeetingList report={data} filter={filter} wingScope={wingScope} update={update} />
        </div>
      )}
    </div>
  );
}

function WingList({
  wings,
  onChoose,
}: {
  wings: NonNullable<OfficeReport["wings"]>;
  onChoose: (wingId: string) => void;
}) {
  const t = useT();
  const names = useNames();
  const { formatNumber } = useFormat();
  return (
    <Card>
      <CardHeader title={t.officeReport.wingList} />
      <CardBody>
        {wings.length === 0 ? (
          <EmptyState title={t.officeReport.empty} />
        ) : (
          // Exactly 5 rows show; the rest scroll inside the box under a sticky header.
          <div className="max-h-[18.25rem] overflow-auto" data-testid="wing-list">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-sm font-semibold text-slate-700">
                <tr className="h-12 border-b border-slate-200">
                  <Th>{t.officeReport.wingCol}</Th>
                  <Th className="text-right">{t.officeReport.totalCol}</Th>
                  <Th className="text-right">{t.officeReport.completedCol}</Th>
                  <Th className="text-right">{t.officeReport.cancelledCol}</Th>
                  <Th className="text-right">{t.officeReport.hoursCol}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {wings.map((w) => {
                  const name = names.pick(w.nameBn, w.nameEn);
                  return (
                    <tr key={w.id ?? "none"} className="h-12">
                      <Td className="py-2">
                        {w.id ? (
                          <button
                            type="button"
                            className="text-left font-medium text-brand-800 underline underline-offset-2 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-brand-700"
                            aria-label={t.officeReport.chooseWing(name)}
                            onClick={() => onChoose(w.id as string)}
                          >
                            {name}
                          </button>
                        ) : (
                          name
                        )}
                      </Td>
                      <Td className="py-2 text-right">{formatNumber(w.meetings)}</Td>
                      <Td className="py-2 text-right">{formatNumber(w.completed)}</Td>
                      <Td className="py-2 text-right">{formatNumber(w.cancelled)}</Td>
                      <Td className="py-2 text-right">{formatNumber(w.hours)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TopParticipants({ report }: { report: OfficeReport }) {
  const t = useT();
  const names = useNames();
  const { formatNumber } = useFormat();
  const office = report.scope === "OFFICE";
  return (
    <Card>
      <CardHeader title={t.officeReport.topTitle} />
      <CardBody className="space-y-2">
        {report.topParticipants.length === 0 ? (
          <EmptyState title={t.officeReport.empty} />
        ) : (
          <Table narrow data-testid="top-participants">
            <THead>
              <tr>
                <Th>{t.officeReport.nameCol}</Th>
                <Th className="text-right">{t.officeReport.meetingsCol}</Th>
                <Th className="text-right">{t.officeReport.hourCol}</Th>
              </tr>
            </THead>
            <TBody>
              {report.topParticipants.map((p) => (
                <Tr key={p.userId}>
                  <Td>
                    {names.pick(p.nameBn, p.nameEn)}
                    <span className="block text-xs text-slate-600">
                      {[
                        names.pickOptional(p.designationBn, p.designationEn),
                        office ? names.pickOptional(p.wingBn, p.wingEn) : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </Td>
                  <Td className="text-right">{formatNumber(p.meetings)}</Td>
                  <Td className="text-right">{formatNumber(p.hours)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <p className="text-xs text-slate-600">{t.officeReport.topNote}</p>
      </CardBody>
    </Card>
  );
}

function BusiestDays({ report }: { report: OfficeReport }) {
  const t = useT();
  const { formatNumber, formatPlainDate } = useFormat();
  return (
    <Card>
      <CardHeader title={t.officeReport.busiestTitle} />
      <CardBody>
        {report.busiestDays.length === 0 ? (
          <EmptyState title={t.officeReport.empty} />
        ) : (
          <Table narrow data-testid="busiest-days">
            <THead>
              <tr>
                <Th>{t.officeReport.dateCol}</Th>
                <Th className="text-right">{t.officeReport.meetingsCol}</Th>
                <Th className="text-right">{t.officeReport.hourCol}</Th>
              </tr>
            </THead>
            <TBody>
              {report.busiestDays.map((d) => (
                <Tr key={d.date}>
                  <Td>{formatPlainDate(d.date)}</Td>
                  <Td className="text-right">{formatNumber(d.meetings)}</Td>
                  <Td className="text-right">{formatNumber(d.hours)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function MeetingList({
  report,
  filter,
  wingScope,
  update,
}: {
  report: OfficeReport;
  filter: OfficeFilter;
  wingScope: boolean;
  update: (changes: Record<string, string | number | undefined>) => void;
}) {
  const t = useT();
  const names = useNames();
  const withRole = report.officer !== null;
  const all = { value: "", label: t.officeReport.all };
  const selectClass = "w-full sm:w-52";

  return (
    <Card>
      <CardHeader title={t.officeReport.listTitle} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-3" data-testid="meeting-list-filters">
          <div className={selectClass}>
            <Select
              id="office-report-status"
              label={t.officeReport.statusFilter}
              value={filter.status ?? ""}
              options={[all, ...STATUSES.map((s) => ({ value: s, label: t.meeting.status[s] }))]}
              onChange={(e) => update({ status: e.target.value })}
            />
          </div>
          {!wingScope && (
            <div className={selectClass}>
              <Select
                id="office-report-organizer-wing"
                label={t.officeReport.organizerWingFilter}
                value={filter.organizerWingId ?? ""}
                options={[
                  all,
                  ...report.filterOptions.organizerWings.map((w) => ({
                    value: w.id,
                    label: names.pick(w.nameBn, w.nameEn),
                  })),
                ]}
                onChange={(e) => update({ organizerWingId: e.target.value })}
              />
            </div>
          )}
          <div className={selectClass}>
            <Select
              id="office-report-chair"
              label={t.officeReport.chairFilter}
              value={filter.chair ?? ""}
              options={[
                all,
                ...report.filterOptions.chairs.map((c) => {
                  const designation = names.pickOptional(c.designationBn, c.designationEn);
                  const name = names.pick(c.nameBn, c.nameEn);
                  return { value: c.key, label: designation ? `${name} (${designation})` : name };
                }),
              ]}
              onChange={(e) => update({ chair: e.target.value })}
            />
          </div>
          {withRole && (
            <div className={selectClass}>
              <Select
                id="office-report-role"
                label={t.officeReport.roleFilter}
                value={filter.role ?? ""}
                options={[all, ...ROLES.map((r) => ({ value: r, label: t.meeting.myRole[r] }))]}
                onChange={(e) => update({ role: e.target.value })}
              />
            </div>
          )}
        </div>

        <OfficeMeetingsTable rows={report.meetings.items} withRole={withRole} />
      </CardBody>
      <Pagination
        page={report.meetings.page}
        totalPages={report.meetings.totalPages}
        onChange={(p) => update({ page: p })}
      />
    </Card>
  );
}

function OfficeMeetingsTable({ rows, withRole }: { rows: OfficeMeetingRow[]; withRole: boolean }) {
  const t = useT();
  const names = useNames();
  const { formatNumericDate, formatClock } = useFormat();
  if (rows.length === 0) return <EmptyState title={t.officeReport.empty} />;
  return (
    <Table data-testid="office-meetings">
      <THead>
        <tr>
          <Th>{t.officeReport.colDate}</Th>
          <Th>{t.officeReport.colTime}</Th>
          <Th>{t.officeReport.colTitle}</Th>
          <Th>{t.officeReport.colOrganizerWing}</Th>
          <Th>{t.officeReport.colChair}</Th>
          <Th>{t.officeReport.colVenue}</Th>
          {withRole && <Th>{t.officeReport.colRole}</Th>}
          <Th>{t.officeReport.colStatus}</Th>
          <Th className="w-14">
            <span className="sr-only">{t.rowMenu.column}</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((m) => (
          <Tr key={m.id}>
            <Td className="whitespace-nowrap">{formatNumericDate(m.startAt)}</Td>
            <Td className="whitespace-nowrap">{formatClock(m.startAt)}</Td>
            <Td className="font-medium text-slate-900">{m.title}</Td>
            <Td>
              {names.organizerFrom(
                m.organizerWingBn,
                m.organizerWingEn,
                m.organizerDesignationBn,
                m.organizerDesignationEn,
              )}
            </Td>
            <Td>{names.pickOptional(m.chairDesignationBn, m.chairDesignationEn) ?? "—"}</Td>
            <Td>{m.room ?? <span className="text-slate-600">{t.meeting.noRoom}</span>}</Td>
            {withRole && (
              <Td>
                <RoleBadge role={m.officerRole} />
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
                mode="officeReport"
              />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
