"use client";

import clsx from "clsx";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatNumber } from "@/lib/format";
import { peopleApi, queryKeys } from "@/lib/endpoints";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { t } from "@/messages";
import { fromDirectory, groupByWing, type SelectedPerson } from "./people";

const PAGE = 20;
const MAX_PEOPLE = 200;

interface Props {
  selected: SelectedPerson[];
  onChange: (people: SelectedPerson[]) => void;
  /** The organizer is always in the meeting and is not offered here. */
  organizerId: string;
  /** Officers that clash (red conflict panel): their chips are highlighted. */
  clashingIds: ReadonlySet<string>;
}

/**
 * Search the officer directory (GET /users/directory), add people as chips grouped by wing,
 * or add a whole wing after a confirmation that shows how many people it has.
 */
export function ParticipantPicker({ selected, onChange, organizerId, clashingIds }: Props) {
  const [search, setSearch] = useState("");
  const [wingId, setWingId] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [wingModal, setWingModal] = useState(false);
  const [addingWing, setAddingWing] = useState(false);
  const [wingError, setWingError] = useState<unknown>(null);
  const q = useDebouncedValue(search.trim(), 300);

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);

  const wings = useQuery({
    queryKey: queryKeys.wings,
    queryFn: peopleApi.wings,
    staleTime: 5 * 60_000,
  });
  const directoryQuery = { q: q || undefined, wingId: wingId || undefined, page: 1, limit };
  const results = useQuery({
    queryKey: queryKeys.directory(directoryQuery),
    queryFn: ({ signal }) => peopleApi.directory(directoryQuery, signal),
    placeholderData: keepPreviousData,
  });
  const wingCount = useQuery({
    queryKey: queryKeys.directory({ wingId, page: 1, limit: 1 }),
    queryFn: () => peopleApi.directory({ wingId, page: 1, limit: 1 }),
    enabled: wingModal && !!wingId,
  });

  const wingName = wings.data?.find((w) => w.id === wingId)?.nameBn ?? "";
  const full = selected.length >= MAX_PEOPLE;

  function add(person: SelectedPerson) {
    if (person.id === organizerId || selectedIds.has(person.id) || full) return;
    onChange([...selected, person]);
  }

  function remove(id: string) {
    onChange(selected.filter((p) => p.id !== id));
  }

  async function addWholeWing() {
    setAddingWing(true);
    setWingError(null);
    try {
      const members = await peopleApi.wingMembers(wingId);
      const next = [...selected];
      const ids = new Set(selectedIds);
      for (const m of members) {
        // Only officers with a designation can attend (the super admin account has none).
        if (m.id === organizerId || ids.has(m.id) || !m.designation) continue;
        if (next.length >= MAX_PEOPLE) break;
        next.push(fromDirectory(m));
        ids.add(m.id);
      }
      onChange(next);
      setWingModal(false);
    } catch (err) {
      setWingError(err);
    } finally {
      setAddingWing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Selected people */}
      <div>
        <p className="text-sm text-slate-600" aria-live="polite">
          {t.picker.selected(formatNumber(selected.length))}
        </p>
        {selected.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{t.picker.noneSelected}</p>
        ) : (
          <div className="mt-2 space-y-3" data-testid="selected-people">
            {groupByWing(selected, t.picker.noWing).map((group) => (
              <div key={group.wing}>
                <p className="text-xs font-semibold text-slate-500">{group.wing}</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {group.people.map((p) => {
                    const clash = clashingIds.has(p.id);
                    return (
                      <li
                        key={p.id}
                        data-clash={clash || undefined}
                        className={clsx(
                          "flex items-center gap-1.5 rounded-full py-1 pr-1 pl-3 text-sm ring-1",
                          clash
                            ? "bg-red-50 text-red-900 ring-2 ring-red-500"
                            : "bg-slate-50 text-slate-800 ring-slate-200",
                        )}
                      >
                        <span>
                          {p.nameBn}
                          {p.designationBn && (
                            <span className="text-slate-500">, {p.designationBn}</span>
                          )}
                          {clash && (
                            <span className="ml-1 font-semibold">({t.picker.clashing})</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          aria-label={t.picker.remove(p.nameBn)}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-white hover:text-red-700"
                        >
                          {t.picker.removeShort}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        {full && <p className="mt-2 text-sm text-red-700">{t.meetingForm.tooManyPeople}</p>}
      </div>

      {/* Search */}
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <Input
            id="people-search"
            label={t.picker.search}
            placeholder={t.picker.searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(PAGE);
            }}
            autoComplete="off"
          />
          <Select
            id="people-wing"
            label={t.picker.wing}
            value={wingId}
            onChange={(e) => {
              setWingId(e.target.value);
              setLimit(PAGE);
            }}
            placeholder={t.picker.allWings}
            options={(wings.data ?? []).map((w) => ({ value: w.id, label: w.nameBn }))}
          />
        </div>
        {wingId && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setWingModal(true)}
            disabled={full}
          >
            {t.picker.addWing}
          </Button>
        )}

        <div className="mt-3" aria-busy={results.isFetching}>
          {results.isPending ? (
            <div className="flex justify-center py-4 text-brand-700">
              <Spinner />
            </div>
          ) : results.isError ? (
            <ErrorAlert error={results.error} onRetry={() => void results.refetch()} />
          ) : results.data.items.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-500">{t.picker.noResults}</p>
          ) : (
            <>
              <ul
                className="max-h-72 divide-y divide-slate-100 overflow-y-auto"
                data-testid="people-results"
              >
                {results.data.items
                  .filter((e) => e.id !== organizerId)
                  .map((e) => {
                    const isAdded = selectedIds.has(e.id);
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2">
                        <Avatar photoPath={e.photoPath} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{e.nameBn}</p>
                          <p className="truncate text-xs text-slate-500">
                            {[e.designation?.nameBn, e.wing?.nameBn].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Button
                          variant={isAdded ? "ghost" : "secondary"}
                          size="sm"
                          disabled={isAdded || full || !e.designation}
                          onClick={() => add(fromDirectory(e))}
                          aria-label={`${e.nameBn}: ${isAdded ? t.picker.added : t.picker.add}`}
                        >
                          {isAdded ? t.picker.added : t.picker.add}
                        </Button>
                      </li>
                    );
                  })}
              </ul>
              {results.data.total > results.data.items.length && limit < 100 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setLimit((l) => Math.min(l + PAGE, 100))}
                >
                  {t.picker.more}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={wingModal}
        onClose={() => setWingModal(false)}
        title={t.picker.addWingTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => setWingModal(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={addWholeWing} loading={addingWing} disabled={!wingCount.data}>
              {t.picker.addWingConfirm}
            </Button>
          </>
        }
      >
        {wingError ? <ErrorAlert error={wingError} className="mb-3" /> : null}
        {wingCount.data ? (
          <p>{t.picker.addWingBody(wingName, formatNumber(wingCount.data.total))}</p>
        ) : wingCount.isError ? (
          <ErrorAlert error={wingCount.error} />
        ) : (
          <p className="flex items-center gap-2 text-slate-600">
            <Spinner /> {t.picker.countingWing}
          </p>
        )}
      </Modal>
    </div>
  );
}
