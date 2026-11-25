"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { noticeExtractApi } from "@/lib/endpoints";
import {
  fillErrorKind,
  type FillErrorKind,
  type FillPerson,
  type FillPlan,
  type MaybeLine,
  type UnmatchedLine,
  planFill,
} from "@/lib/notice-fill";
import type { NoticeUnmatchedReason } from "@/lib/types";
import { useFormat, useNames, useT } from "@/providers/locale-provider";

/** A notice line handed to the guest-officer fields ("অতিথি হিসেবে যোগ করুন"). */
export interface GuestLine {
  text: string;
  name: string | null;
  designation: string | null;
}

interface Props {
  /** The valid file chosen in the notice field (null = none: the button is hidden). */
  file: File | null;
  organizerId: string;
  /** Participant ids already in the form (sure matches skip them). */
  participantIds: string[];
  maxPeople: number;
  /** Whether the form already holds the user's writing (then the in-page confirmation comes first). */
  hasValues: () => boolean;
  /** Put the plan into the form: fields, sure participants, the sure chair. Never saves. */
  onApply: (plan: FillPlan) => void;
  onAddPerson: (person: FillPerson) => void;
  /** Make an officer the chair (added to the participants first when needed). */
  onSetChair: (person: FillPerson) => void;
  onGuest: (line: GuestLine, asChair: boolean) => void;
}

type Status = "idle" | "confirm" | "working";

/**
 * v1.21 part 3 (SPEC.md §6.12, §13.6): "নোটিশ থেকে পূরণ করুন" under the notice field — the button,
 * "নোটিশ পড়া হচ্ছে…" with Cancel, the overwrite confirmation, the summary box (announced through
 * aria-live) and the review lists for the chair and the distribution list (সম্ভাব্য মিল, মেলেনি).
 * No client time limit: the server (OCR up to a minute per page, nginx 180 s) decides.
 */
export function NoticeFill({
  file,
  organizerId,
  participantIds,
  maxPeople,
  hasValues,
  onApply,
  onAddPerson,
  onSetChair,
  onGuest,
}: Props) {
  const t = useT();
  const f = t.noticeFill;
  const { digits } = useFormat();
  const names = useNames();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<{ kind: FillErrorKind; raw: unknown } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [plan, setPlan] = useState<FillPlan | null>(null);
  const [chairDone, setChairDone] = useState<string | null>(null); // the chosen chair's name
  const [chairOpen, setChairOpen] = useState(false); // maybe / unmatched chair still to decide
  const [maybe, setMaybe] = useState<MaybeLine[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedLine[]>([]);
  const [announce, setAnnounce] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the page cancels a running request.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (unavailable) return null;

  const person = (p: FillPerson) => {
    const extra = [names.maybe(p.designation), names.maybe(p.wing)].filter(Boolean).join(", ");
    return extra ? `${names.of(p)} (${extra})` : names.of(p);
  };

  function summaryText(p: FillPlan): string {
    const parts = [f.fields(digits(p.stats.fields))];
    if (p.stats.total > 0) {
      parts.push(
        f.people(
          digits(p.stats.total),
          digits(p.stats.sure),
          digits(p.stats.maybe),
          digits(p.stats.unmatched),
        ),
      );
    }
    parts.push(f.method(p.method === "AI" ? f.methodAi : f.methodOcr));
    return parts.join(" ");
  }

  async function run() {
    if (!file) return;
    setStatus("working");
    setError(null);
    setAnnounce(f.reading);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await noticeExtractApi.extract(file, controller.signal);
      const next = planFill(res, { organizerId, existingIds: participantIds, maxPeople });
      if (next.empty) {
        setError({ kind: "failed", raw: null });
        setAnnounce(f.failed);
        return;
      }
      onApply(next);
      setPlan(next);
      setMaybe(next.maybe);
      setUnmatched(next.unmatched);
      setChairOpen(next.chair.kind === "maybe" || next.chair.kind === "unmatched");
      setChairDone(next.chair.kind === "sure" ? names.of(next.chair.person) : null);
      setAnnounce(summaryText(next));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setAnnounce("");
        return;
      }
      const kind = fillErrorKind(err);
      if (kind === "unavailable") {
        setUnavailable(true);
        return;
      }
      setError({ kind, raw: err });
      setAnnounce(kind === "rateLimited" ? f.rateLimited : kind === "failed" ? f.failed : "");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStatus((s) => (s === "working" ? "idle" : s));
    }
  }

  function start() {
    if (hasValues()) setStatus("confirm");
    else void run();
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }

  const reasonText = (r: NoticeUnmatchedReason | null) =>
    r === "group"
      ? f.reason.group
      : r === "ambiguous"
        ? f.reason.ambiguous
        : r === "not-found"
          ? f.reason.notFound
          : null;

  const working = status === "working";

  return (
    <div className="mt-3 space-y-3" data-testid="notice-fill">
      {/* Always mounted so screen readers hear every change of the result. */}
      <div aria-live="polite" className="sr-only" data-testid="notice-fill-live">
        {announce}
      </div>

      {file && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={start}
            disabled={working}
            aria-busy={working || undefined}
          >
            {f.button}
          </Button>
          {working && (
            <>
              <span className="text-sm text-slate-700">{f.reading}</span>
              <Button variant="secondary" size="sm" onClick={cancel}>
                {f.cancel}
              </Button>
            </>
          )}
        </div>
      )}
      {working && <p className="text-xs text-slate-600">{f.readingHint}</p>}

      {error &&
        (error.kind === "failed" || error.kind === "rateLimited" ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error.kind === "failed" ? f.failed : f.rateLimited}
          </p>
        ) : (
          <ErrorAlert error={error.raw} />
        ))}

      {plan && (
        <div
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
          data-testid="notice-fill-summary"
        >
          <div>
            <p className="font-semibold">{f.summaryTitle}</p>
            <p data-testid="notice-fill-summary-text">{summaryText(plan)}</p>
            <p className="text-slate-600">{f.checkHint}</p>
          </div>
          {plan.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5" data-testid="notice-fill-warnings">
              {plan.warnings.map((w) => (
                <li key={w.code}>{f.warnings[w.code] ?? w.message}</li>
              ))}
            </ul>
          )}

          {(chairDone || chairOpen) && (
            <section aria-labelledby="notice-fill-chair" data-testid="notice-fill-chair">
              <h4 id="notice-fill-chair" className="font-semibold">
                {f.chairTitle}
              </h4>
              {chairDone && <p>{f.chairSet(chairDone)}</p>}
              {chairOpen && plan.chair.kind === "maybe" && (
                <div className="mt-1 space-y-2">
                  <p>{f.chairMaybe(plan.chair.text)}</p>
                  <div className="flex flex-wrap gap-2">
                    {plan.chair.candidates.map((c) => (
                      <Button
                        key={c.id}
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onSetChair(c);
                          setChairOpen(false);
                          setChairDone(names.of(c));
                          setAnnounce(f.chairSet(names.of(c)));
                        }}
                      >
                        {f.choose(person(c))}
                      </Button>
                    ))}
                    <Button variant="secondary" size="sm" onClick={() => setChairOpen(false)}>
                      {f.dismiss}
                    </Button>
                  </div>
                </div>
              )}
              {chairOpen && plan.chair.kind === "unmatched" && (
                <div className="mt-1 space-y-2">
                  <p>{f.chairUnmatched(plan.chair.text)}</p>
                  {reasonText(plan.chair.reason) && (
                    <p className="text-slate-600">{reasonText(plan.chair.reason)}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (plan.chair.kind !== "unmatched") return;
                        onGuest(plan.chair, true);
                        setChairOpen(false);
                      }}
                    >
                      {f.addAsGuest}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setChairOpen(false)}>
                      {f.dismiss}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {maybe.length > 0 && (
            <section aria-labelledby="notice-fill-maybe" data-testid="notice-fill-maybe">
              <h4 id="notice-fill-maybe" className="font-semibold">
                {f.maybeTitle}
              </h4>
              <ul className="mt-1 space-y-2">
                {maybe.map((m) => (
                  <li key={m.line} className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
                    <p className="break-words">{m.text}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.candidates.map((c) => (
                        <Button
                          key={c.id}
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            onAddPerson(c);
                            setMaybe((list) => list.filter((x) => x.line !== m.line));
                          }}
                        >
                          {f.addCandidate(person(c))}
                        </Button>
                      ))}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setMaybe((list) => list.filter((x) => x.line !== m.line))}
                      >
                        {f.dismiss}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {unmatched.length > 0 && (
            <section aria-labelledby="notice-fill-unmatched" data-testid="notice-fill-unmatched">
              <h4 id="notice-fill-unmatched" className="font-semibold">
                {f.unmatchedTitle}
              </h4>
              <ul className="mt-1 space-y-2">
                {unmatched.map((u) => (
                  <li key={u.line} className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
                    <p className="break-words">{u.text}</p>
                    {u.reason === "group" && (
                      <p className="text-slate-600">{reasonText(u.reason)}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onGuest(u, false);
                          setUnmatched((list) => list.filter((x) => x.line !== u.line));
                        }}
                      >
                        {f.addAsGuest}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setUnmatched((list) => list.filter((x) => x.line !== u.line))
                        }
                      >
                        {f.dismiss}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ConfirmModal
        open={status === "confirm"}
        onClose={() => setStatus("idle")}
        onConfirm={() => void run()}
        title={f.confirmTitle}
        confirmLabel={f.confirmOk}
        cancelLabel={f.cancel}
      >
        <p>{f.confirmBody}</p>
      </ConfirmModal>
    </div>
  );
}
