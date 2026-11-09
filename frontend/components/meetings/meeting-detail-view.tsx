"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConflictBadge, RoleBadge, StatusBadge } from "@/components/dashboard/meeting-badges";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { isApiError } from "@/lib/api";
import { meetingsApi, queryKeys } from "@/lib/endpoints";
import { formatDateTime, formatDateWithWeekday, formatNumber, formatTimeRange } from "@/lib/format";
import type { MeetingConflict, MeetingDetail } from "@/lib/types";
import { t } from "@/messages";
import { MeetingActions } from "./meeting-actions";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}

function personLine(p: { nameBn: string; designation: { nameBn: string } | null }) {
  return p.designation ? `${p.nameBn}, ${p.designation.nameBn}` : p.nameBn;
}

/** Shown for 404: the meeting does not exist or I am not one of its people. */
export function MeetingNotFound() {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <h1 className="text-xl font-semibold text-slate-900">{t.meetingDetail.notFound}</h1>
      <p className="text-slate-600">{t.meetingDetail.notFoundBody}</p>
      <LinkButton href="/meetings" variant="secondary">
        {t.meetingDetail.backToList}
      </LinkButton>
    </Card>
  );
}

function ConflictList({ title, items }: { title: string; items: MeetingConflict[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((c) => (
          <li key={c.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/meetings/${c.otherMeeting.id}`}
                className="font-medium text-slate-900 hover:underline"
              >
                {c.otherMeeting.title}
              </Link>
              <Badge tone={c.status === "PENDING" ? "red" : "neutral"}>
                {t.meetingDetail.conflictStatus[c.status]}
              </Badge>
            </div>
            <p className="text-slate-600">
              {formatDateTime(c.otherMeeting.startAt)} · {t.meetingDetail.priority}{" "}
              {formatNumber(c.otherMeeting.priority)}
              {c.otherMeeting.organizerDesignation && ` · ${c.otherMeeting.organizerDesignation}`}
            </p>
            <p className="text-slate-600">
              {t.meetingDetail.sharedOfficer} {c.officer.nameBn}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ meeting }: { meeting: MeetingDetail }) {
  const overrides = meeting.conflicts.filter((c) => c.relation === "HIGHER");
  const overriddenBy = meeting.conflicts.filter((c) => c.relation === "LOWER");
  const hasPending = meeting.conflicts.some((c) => c.status === "PENDING");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={meeting.status} />
            <RoleBadge role={meeting.myRole} />
            {hasPending && <ConflictBadge />}
          </div>
          <h1 className="mt-2 text-2xl font-semibold break-words text-slate-900">
            {meeting.title}
          </h1>
        </div>
        <MeetingActions meeting={meeting} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardBody>
              <dl className="divide-y divide-slate-100">
                <Row label={t.meetingDetail.when}>
                  {formatDateWithWeekday(meeting.startAt)}
                  <br />
                  <span className="font-medium text-brand-800">
                    {formatTimeRange(meeting.startAt, meeting.endAt)}
                  </span>
                </Row>
                <Row label={t.meetingDetail.room}>{meeting.room ?? "—"}</Row>
                <Row label={t.meetingDetail.link}>
                  {meeting.onlineLink ? (
                    <a
                      href={meeting.onlineLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-brand-700 underline"
                    >
                      {meeting.onlineLink}
                    </a>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row label={t.meetingDetail.organizer}>{personLine(meeting.organizer)}</Row>
                <Row label={t.meetingDetail.chair}>
                  {meeting.chair ? personLine(meeting.chair) : "—"}
                </Row>
                <Row label={t.meetingDetail.priority}>{formatNumber(meeting.priority)}</Row>
                {meeting.cancelReason && (
                  <Row label={t.meetingDetail.cancelReason}>{meeting.cancelReason}</Row>
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t.meetingDetail.agenda} />
            <CardBody>
              {meeting.agenda ? (
                <p className="whitespace-pre-wrap text-slate-800">{meeting.agenda}</p>
              ) : (
                <p className="text-slate-500">{t.meetingDetail.noAgenda}</p>
              )}
            </CardBody>
          </Card>

          {meeting.notes && (
            <Card>
              <CardHeader title={t.meetingDetail.notes} />
              <CardBody>
                <p className="whitespace-pre-wrap text-slate-800">{meeting.notes}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={t.meetingDetail.conflicts} />
            <CardBody className="space-y-4">
              {meeting.conflicts.length === 0 ? (
                <p className="text-slate-500">{t.meetingDetail.noConflicts}</p>
              ) : (
                <>
                  <ConflictList title={t.meetingDetail.overriddenBy} items={overriddenBy} />
                  <ConflictList title={t.meetingDetail.overrides} items={overrides} />
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader
            title={`${t.meetingDetail.people} (${formatNumber(meeting.participants.length)})`}
          />
          <ul className="divide-y divide-slate-100" data-testid="meeting-people">
            {meeting.participants.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{p.nameBn}</p>
                  <p className="text-xs text-slate-500">
                    {[p.designation?.nameBn, p.wing?.nameBn].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <RoleBadge role={p.role} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export function MeetingDetailView({ id }: { id: string }) {
  const meeting = useQuery({ queryKey: queryKeys.meeting(id), queryFn: () => meetingsApi.get(id) });
  if (meeting.isPending) return <LoadingBlock />;
  if (meeting.isError) {
    // Outsiders and unknown ids get 404 from the backend (existence is not revealed).
    if (
      isApiError(meeting.error) &&
      (meeting.error.status === 404 || meeting.error.status === 400)
    ) {
      return <MeetingNotFound />;
    }
    return <ErrorAlert error={meeting.error} onRetry={() => void meeting.refetch()} />;
  }
  return <Detail meeting={meeting.data} />;
}
