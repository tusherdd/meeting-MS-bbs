"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  attachmentLabel,
  attachmentProblem,
  canAddAttachment,
  MAX_ATTACHMENTS,
} from "@/lib/attachments";
import { attachmentsApi, queryKeys } from "@/lib/endpoints";
import { invalidateMeetingData } from "@/lib/invalidate";
import { useT } from "@/providers/locale-provider";
import { NOTICE_ACCEPT } from "./notice-field";

/** create mode: a file waiting to be uploaded right after the meeting is saved. */
export interface PendingAttachment {
  key: string;
  name: string;
  file: File;
}

interface Row {
  key: string;
  name: string;
  fileName: string;
}

const inputClass =
  "mt-2 block w-full text-sm text-slate-800 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50";

let pendingSeq = 0;

/**
 * "অন্যান্য সংযুক্তি" / "Other attachments" (v1.17, SPEC.md §6.11, §13.6), directly below the notice
 * field; shown only to the organizer (like the notice).
 * - "ফাইলের নাম" / "File name", a file picker and "যোগ করুন" / "Add" (enabled only when both are
 *   valid); the list shows name, file name and "বাদ দিন" / "Remove"; at 5 files Add is disabled
 *   with the limit text.
 * - create (`meetingId` undefined): the list is local (`pending` / `onPendingChange`); the form
 *   uploads it right after the meeting is saved;
 * - edit: Add and Remove are sent at once (separate from "Save Changes").
 */
export function AttachmentsField({
  meetingId,
  pending = [],
  onPendingChange,
}: {
  meetingId?: string;
  pending?: PendingAttachment[];
  onPendingChange?: (next: PendingAttachment[]) => void;
}) {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const nameId = useId();
  const fileId = useId();
  const hintId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const saved = useQuery({
    queryKey: queryKeys.attachments(meetingId ?? ""),
    queryFn: () => attachmentsApi.list(meetingId!),
    enabled: !!meetingId,
  });

  const add = useMutation({
    mutationFn: (v: { name: string; file: File }) =>
      attachmentsApi.upload(meetingId!, v.name, v.file),
    onSuccess: async () => {
      clearInputs();
      await invalidateMeetingData(queryClient);
      toast.show(t.attachments.added);
    },
  });
  const remove = useMutation({
    mutationFn: (attachmentId: string) => attachmentsApi.remove(meetingId!, attachmentId),
    onSuccess: async () => {
      await invalidateMeetingData(queryClient);
      toast.show(t.attachments.removed);
    },
  });

  function clearInputs() {
    setName("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Edit: hidden unless the backend says I may manage them (organizer, not cancelled).
  if (meetingId && saved.data && !saved.data.canManage) return null;

  const rows: Row[] = meetingId
    ? (saved.data?.items ?? []).map((a) => ({ key: a.id, name: a.name, fileName: a.originalName }))
    : pending.map((p) => ({ key: p.key, name: p.name, fileName: p.file.name }));
  const count = rows.length;
  const atLimit = count >= MAX_ATTACHMENTS;
  const problem = attachmentProblem(name, file);
  // An optional sub-section (SPEC.md §13.6a exception): no required mark, but "Add" still needs a
  // valid name AND file (canAddAttachment → attachmentEntrySchema).
  const busy = add.isPending || remove.isPending || (!!meetingId && saved.isPending);
  const enabled = !busy && canAddAttachment(name, file, count);

  function onAdd() {
    if (!file || !canAddAttachment(name, file, count)) return;
    const label = attachmentLabel(name);
    if (meetingId) {
      add.mutate({ name: label, file });
      return;
    }
    pendingSeq += 1;
    onPendingChange?.([...pending, { key: `p${pendingSeq}`, name: label, file }]);
    clearInputs();
  }

  function onRemove(key: string) {
    if (meetingId) remove.mutate(key);
    else onPendingChange?.(pending.filter((p) => p.key !== key));
  }

  return (
    <fieldset data-testid="attachments-field" className="space-y-2">
      <legend className="block text-sm font-medium text-slate-800">{t.attachments.label}</legend>
      <p id={hintId} className="text-sm text-slate-600">
        {t.attachments.hint}
      </p>

      {rows.length > 0 && (
        <ul
          className="divide-y divide-slate-100 rounded-lg border border-slate-200"
          data-attachment-list
        >
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words text-slate-900">{r.name}</p>
                <p className="break-all text-slate-600">{r.fileName}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-red-700"
                disabled={busy}
                onClick={() => onRemove(r.key)}
              >
                {t.attachments.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {meetingId && saved.isError && <ErrorAlert error={saved.error} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id={nameId}
          label={t.attachments.nameLabel}
          value={name}
          maxLength={200}
          disabled={atLimit || busy}
          error={problem === "nameTooLong" ? t.attachments.nameTooLong : undefined}
          onChange={(e) => {
            add.reset();
            setName(e.target.value);
          }}
          onKeyDown={(e) => {
            // Enter adds the file instead of submitting the whole meeting form.
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <div>
          <FieldLabel htmlFor={fileId}>{t.attachments.fileLabel}</FieldLabel>
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept={NOTICE_ACCEPT}
            aria-describedby={hintId}
            disabled={atLimit || busy}
            onChange={(e) => {
              add.reset();
              setFile(e.target.files?.[0] ?? null);
            }}
            className={inputClass}
          />
        </div>
      </div>
      {(problem === "type" || problem === "size") && (
        <p role="alert" className="text-sm text-red-700">
          {problem === "type" ? t.notice.badType : t.notice.tooLarge}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!enabled}
          loading={add.isPending}
          loadingText={t.attachments.adding}
          onClick={onAdd}
        >
          {t.attachments.add}
        </Button>
        {atLimit && (
          <p role="status" className="text-sm text-slate-600">
            {t.attachments.limit}
          </p>
        )}
      </div>
      {add.isError && <ErrorAlert error={add.error} />}
      {remove.isError && <ErrorAlert error={remove.error} />}
    </fieldset>
  );
}
