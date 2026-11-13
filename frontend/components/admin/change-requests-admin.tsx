"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  RequestStatusBadge,
  changeValueText,
} from "@/components/change-requests/change-request-parts";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useQueryParams } from "@/lib/hooks/use-query-params";
import { changeRequestsApi, queryKeys } from "@/lib/endpoints";
import { formatDateTime } from "@/lib/format";
import { rejectNoteSchema } from "@/lib/schemas";
import type { ChangeRequest, ChangeRequestStatus } from "@/lib/types";
import { t } from "@/messages";
import { useCurrentUser } from "@/providers/auth-provider";

const STATUSES: ChangeRequestStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

/** /admin/change-requests: tabs by status; approve (confirmation) / reject (note required). */
export function ChangeRequestsAdmin() {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { get, page, set } = useQueryParams();
  const raw = get("status") as ChangeRequestStatus;
  const status: ChangeRequestStatus = STATUSES.includes(raw) ? raw : "PENDING";
  const [approving, setApproving] = useState<ChangeRequest | null>(null);
  const [rejecting, setRejecting] = useState<ChangeRequest | null>(null);
  const [approveNote, setApproveNote] = useState("");

  const list = useQuery({
    queryKey: queryKeys.changeRequests(status, page),
    queryFn: () => changeRequestsApi.list(status, page),
    placeholderData: keepPreviousData,
  });

  const refresh = () =>
    Promise.all(
      ["change-requests", "admin", "users", "notifications"].map((g) =>
        queryClient.invalidateQueries({ queryKey: [g] }),
      ),
    );

  const approve = useMutation({
    mutationFn: (r: ChangeRequest) =>
      changeRequestsApi.approve(r.id, approveNote.trim() || undefined),
    onSuccess: async () => {
      toast.show(t.admin.approved);
      setApproving(null);
      setApproveNote("");
      await refresh();
    },
  });
  const reject = useMutation({
    mutationFn: ({ r, note }: { r: ChangeRequest; note: string }) =>
      changeRequestsApi.reject(r.id, note),
    onSuccess: async () => {
      toast.show(t.admin.rejected);
      setRejecting(null);
      await refresh();
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.admin.changeRequestsTitle}</h1>
      <Card>
        <div className="border-b border-slate-100 px-4 pt-3 sm:px-5">
          <Tabs
            id="change-requests"
            label={t.admin.changeRequestsTitle}
            items={STATUSES.map((s) => ({ key: s, label: t.admin.tabs[s] }))}
            value={status}
            onChange={(s) => set({ status: s === "PENDING" ? "" : s })}
          />
        </div>
        <div
          id="change-requests-panel"
          role="tabpanel"
          aria-labelledby={`change-requests-tab-${status}`}
        >
          {list.isPending ? (
            <LoadingBlock />
          ) : list.isError ? (
            <div className="p-4">
              <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />
            </div>
          ) : list.data.items.length === 0 ? (
            <EmptyState title={t.admin.requestsEmpty} />
          ) : (
            <div aria-busy={list.isFetching}>
              <Table data-testid="change-requests-table">
                <THead>
                  <tr>
                    <Th>{t.admin.requester}</Th>
                    <Th>{t.admin.requestType}</Th>
                    <Th>{t.admin.currentValue}</Th>
                    <Th>{t.admin.requestedValue}</Th>
                    <Th>{t.admin.requestedAt}</Th>
                    <Th>{t.admin.decision}</Th>
                  </tr>
                </THead>
                <TBody>
                  {list.data.items.map((r) => {
                    const own = r.requester.id === me.id;
                    return (
                      <Tr key={r.id}>
                        <Td>
                          <span className="block font-semibold text-slate-900">
                            {r.requester.nameBn}
                          </span>
                          <span className="block text-xs break-all text-slate-600">
                            {r.requester.loginEmail}
                          </span>
                        </Td>
                        <Td>{t.profile.type[r.type]}</Td>
                        <Td>{changeValueText(r.type, r.currentValue)}</Td>
                        <Td className="font-medium text-slate-900">
                          {changeValueText(r.type, r.requestedValue)}
                        </Td>
                        <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
                        <Td>
                          {r.status === "PENDING" ? (
                            own ? (
                              <p className="max-w-[14rem] text-sm text-slate-600">
                                {t.admin.ownRequest}
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  size="sm"
                                  aria-label={`${t.admin.approve}: ${r.requester.nameBn}`}
                                  onClick={() => {
                                    approve.reset();
                                    setApproveNote("");
                                    setApproving(r);
                                  }}
                                >
                                  {t.admin.approve}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="text-red-700"
                                  aria-label={`${t.admin.reject}: ${r.requester.nameBn}`}
                                  onClick={() => {
                                    reject.reset();
                                    setRejecting(r);
                                  }}
                                >
                                  {t.admin.reject}
                                </Button>
                              </div>
                            )
                          ) : (
                            <div className="space-y-1 text-sm">
                              <RequestStatusBadge status={r.status} />
                              {r.reviewedBy && r.reviewedAt && (
                                <p className="text-xs text-slate-600">
                                  {t.admin.reviewed(
                                    r.reviewedBy.nameBn,
                                    formatDateTime(r.reviewedAt),
                                  )}
                                </p>
                              )}
                              {r.reviewNote && <p className="text-slate-700">{r.reviewNote}</p>}
                            </div>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
              <Pagination
                page={list.data.page}
                totalPages={list.data.totalPages}
                onChange={(p) => set({ page: p })}
              />
            </div>
          )}
        </div>
      </Card>

      <ConfirmModal
        open={approving !== null}
        onClose={() => setApproving(null)}
        onConfirm={() => approving && approve.mutate(approving)}
        title={t.admin.approveTitle}
        confirmLabel={t.admin.approve}
        busy={approve.isPending}
        error={approve.error}
      >
        {approving && (
          <>
            <p>{t.admin.approveBody(approving.requester.nameBn)}</p>
            <p>
              {t.profile.type[approving.type]}:{" "}
              {t.admin.fromTo(
                changeValueText(approving.type, approving.currentValue),
                changeValueText(approving.type, approving.requestedValue),
              )}
            </p>
            <p className="text-slate-600">
              {approving.type === "LOGIN_EMAIL"
                ? t.admin.approveEmailNote
                : t.admin.approveDesignationNote}
            </p>
            <Textarea
              id="approve-note"
              label={t.admin.approveNote}
              rows={2}
              maxLength={1000}
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
            />
          </>
        )}
      </ConfirmModal>

      <RejectModal
        // A fresh form (empty reason) for every request.
        key={rejecting?.id ?? "none"}
        request={rejecting}
        onClose={() => setRejecting(null)}
        busy={reject.isPending}
        error={reject.error}
        onReject={(note) => rejecting && reject.mutate({ r: rejecting, note })}
      />
    </div>
  );
}

function RejectModal({
  request,
  onClose,
  onReject,
  busy,
  error,
}: {
  request: ChangeRequest | null;
  onClose: () => void;
  onReject: (note: string) => void;
  busy: boolean;
  error: unknown;
}) {
  const form = useForm<{ note: string }>({
    resolver: zodResolver(rejectNoteSchema),
    defaultValues: { note: "" },
  });
  return (
    <Modal
      open={request !== null}
      onClose={onClose}
      title={t.admin.rejectTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            type="submit"
            form="reject-form"
            loading={busy}
            loadingText={t.common.working}
          >
            {t.admin.reject}
          </Button>
        </>
      }
    >
      {request && (
        <form
          id="reject-form"
          noValidate
          className="space-y-3 text-sm"
          onSubmit={form.handleSubmit((v) => onReject(v.note.trim()))}
        >
          {error ? <ErrorAlert error={error} /> : null}
          <p>
            {request.requester.nameBn} — {t.profile.type[request.type]}:{" "}
            <span className="font-semibold">
              {changeValueText(request.type, request.requestedValue)}
            </span>
          </p>
          <Textarea
            id="reject-note"
            label={t.admin.rejectNote}
            hint={t.admin.rejectNoteHint}
            required
            rows={3}
            error={form.formState.errors.note?.message}
            {...form.register("note")}
          />
        </form>
      )}
    </Modal>
  );
}
