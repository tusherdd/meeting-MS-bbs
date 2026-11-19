"use client";

import clsx from "clsx";
import { ErrorAlert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

import type { Clash } from "@/lib/types";
import { useFormat, useNames, useT } from "@/providers/locale-provider";
import type { ConflictCheckState } from "./use-conflict-check";

function ClashList({ clashes, blocking }: { clashes: Clash[]; blocking: boolean }) {
  const t = useT();
  const names = useNames();
  const { formatDate, formatTimeRange } = useFormat();
  return (
    <ul className="mt-3 space-y-2">
      {clashes.map((c) => (
        <li
          key={c.meetingId}
          className={clsx(
            "rounded-lg bg-white/80 px-3 py-2 text-sm ring-1",
            blocking ? "ring-red-200" : "ring-amber-200",
          )}
        >
          <p className="font-medium">
            {formatDate(c.startAt)}, {formatTimeRange(c.startAt, c.endAt)}
          </p>
          {blocking && (
            <p className="font-semibold">{c.titleHidden ? t.meeting.hiddenTitle : c.title}</p>
          )}
          {/* v1.9: the organizer is shown as their wing (no wing → designation). */}
          <p>
            {t.conflictPanel.organizer}{" "}
            {names.organizerFrom(
              c.organizer.wing,
              c.organizer.wingEn,
              c.organizer.designation,
              c.organizer.designationEn,
            )}
          </p>
          <p>
            {t.conflictPanel.shared} {c.sharedOfficers.map((o) => names.of(o)).join(", ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Which lead of this meeting is busy (SPEC.md §6.4, v1.13). A clash without `blockedBy` (older
 * backend) counts as the organizer.
 */
export function blockedRoles(clashes: readonly Clash[]): { organizer: boolean; chair: boolean } {
  const roles = clashes.flatMap((c) => (c.blockedBy?.length ? c.blockedBy : ["ORGANIZER"]));
  return { organizer: roles.includes("ORGANIZER"), chair: roles.includes("CHAIR") };
}

/** The three states of the live conflict check (plus idle / checking / error). */
export function ConflictPanel({ state }: { state: ConflictCheckState }) {
  const t = useT();
  return (
    <section
      aria-labelledby="conflict-panel-title"
      aria-live="polite"
      data-testid="conflict-panel"
      data-state={state.kind}
    >
      <h2 id="conflict-panel-title" className="mb-2 text-sm font-semibold text-slate-700">
        {t.conflictPanel.title}
      </h2>
      {state.kind === "idle" && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t.conflictPanel.idle}
        </p>
      )}
      {state.kind === "checking" && (
        <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Spinner /> {t.conflictPanel.checking}
        </p>
      )}
      {state.kind === "error" && (
        <div>
          <p className="mb-2 text-sm text-slate-600">{t.conflictPanel.error}</p>
          <ErrorAlert error={state.error} />
        </div>
      )}
      {state.kind === "ok" && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900">
          <p className="text-sm">{t.conflictPanel.okBody}</p>
        </div>
      )}
      {state.kind === "warn" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          <p className="font-semibold">{t.conflictPanel.warnTitle}</p>
          <p className="mt-1 text-sm">{t.conflictPanel.warnBody}</p>
          <ClashList clashes={state.clashes} blocking={false} />
        </div>
      )}
      {state.kind === "blocked" && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-950"
        >
          <p className="font-semibold">{t.conflictPanel.blockedTitle}</p>
          {state.meanwhile && (
            <p className="mt-1 text-sm font-medium">{t.conflictPanel.takenMeanwhile}</p>
          )}
          {/* v1.13: the organizer and/or the internal chair may be the busy lead. */}
          {blockedRoles(state.clashes).organizer && (
            <p className="mt-1 text-sm">{t.conflictPanel.blockedBody}</p>
          )}
          {blockedRoles(state.clashes).chair && (
            <p className="mt-1 text-sm">{t.conflictPanel.blockedBodyChair}</p>
          )}
          <ClashList clashes={state.clashes} blocking />
        </div>
      )}
    </section>
  );
}
