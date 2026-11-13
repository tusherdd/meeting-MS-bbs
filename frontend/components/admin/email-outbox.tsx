"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { LoadingBlock } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useQueryParams } from "@/lib/hooks/use-query-params";
import { adminApi, queryKeys } from "@/lib/endpoints";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { EmailOutboxItem, EmailStatus } from "@/lib/types";
import { t } from "@/messages";

const STATUSES: EmailStatus[] = ["PENDING", "SENT", "FAILED"];
const tone: Record<EmailStatus, BadgeTone> = { PENDING: "amber", SENT: "green", FAILED: "red" };

/** /admin/email-outbox: mail queue with a status filter; FAILED mail can be retried. */
export function EmailOutbox() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { get, page, set } = useQueryParams();
  const raw = get("status") as EmailStatus;
  const status = STATUSES.includes(raw) ? raw : undefined;
  const [retrying, setRetrying] = useState<EmailOutboxItem | null>(null);

  const list = useQuery({
    queryKey: queryKeys.emailOutbox(status, page),
    queryFn: () => adminApi.emailOutbox(status, page),
    placeholderData: keepPreviousData,
  });
  const retry = useMutation({
    mutationFn: (id: string) => adminApi.retryEmail(id),
    onSuccess: async () => {
      toast.show(t.admin.retried);
      setRetrying(null);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.admin.outboxTitle}</h1>
      <Card>
        <div className="max-w-xs px-4 pt-4 sm:px-5">
          <Select
            id="outbox-status"
            label={t.admin.outboxFilter}
            placeholder={t.admin.all}
            value={status ?? ""}
            onChange={(e) => set({ status: e.target.value })}
            options={STATUSES.map((s) => ({ value: s, label: t.admin.outboxStatus[s] }))}
          />
        </div>
        {list.isPending ? (
          <LoadingBlock />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.items.length === 0 ? (
          <EmptyState title={t.admin.outboxEmpty} />
        ) : (
          <div aria-busy={list.isFetching} className="mt-4">
            <Table data-testid="outbox-table">
              <THead>
                <tr>
                  <Th>{t.admin.outboxTo}</Th>
                  <Th>{t.admin.outboxSubject}</Th>
                  <Th>{t.admin.status}</Th>
                  <Th>{t.admin.outboxAttempts}</Th>
                  <Th>{t.admin.outboxCreated}</Th>
                  <Th>{t.admin.actions}</Th>
                </tr>
              </THead>
              <TBody>
                {list.data.items.map((m) => (
                  <Tr key={m.id}>
                    <Td className="break-all">{m.to}</Td>
                    <Td>
                      {m.subject}
                      {m.lastError && (
                        <span className="mt-1 block text-xs text-red-700">
                          {t.admin.outboxLastError}:{" "}
                          <span className="font-mono">{m.lastError}</span>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={tone[m.status]}>{t.admin.outboxStatus[m.status]}</Badge>
                      <span className="mt-1 block text-xs text-slate-600">
                        {m.status === "SENT" && m.sentAt
                          ? `${t.admin.outboxSentAt}: ${formatDateTime(m.sentAt)}`
                          : m.status === "PENDING"
                            ? `${t.admin.outboxNextAttempt}: ${formatDateTime(m.nextAttemptAt)}`
                            : null}
                      </span>
                    </Td>
                    <Td>{formatNumber(m.attempts)}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(m.createdAt)}</Td>
                    <Td>
                      {m.status === "FAILED" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`${t.admin.retry}: ${m.to}`}
                          onClick={() => {
                            retry.reset();
                            setRetrying(m);
                          }}
                        >
                          {t.admin.retry}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={list.data.page}
              totalPages={list.data.totalPages}
              onChange={(p) => set({ page: p })}
            />
          </div>
        )}
      </Card>

      <ConfirmModal
        open={retrying !== null}
        onClose={() => setRetrying(null)}
        onConfirm={() => retrying && retry.mutate(retrying.id)}
        title={t.admin.retryTitle}
        confirmLabel={t.admin.retry}
        busy={retry.isPending}
        error={retry.error}
      >
        <p>{retrying && t.admin.retryBody(retrying.to)}</p>
      </ConfirmModal>
    </div>
  );
}
