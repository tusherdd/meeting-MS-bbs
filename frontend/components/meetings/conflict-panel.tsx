import clsx from "clsx";
import { ErrorAlert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatNumber, formatTimeRange } from "@/lib/format";
import type { Clash } from "@/lib/types";
import { t } from "@/messages";
import type { ConflictCheckState } from "./use-conflict-check";

function ClashList({ clashes, blocking }: { clashes: Clash[]; blocking: boolean }) {
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
          {blocking && <p className="font-semibold">{c.title}</p>}
          {blocking ? (
            <p>
              {t.conflictPanel.organizer} {c.organizer.name}
              {c.organizer.designation && `, ${c.organizer.designation}`}
            </p>
          ) : (
            <p>
              {t.conflictPanel.organizerDesignation} {c.organizer.designation ?? "—"}
            </p>
          )}
          {blocking && (
            <p>
              {t.conflictPanel.priority} {formatNumber(c.priority)}
            </p>
          )}
          <p>
            {t.conflictPanel.shared} {c.sharedOfficers.map((o) => o.nameBn).join(", ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The three states of the live conflict check (plus idle / checking / error). */
export function ConflictPanel({ state }: { state: ConflictCheckState }) {
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
          <p className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true">✓</span> {t.conflictPanel.ok}
          </p>
          <p className="mt-1 text-sm">{t.conflictPanel.okBody}</p>
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
          <p className="mt-1 text-sm">{t.conflictPanel.blockedBody}</p>
          <ClashList clashes={state.clashes} blocking />
        </div>
      )}
    </section>
  );
}
