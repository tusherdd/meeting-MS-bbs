"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { MeetingNotFound } from "@/components/meetings/meeting-detail-view";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { isApiError, saveBlob } from "@/lib/api";
import { decisionsApi, queryKeys } from "@/lib/endpoints";
import { invalidateMeetingData } from "@/lib/invalidate";
import type { DecisionDetail, DecisionFile } from "@/lib/types";
import { useFormat, useNames, useT } from "@/providers/locale-provider";
import { DecisionBadge } from "./decision-badge";

/** Client-side pre-check only (the server checks the bytes); by extension or browser type. */
const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

interface Progress {
  name: string;
  percent: number;
}

/**
 * /meetings/[id]/decision (v1.11, SPEC.md §13.19): meeting summary, decision status, upload
 * (several files, one request each, with progress) and the file list with View / Download /
 * Delete. Text only, no icons.
 */
export function DecisionView({ id }: { id: string }) {
  const t = useT();
  const decision = useQuery({
    queryKey: queryKeys.decision(id),
    queryFn: () => decisionsApi.detail(id),
  });

  if (decision.isPending) return <LoadingBlock />;
  if (decision.isError) {
    if (isApiError(decision.error) && [400, 404].includes(decision.error.status))
      return <MeetingNotFound />;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t.decisions.title}</h1>
        <ErrorAlert error={decision.error} onRetry={() => void decision.refetch()} />
      </div>
    );
  }
  return <DecisionContent id={id} data={decision.data} />;
}

function DecisionContent({ id, data }: { id: string; data: DecisionDetail }) {
  const t = useT();
  const names = useNames();
  const { formatDateWithWeekday, formatTimeRange } = useFormat();
  const m = data.meeting;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{t.decisions.title}</h1>
        <LinkButton href={`/meetings/${id}`} variant="secondary">
          {t.decisions.backToMeeting}
        </LinkButton>
      </div>

      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-slate-900">
            <Link href={`/meetings/${id}`} className="hover:underline">
              {m.title}
            </Link>
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="font-medium text-slate-600">{t.decisions.when}</dt>
            <dd className="text-slate-900">
              {formatDateWithWeekday(m.startAt)}, {formatTimeRange(m.startAt, m.endAt)}
            </dd>
            <dt className="font-medium text-slate-600">{t.decisions.venue}</dt>
            <dd className="text-slate-900">{m.room ?? t.meeting.noRoom}</dd>
            <dt className="font-medium text-slate-600">{t.decisions.organizer}</dt>
            <dd className="text-slate-900">{names.organizer(m.organizer)}</dd>
            <dt className="font-medium text-slate-600">{t.decisions.statusLabel}</dt>
            <dd>
              {data.status ? (
                <DecisionBadge status={data.status} />
              ) : (
                <span className="text-slate-600">
                  {m.status === "CANCELLED" ? t.decisions.cancelled : t.decisions.notStarted}
                </span>
              )}
            </dd>
          </dl>
        </CardBody>
      </Card>

      {data.canUpload ? (
        <UploadForm id={id} data={data} />
      ) : (
        data.uploadBlock === "tooMany" && <Alert tone="info">{t.decisions.limitReached}</Alert>
      )}

      <FileList id={id} files={data.files} />
    </div>
  );
}

function UploadForm({ id, data }: { id: string; data: DecisionDetail }) {
  const t = useT();
  const { formatNumber } = useFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const maxMb = formatNumber(data.maxFileMb);
  const left = data.maxFiles - data.files.length;

  function check(files: File[]): string[] {
    const problems: string[] = [];
    if (files.length > left) problems.push(t.decisions.tooMany(formatNumber(left)));
    for (const f of files) {
      if (!ALLOWED_TYPES.includes(f.type) && !ALLOWED_EXTENSIONS.test(f.name))
        problems.push(t.decisions.badType(f.name));
      else if (f.size > data.maxFileMb * 1024 * 1024)
        problems.push(t.decisions.tooLarge(f.name, maxMb));
    }
    return problems;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problems = check(selected);
    setErrors(problems);
    if (problems.length > 0 || selected.length === 0) return;
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    for (const file of selected) {
      setProgress({ name: file.name, percent: 0 });
      try {
        await decisionsApi.upload(id, file, (fraction) =>
          setProgress({ name: file.name, percent: Math.round(fraction * 100) }),
        );
        done++;
      } catch (err) {
        failures.push(isApiError(err) ? err.message : t.errors.unknown);
      }
    }
    setProgress(null);
    setBusy(false);
    setErrors(failures);
    setSelected([]);
    if (inputRef.current) inputRef.current.value = "";
    await invalidateMeetingData(queryClient);
    if (done > 0) toast.show(t.decisions.uploaded(formatNumber(done)));
  }

  return (
    <Card>
      <CardHeader title={t.decisions.uploadTitle} />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-3" data-testid="decision-upload">
          <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
              {t.decisions.pickLabel}
            </label>
            <p id={hintId} className="mt-1 text-sm text-slate-600">
              {t.decisions.pickHint(maxMb, formatNumber(data.maxFiles))}
            </p>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              multiple
              accept={ACCEPT}
              aria-describedby={hintId}
              disabled={busy}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setSelected(files);
                setErrors(check(files));
              }}
              className="mt-2 block w-full text-sm text-slate-800 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50"
            />
          </div>
          {progress && (
            <div aria-live="polite" className="space-y-1">
              <progress
                className="h-2 w-full accent-brand-700"
                max={100}
                value={progress.percent}
                aria-label={t.decisions.progress(progress.name, formatNumber(progress.percent))}
              />
              <p className="text-sm text-slate-700">
                {t.decisions.progress(progress.name, formatNumber(progress.percent))}
              </p>
            </div>
          )}
          {errors.length > 0 && (
            <div role="alert" className="space-y-1">
              {errors.map((message, i) => (
                <p key={i} className="text-sm text-red-700">
                  {message}
                </p>
              ))}
            </div>
          )}
          <Button
            type="submit"
            loading={busy}
            loadingText={t.decisions.uploading}
            disabled={selected.length === 0}
          >
            {t.decisions.uploadButton}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function FileList({ id, files }: { id: string; files: DecisionFile[] }) {
  const t = useT();
  const names = useNames();
  const { formatDateTime, formatFileSize } = useFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<DecisionFile | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const remove = useMutation({
    mutationFn: (fileId: string) => decisionsApi.remove(id, fileId),
    onSuccess: async () => {
      setToDelete(null);
      await invalidateMeetingData(queryClient);
      toast.show(t.decisions.deleted);
    },
  });

  async function onView(file: DecisionFile) {
    setActionError(null);
    // Open the tab during the click (popup blockers), then show the file in it.
    const tab = window.open("", "_blank");
    try {
      const { blob } = await decisionsApi.download(id, file.id, true);
      const url = URL.createObjectURL(new Blob([blob], { type: file.mime }));
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      setActionError(err);
    }
  }

  async function onDownload(file: DecisionFile) {
    setActionError(null);
    try {
      saveBlob(await decisionsApi.download(id, file.id));
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <Card>
      <CardHeader title={t.decisions.filesTitle} />
      {actionError !== null && (
        <div className="px-4 pt-3 sm:px-5">
          <ErrorAlert error={actionError} />
        </div>
      )}
      {files.length === 0 ? (
        <EmptyState title={t.decisions.noFiles} />
      ) : (
        <Table data-testid="decision-files">
          <THead>
            <tr>
              <Th>{t.decisions.colName}</Th>
              <Th>{t.decisions.colUploader}</Th>
              <Th>{t.decisions.colTime}</Th>
              <Th>{t.decisions.colSize}</Th>
              <Th>{t.decisions.colActions}</Th>
            </tr>
          </THead>
          <TBody>
            {files.map((f) => (
              <Tr key={f.id}>
                <Td className="font-medium">{f.originalName}</Td>
                <Td>{names.of(f.uploadedBy)}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(f.createdAt)}</Td>
                <Td className="whitespace-nowrap">{formatFileSize(f.size)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => void onView(f)}>
                      {t.decisions.view}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void onDownload(f)}>
                      {t.decisions.download}
                    </Button>
                    {f.canDelete && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-red-700"
                        onClick={() => {
                          remove.reset();
                          setToDelete(f);
                        }}
                      >
                        {t.decisions.delete}
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title={t.decisions.deleteTitle}
        confirmLabel={t.decisions.delete}
        busy={remove.isPending}
        error={remove.error}
        danger
      >
        {toDelete && <p className="text-sm text-slate-700">{t.decisions.deleteBody(toDelete.originalName)}</p>}
      </ConfirmModal>
    </Card>
  );
}
