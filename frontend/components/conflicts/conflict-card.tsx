"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/dashboard/meeting-badges";
import { CancelMeetingModal } from "@/components/meetings/cancel-meeting-modal";
import { MeetingRowMenu } from "@/components/meetings/meeting-row-menu";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";

import { conflictCardActions } from "@/lib/row-actions";
import type { ConflictListItem, ConflictMeetingRef } from "@/lib/types";
import { useFormat, useNames, useT } from "@/providers/locale-provider";

/** v1.9: user pages show the organizer's wing (no wing → designation); admin pages the designation. */
export type ConflictOrganizerDisplay = "wing" | "designation";

function MeetingSide({
  label,
  meeting,
  tone,
  organizerAs,
}: {
  label: string;
  meeting: ConflictMeetingRef;
  tone: "higher" | "lower";
  organizerAs: ConflictOrganizerDisplay;
}) {
  const t = useT();
  const names = useNames();
  const { formatDateWithWeekday, formatTimeRange } = useFormat();
  return (
    <div
      className={clsx(
        "rounded-lg border px-3 py-2.5",
        tone === "higher" ? "border-slate-200 bg-slate-50" : "border-amber-300 bg-amber-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500">
          {label}
          {meeting.organizedByMe && (
            <span className="ml-1 text-amber-800">· {t.conflictsPage.mine}</span>
          )}
        </p>
        {/* v1.10: a meeting whose title is hidden from me cannot be opened, so it has no menu. */}
        {!meeting.titleHidden && (
          <div className="-mt-1 -mr-1">
            <MeetingRowMenu
              meeting={meeting}
              mine={meeting.organizedByMe || meeting.chairedByMe}
            />
          </div>
        )}
      </div>
      <Link
        href={`/meetings/${meeting.id}`}
        className="mt-1 block font-semibold text-slate-900 hover:underline"
      >
        {meeting.titleHidden ? t.meeting.hiddenTitle : meeting.title}
      </Link>
      <p className="text-sm text-slate-700">{formatDateWithWeekday(meeting.startAt)}</p>
      <p className="text-sm font-medium text-brand-800">
        {formatTimeRange(meeting.startAt, meeting.endAt)}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
        <StatusBadge status={meeting.status} />
        {organizerAs === "wing" ? (
          <span>
            {names.organizerFrom(
              meeting.organizerWing,
              meeting.organizerWingEn,
              meeting.organizerDesignation,
              meeting.organizerDesignationEn,
            )}
          </span>
        ) : (
          meeting.organizerDesignation && (
            <span>{names.pick(meeting.organizerDesignation, meeting.organizerDesignationEn)}</span>
          )
        )}
      </div>
    </div>
  );
}

/** One conflict: the higher-priority meeting next to the overridden (lower) one. */
export function ConflictCard({
  conflict,
  organizerAs = "wing",
}: {
  conflict: ConflictListItem;
  organizerAs?: ConflictOrganizerDisplay;
}) {
  const t = useT();
  const names = useNames();
  const { formatDateTime } = useFormat();
  const [cancelOpen, setCancelOpen] = useState(false);
  const lower = conflict.lowerMeeting;
  // v1.10: the internal chair cancels / reschedules like the organizer.
  const canAct = conflictCardActions(conflict);

  return (
    <li
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="conflict-item"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          {t.conflictsPage.shared}{" "}
          <span className="font-medium text-slate-900">{names.of(conflict.officer)}</span>
        </p>
        <Badge tone={conflict.status === "PENDING" ? "red" : "neutral"}>
          {t.meetingDetail.conflictStatus[conflict.status]}
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MeetingSide organizerAs={organizerAs}
          label={t.conflictsPage.higher}
          meeting={conflict.higherMeeting}
          tone="higher"
        />
        <MeetingSide organizerAs={organizerAs} label={t.conflictsPage.lower} meeting={lower} tone="lower" />
      </div>
      {conflict.resolvedAt && (
        <p className="mt-2 text-xs text-slate-500">
          {t.conflictsPage.resolvedAt} {formatDateTime(conflict.resolvedAt)}
        </p>
      )}
      {canAct && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
            {t.conflictsPage.cancelMine}
          </Button>
          <LinkButton href={`/meetings/${lower.id}/edit`} variant="secondary" size="sm">
            {t.conflictsPage.reschedule}
          </LinkButton>
          <CancelMeetingModal
            meetingId={lower.id}
            meetingTitle={lower.titleHidden ? t.meeting.hiddenTitle : lower.title}
            open={cancelOpen}
            onClose={() => setCancelOpen(false)}
          />
        </div>
      )}
    </li>
  );
}
