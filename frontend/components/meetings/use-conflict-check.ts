"use client";

import { useEffect, useMemo, useState } from "react";
import { meetingsApi } from "@/lib/endpoints";
import type { Clash } from "@/lib/types";

export type ConflictCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "warn"; clashes: Clash[] }
  | { kind: "blocked"; clashes: Clash[]; meanwhile?: boolean }
  | { kind: "error"; error: unknown };

interface Input {
  startAt: string | null;
  endAt: string | null;
  participantIds: string[];
  chairId: string | null;
  /** On edit: the meeting itself never clashes with itself. */
  meetingId?: string;
  enabled: boolean;
}

export const CHECK_DEBOUNCE_MS = 600;
/** The title does not influence clashes; the dry run only needs a valid one. */
const CHECK_TITLE = "সংঘাত যাচাই";

/**
 * Live dry run of the conflict engine (POST /meetings/check-conflicts):
 * runs 600 ms after the time or the people last changed; an older request still in flight is
 * aborted, so a slow answer can never overwrite a newer one.
 * `reportServerBlock` shows a 409 from the real save (someone booked meanwhile) until the
 * time or the people change again.
 */
export function useConflictCheck(input: Input) {
  const { startAt, endAt, chairId, meetingId, enabled } = input;
  const people = useMemo(() => [...input.participantIds].sort(), [input.participantIds]);
  const ready = enabled && !!startAt && !!endAt && new Date(endAt) > new Date(startAt);
  const key = ready ? JSON.stringify([startAt, endAt, chairId, people]) : null;

  const [result, setResult] = useState<{ key: string; state: ConflictCheckState } | null>(null);
  const [serverBlock, setServerBlock] = useState<{ key: string | null; clashes: Clash[] } | null>(
    null,
  );

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await meetingsApi.checkConflicts(
          {
            title: CHECK_TITLE,
            startAt: startAt!,
            endAt: endAt!,
            chairId: chairId ?? undefined,
            participantIds: people,
            meetingId,
          },
          controller.signal,
        );
        const state: ConflictCheckState =
          res.blocking.length > 0
            ? { kind: "blocked", clashes: res.blocking }
            : res.willNotify.length > 0
              ? { kind: "warn", clashes: res.willNotify }
              : { kind: "ok" };
        setResult({ key, state });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({ key, state: { kind: "error", error } });
      }
    }, CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, startAt, endAt, chairId, people, meetingId]);

  let state: ConflictCheckState;
  if (serverBlock && serverBlock.key === key) {
    state = { kind: "blocked", clashes: serverBlock.clashes, meanwhile: true };
  } else if (!key) {
    state = { kind: "idle" };
  } else if (result?.key === key) {
    state = result.state;
  } else {
    state = { kind: "checking" };
  }

  return {
    state,
    reportServerBlock: (clashes: Clash[]) => setServerBlock({ key, clashes }),
  };
}

/** Officer ids that clash in a blocked state (their chips are highlighted). */
export function clashingOfficerIds(state: ConflictCheckState): Set<string> {
  if (state.kind !== "blocked") return new Set();
  return new Set(state.clashes.flatMap((c) => c.sharedOfficers.map((o) => o.id)));
}
