"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useRef, useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FieldLabel } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { noticesApi } from "@/lib/endpoints";
import { invalidateMeetingData } from "@/lib/invalidate";
import { noticeFileProblem } from "@/lib/notice-file";
import type { NoticeFile } from "@/lib/types";
import { useFormat, useT } from "@/providers/locale-provider";

/** v1.13: what the browser may offer in the file dialog (the backend decides by the bytes). */
export const NOTICE_ACCEPT =
  ".pdf,.docx,.jpg,.jpeg,.png,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";

const inputClass =
  "mt-2 block w-full text-sm text-slate-800 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50";

/**
 * The "সভার নোটিশ" / "Meeting notice" field of the meeting form (v1.13, SPEC.md §6.8, §13.6).
 * Shown only to the organizer. Optional, but the label never says so.
 * - create (`meetingId` undefined): the chosen file is handed to the form, which uploads it right
 *   after the meeting is saved;
 * - edit: the current file with Replace and Remove; Replace / a first upload is sent at once, Remove
 *   asks for confirmation. Both are separate from "Save Changes".
 * v1.21 part 3: `onFileChosen` reports every valid chosen file (both modes) for "নোটিশ থেকে পূরণ
 * করুন"; `children` (the fill button and its summary) are shown right under the file input.
 */
export function NoticeField({
  meetingId,
  current,
  onSelect,
  onFileChosen,
  children,
}: {
  meetingId?: string;
  current?: NoticeFile | null;
  /** create mode: the file to upload after saving (null = none / invalid). */
  onSelect?: (file: File | null) => void;
  /** v1.21: the last valid file chosen in this form (create and edit), null = none / invalid. */
  onFileChosen?: (file: File | null) => void;
  children?: ReactNode;
}) {
  const t = useT();
  const { formatFileSize } = useFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const upload = useMutation({
    mutationFn: (file: File) => noticesApi.upload(meetingId!, file),
    onSuccess: async () => {
      setReplacing(false);
      if (inputRef.current) inputRef.current.value = "";
      await invalidateMeetingData(queryClient);
      toast.show(t.notice.uploaded);
    },
  });
  const remove = useMutation({
    mutationFn: () => noticesApi.remove(meetingId!),
    onSuccess: async () => {
      setConfirmRemove(false);
      await invalidateMeetingData(queryClient);
      toast.show(t.notice.removed);
    },
  });

  function onChange(file: File | undefined) {
    upload.reset();
    const issue = file ? noticeFileProblem(file) : null;
    setProblem(issue === "type" ? t.notice.badType : issue === "size" ? t.notice.tooLarge : null);
    onFileChosen?.(file && !issue ? file : null);
    if (!meetingId) {
      onSelect?.(file && !issue ? file : null);
      return;
    }
    if (file && !issue) upload.mutate(file);
  }

  const showInput = !meetingId || !current || replacing;

  return (
    <div data-testid="notice-field">
      <FieldLabel htmlFor={inputId}>{t.notice.label}</FieldLabel>
      <p id={hintId} className="mt-1 text-sm text-slate-600">
        {t.notice.hint}
      </p>

      {meetingId && current && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-800">
          <span>
            {t.notice.current} <span className="font-medium">{current.originalName}</span> (
            {formatFileSize(current.size)})
          </span>
          {!replacing && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setReplacing(true)}>
              {t.notice.replace}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="text-red-700"
            onClick={() => setConfirmRemove(true)}
          >
            {t.notice.remove}
          </Button>
        </div>
      )}

      {showInput && (
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={NOTICE_ACCEPT}
          aria-describedby={hintId}
          disabled={upload.isPending}
          onChange={(e) => onChange(e.target.files?.[0])}
          className={inputClass}
        />
      )}
      {upload.isPending && (
        <p role="status" className="mt-1 text-sm text-slate-600">
          {t.notice.uploading}
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {problem}
        </p>
      )}
      {upload.isError && (
        <div className="mt-2">
          <ErrorAlert error={upload.error} />
        </div>
      )}
      {children}

      {meetingId && current && (
        <ConfirmModal
          open={confirmRemove}
          onClose={() => {
            setConfirmRemove(false);
            remove.reset();
          }}
          onConfirm={() => remove.mutate()}
          title={t.notice.removeTitle}
          confirmLabel={t.notice.remove}
          busy={remove.isPending}
          error={remove.isError ? remove.error : undefined}
          danger
        >
          <p>{t.notice.removeBody(current.originalName)}</p>
        </ConfirmModal>
      )}
    </div>
  );
}
