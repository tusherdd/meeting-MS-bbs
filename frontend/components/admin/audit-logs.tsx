"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { LoadingBlock } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { auditChanges } from "@/lib/audit-diff";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useQueryParams } from "@/lib/hooks/use-query-params";
import { adminApi, queryKeys, usersApi, type AuditLogQuery } from "@/lib/endpoints";
import { formatDateTime } from "@/lib/format";
import { isPlainDate } from "@/lib/report-period";
import { dateRangeToIso } from "@/lib/time";
import type { AuditAction, AuditLogItem } from "@/lib/types";
import { t } from "@/messages";

const ACTIONS = Object.keys(t.admin.auditActions) as AuditAction[];

/** /admin/audit-logs: action, actor (search a user) and date filters; changed fields per entry. */
export function AuditLogs() {
  const { get, page, set } = useQueryParams();
  const [actorSearch, setActorSearch] = useState("");
  const debouncedSearch = useDebouncedValue(actorSearch.trim(), 400);

  const rawAction = get("action") as AuditAction;
  const action = ACTIONS.includes(rawAction) ? rawAction : undefined;
  const from = isPlainDate(get("from")) ? get("from") : "";
  const to = isPlainDate(get("to")) ? get("to") : "";
  const range = from || to ? dateRangeToIso(from || "2000-01-01", to || "2999-12-31") : null;

  const query: AuditLogQuery = {
    action,
    actorId: get("actorId") || undefined,
    from: from && range ? range.from : undefined,
    to: to && range ? range.to : undefined,
    page,
  };

  const logs = useQuery({
    queryKey: queryKeys.auditLogs(query),
    queryFn: () => adminApi.auditLogs(query),
    placeholderData: keepPreviousData,
  });
  // Actor search: the admin user list (name or email).
  const actors = useQuery({
    queryKey: queryKeys.users({ q: debouncedSearch, limit: 20 }),
    queryFn: () => usersApi.list({ q: debouncedSearch, limit: 20 }),
    enabled: debouncedSearch.length >= 2,
  });
  const selectedActor = useQuery({
    queryKey: queryKeys.user(get("actorId")),
    queryFn: () => usersApi.get(get("actorId")),
    enabled: !!get("actorId"),
  });

  const actorOptions = [
    ...(selectedActor.data
      ? [{ value: selectedActor.data.id, label: selectedActor.data.nameBn }]
      : []),
    ...(actors.data?.items ?? [])
      .filter((u) => u.id !== selectedActor.data?.id)
      .map((u) => ({ value: u.id, label: `${u.nameBn} (${u.loginEmail})` })),
  ];
  const filtered = !!(action || query.actorId || from || to);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.admin.auditTitle}</h1>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            id="audit-action"
            label={t.admin.auditAction}
            placeholder={t.admin.auditAllActions}
            value={action ?? ""}
            onChange={(e) => set({ action: e.target.value })}
            options={ACTIONS.map((a) => ({ value: a, label: t.admin.auditActions[a] }))}
          />
          <Input
            id="audit-actor-search"
            type="search"
            label={t.admin.auditActorSearch}
            value={actorSearch}
            onChange={(e) => setActorSearch(e.target.value)}
          />
          <Select
            id="audit-actor"
            label={t.admin.auditActor}
            placeholder={t.admin.auditActorAny}
            value={get("actorId")}
            onChange={(e) => set({ actorId: e.target.value })}
            options={actorOptions}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              id="audit-from"
              type="date"
              label={t.admin.auditFrom}
              value={from}
              onChange={(e) => set({ from: e.target.value })}
            />
            <Input
              id="audit-to"
              type="date"
              label={t.admin.auditTo}
              value={to}
              onChange={(e) => set({ to: e.target.value })}
            />
          </div>
        </div>
        {filtered && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setActorSearch("");
              set({ action: "", actorId: "", from: "", to: "" });
            }}
          >
            {t.admin.clearFilters}
          </Button>
        )}
      </Card>

      <Card>
        {logs.isPending ? (
          <LoadingBlock />
        ) : logs.isError ? (
          <div className="p-4">
            <ErrorAlert error={logs.error} onRetry={() => void logs.refetch()} />
          </div>
        ) : logs.data.items.length === 0 ? (
          <EmptyState title={t.admin.auditEmpty} />
        ) : (
          <div aria-busy={logs.isFetching}>
            <Table data-testid="audit-table">
              <THead>
                <tr>
                  <Th className="w-44">{t.admin.auditTime}</Th>
                  <Th>{t.admin.auditActor}</Th>
                  <Th>{t.admin.auditAction}</Th>
                  <Th>{t.admin.auditChanges}</Th>
                </tr>
              </THead>
              <TBody>
                {logs.data.items.map((log) => (
                  <AuditRow key={log.id} log={log} />
                ))}
              </TBody>
            </Table>
            <Pagination
              page={logs.data.page}
              totalPages={logs.data.totalPages}
              onChange={(p) => set({ page: p })}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditRow({ log }: { log: AuditLogItem }) {
  const changes = auditChanges(
    log.before as Record<string, unknown> | null,
    log.after as Record<string, unknown> | null,
    formatDateTime,
  );
  return (
    <Tr>
      <Td className="whitespace-nowrap">
        {formatDateTime(log.createdAt)}
        {log.ip && (
          <span className="block text-xs text-slate-600">
            {t.admin.auditIp}: <span className="font-mono">{log.ip}</span>
          </span>
        )}
      </Td>
      <Td>{log.actor?.nameBn ?? t.admin.auditSystem}</Td>
      <Td>
        <span className="block font-medium text-slate-900">{t.admin.auditActions[log.action]}</span>
        <span className="block text-xs text-slate-600">
          {t.admin.auditEntity}: {log.entityType}
          {log.entityId && <span className="font-mono"> {log.entityId.slice(0, 8)}</span>}
        </span>
      </Td>
      <Td>
        {changes.length === 0 ? (
          <span className="text-sm text-slate-500">{t.admin.auditNoChanges}</span>
        ) : (
          <dl className="space-y-1 text-sm">
            {changes.map((c) => (
              <div key={c.field} className="flex flex-wrap gap-x-2">
                <dt className="font-mono text-xs leading-6 text-slate-700">{c.field}:</dt>
                <dd className="min-w-0 break-words">
                  {c.before !== null && (
                    <span className="text-slate-600">
                      <span className="sr-only">{t.admin.auditBefore} </span>
                      <del className="decoration-slate-400">{c.before}</del>
                    </span>
                  )}
                  {c.before !== null && c.after !== null && (
                    <span className="mx-1 text-xs text-slate-500">{t.admin.auditAfter}:</span>
                  )}
                  {c.after !== null && (
                    <span className="font-medium text-slate-900">
                      {c.before === null && <span className="sr-only">{t.admin.auditAfter} </span>}
                      {c.after}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Td>
    </Tr>
  );
}
