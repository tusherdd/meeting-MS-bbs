"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/dashboard/meeting-badges";
import { CancelMeetingModal } from "@/components/meetings/cancel-meeting-modal";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { formatDateTime, formatDateWithWeekday, formatNumber, formatTimeRange } from "@/lib/format";
import type { ConflictListItem, ConflictMeetingRef } from "@/lib/types";
import { t } from "@/messages";

function MeetingSide({
  label,
  meeting,
  tone,
}: {
  label: string;
  meeting: ConflictMeetingRef;
  tone: "higher" | "lower";
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border px-3 py-2.5",
        tone === "higher" ? "border-slate-200 bg-slate-50" : "border-amber-300 bg-amber-50",
      )}
    >
      <p className="text-xs font-semibold tracking-wide text-slate-500">
        {label}
        {meeting.organizedByMe && (
          <span className="ml-1 text-amber-800">· {t.conflictsPage.mine}</span>
        )}
      </p>
      <Link
        href={`/meetings/${meeting.id}`}
        className="mt-1 block font-semibold text-slate-900 hover:underline"
      >
        {meeting.title}
      </Link>
      <p className="text-sm text-slate-700">{formatDateWithWeekday(meeting.startAt)}</p>
      <p className="text-sm font-medium text-brand-800">
        {formatTimeRange(meeting.startAt, meeting.endAt)}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
        <StatusBadge status={meeting.status} />
        <span>
          {t.conflictsPage.priority} {formatNumber(meeting.priority)}
        </span>
        {meeting.organizerDesignation && <span>· {meeting.organizerDesignation}</span>}
      </div>
    </div>
  );
}

/** One conflict: the higher-priority meeting next to the overridden (lower) one. */
export function ConflictCard({ conflict }: { conflict: ConflictListItem }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const lower = conflict.lowerMeeting;
  const canAct =
    conflict.status === "PENDING" && lower.organizedByMe && lower.status === "SCHEDULED";

  return (
    <li
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="conflict-item"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          {t.conflictsPage.shared}{" "}
          <span className="font-medium text-slate-900">{conflict.officer.nameBn}</span>
        </p>
        <Badge tone={conflict.status === "PENDING" ? "red" : "neutral"}>
          {t.meetingDetail.conflictStatus[conflict.status]}
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MeetingSide
          label={t.conflictsPage.higher}
          meeting={conflict.higherMeeting}
          tone="higher"
        />
        <MeetingSide label={t.conflictsPage.lower} meeting={lower} tone="lower" />
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
            meetingTitle={lower.title}
            open={cancelOpen}
            onClose={() => setCancelOpen(false)}
          />
        </div>
      )}
    </li>
  );
}
