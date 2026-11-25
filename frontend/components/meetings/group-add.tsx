"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { designationsApi, peopleApi, queryKeys } from "@/lib/endpoints";
import { checkedIds, groupCandidates, groupLine, hasGroupFilter } from "@/lib/group-add";
import type { DirectoryEntry } from "@/lib/types";
import { useFormat, useNames, useT } from "@/providers/locale-provider";

interface Props {
  organizerId: string;
  selectedIds: ReadonlySet<string>;
  /** Adds the checked officers (the picker keeps the 200-people limit). */
  onAdd: (people: DirectoryEntry[]) => void;
  disabled: boolean;
}

/**
 * v1.20 group add (SPEC.md §13.6): pick a wing and / or a designation, see every matching
 * officer with a checkbox (all checked), uncheck anyone, then "নির্বাচিতদের যোগ করুন (N জন)".
 * Replaces the v1 "add the whole wing" button and its confirmation.
 */
export function GroupAdd({ organizerId, selectedIds, onAdd, disabled }: Props) {
  const t = useT();
  const names = useNames();
  const { formatNumber } = useFormat();
  const [wingId, setWingId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const filter = { wingId, designationId };
  const active = hasGroupFilter(filter);

  const wings = useQuery({
    queryKey: queryKeys.wings,
    queryFn: peopleApi.wings,
    staleTime: 5 * 60_000,
  });
  const designations = useQuery({
    queryKey: queryKeys.designations(true),
    queryFn: () => designationsApi.list(true),
    staleTime: 5 * 60_000,
  });
  const members = useQuery({
    queryKey: queryKeys.directoryGroup(wingId, designationId),
    queryFn: ({ signal }) =>
      peopleApi.groupMembers(
        { wingId: wingId || undefined, designationId: designationId || undefined },
        signal,
      ),
    enabled: active,
  });

  const candidates = useMemo(
    () => groupCandidates(members.data ?? [], organizerId, selectedIds),
    [members.data, organizerId, selectedIds],
  );
  const chosen = checkedIds(candidates, unchecked);
  const byId = new Map(candidates.map((e) => [e.id, e]));

  function changeFilter(next: { wingId?: string; designationId?: string }) {
    if (next.wingId !== undefined) setWingId(next.wingId);
    if (next.designationId !== undefined) setDesignationId(next.designationId);
    setUnchecked(new Set());
  }

  function toggle(id: string, checked: boolean) {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addChosen() {
    onAdd(chosen.map((id) => byId.get(id)!));
    // The list clears: both filters back to "all".
    changeFilter({ wingId: "", designationId: "" });
  }

  return (
    <fieldset className="rounded-lg border border-slate-200 p-3" data-testid="group-add">
      <legend className="px-1 text-sm font-semibold text-slate-800">{t.picker.group.title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          id="group-wing"
          label={t.picker.group.wing}
          value={wingId}
          onChange={(e) => changeFilter({ wingId: e.target.value })}
          placeholder={t.picker.group.allWings}
          options={(wings.data ?? []).map((w) => ({ value: w.id, label: names.of(w) }))}
        />
        <Select
          id="group-designation"
          label={t.picker.group.designation}
          value={designationId}
          onChange={(e) => changeFilter({ designationId: e.target.value })}
          placeholder={t.picker.group.allDesignations}
          options={(designations.data ?? []).map((d) => ({ value: d.id, label: names.of(d) }))}
        />
      </div>

      {active && (
        <div className="mt-3" aria-busy={members.isFetching}>
          {members.isPending ? (
            <div className="flex justify-center py-4 text-brand-700">
              <Spinner />
            </div>
          ) : members.isError ? (
            <ErrorAlert error={members.error} onRetry={() => void members.refetch()} />
          ) : candidates.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-600">{t.picker.group.none}</p>
          ) : (
            <>
              <ul
                aria-label={t.picker.group.list}
                className="max-h-72 divide-y divide-slate-100 overflow-y-auto"
                data-testid="group-results"
              >
                {candidates.map((e) => (
                  <li key={e.id} className="py-1.5">
                    <label className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand-700"
                        checked={!unchecked.has(e.id)}
                        onChange={(ev) => toggle(e.id, ev.target.checked)}
                      />
                      {groupLine(e, names, t.profile.chargeSuffix)}
                    </label>
                  </li>
                ))}
              </ul>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={addChosen}
                disabled={chosen.length === 0 || disabled}
              >
                {t.picker.group.addSelected(formatNumber(chosen.length))}
              </Button>
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
