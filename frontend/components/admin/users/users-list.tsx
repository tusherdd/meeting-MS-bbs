"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { LoadingBlock } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { parseBool, useQueryParams } from "@/lib/hooks/use-query-params";
import {
  designationsApi,
  queryKeys,
  usersApi,
  wingsApi,
  type UserListQuery,
} from "@/lib/endpoints";
import { formatNumber } from "@/lib/format";
import type { Role } from "@/lib/types";
import { userActions } from "@/lib/user-policy";
import { t } from "@/messages";
import { useCurrentUser } from "@/providers/auth-provider";
import { ActiveBadge, DefaultPasswordBadge, ProtectedBadge, RoleBadge } from "./user-badges";

const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "OFFICER"];

/** /admin/users: search, filters (in the address), paginated table. */
export function UsersList() {
  const me = useCurrentUser();
  const { get, page, set } = useQueryParams();
  const [search, setSearch] = useState(get("q"));
  const debounced = useDebouncedValue(search.trim(), 400);

  // Typing updates the address after a short pause (page 1).
  useEffect(() => {
    if (debounced !== get("q")) set({ q: debounced });
  }, [debounced, get, set]);

  const role = get("role");
  const query: UserListQuery = {
    q: get("q") || undefined,
    wingId: get("wingId") || undefined,
    designationId: get("designationId") || undefined,
    role: ROLES.includes(role as Role) ? (role as Role) : undefined,
    isActive: parseBool(get("isActive")),
    passwordIsDefault: parseBool(get("passwordIsDefault")),
    page,
  };

  const users = useQuery({
    queryKey: queryKeys.users(query),
    queryFn: () => usersApi.list(query),
    placeholderData: keepPreviousData,
  });
  const wings = useQuery({ queryKey: queryKeys.allWings, queryFn: wingsApi.list });
  const designations = useQuery({
    queryKey: queryKeys.designations(false),
    queryFn: () => designationsApi.list(false),
  });

  const boolOptions = (yes: string, no: string) => [
    { value: "true", label: yes },
    { value: "false", label: no },
  ];
  const filtered =
    !!query.q ||
    !!query.wingId ||
    !!query.designationId ||
    !!query.role ||
    query.isActive !== undefined ||
    query.passwordIsDefault !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t.admin.usersTitle}</h1>
        <LinkButton href="/admin/users/new">{t.admin.newUser}</LinkButton>
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <Input
          id="users-search"
          type="search"
          label={t.admin.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            id="users-wing"
            label={t.admin.filterWing}
            placeholder={t.admin.all}
            value={get("wingId")}
            onChange={(e) => set({ wingId: e.target.value })}
            options={(wings.data ?? []).map((w) => ({ value: w.id, label: w.nameBn }))}
          />
          <Select
            id="users-designation"
            label={t.admin.filterDesignation}
            placeholder={t.admin.all}
            value={get("designationId")}
            onChange={(e) => set({ designationId: e.target.value })}
            options={(designations.data ?? []).map((d) => ({ value: d.id, label: d.nameBn }))}
          />
          <Select
            id="users-role"
            label={t.admin.filterRole}
            placeholder={t.admin.all}
            value={role}
            onChange={(e) => set({ role: e.target.value })}
            options={ROLES.map((r) => ({ value: r, label: t.roles[r] }))}
          />
          <Select
            id="users-active"
            label={t.admin.filterActive}
            placeholder={t.admin.all}
            value={get("isActive")}
            onChange={(e) => set({ isActive: e.target.value })}
            options={boolOptions(t.admin.active, t.admin.inactive)}
          />
          <Select
            id="users-default-password"
            label={t.admin.filterDefaultPassword}
            placeholder={t.admin.all}
            value={get("passwordIsDefault")}
            onChange={(e) => set({ passwordIsDefault: e.target.value })}
            options={boolOptions(t.admin.defaultYes, t.admin.defaultNo)}
          />
        </div>
        {filtered && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch("");
              set({
                q: "",
                wingId: "",
                designationId: "",
                role: "",
                isActive: "",
                passwordIsDefault: "",
              });
            }}
          >
            {t.admin.clearFilters}
          </Button>
        )}
      </Card>

      <Card>
        {users.isPending ? (
          <LoadingBlock />
        ) : users.isError ? (
          <div className="p-4">
            <ErrorAlert error={users.error} onRetry={() => void users.refetch()} />
          </div>
        ) : users.data.items.length === 0 ? (
          <EmptyState title={t.admin.usersEmpty} />
        ) : (
          <div aria-busy={users.isFetching}>
            <p className="px-4 pt-3 text-sm text-slate-600 sm:px-5">
              {t.admin.usersTotal(formatNumber(users.data.total))}
            </p>
            <Table data-testid="users-table">
              <THead>
                <tr>
                  <Th>{t.admin.colName}</Th>
                  <Th>{t.admin.colDesignation}</Th>
                  <Th>{t.admin.colWing}</Th>
                  <Th>{t.admin.colRole}</Th>
                  <Th>{t.admin.colActive}</Th>
                  <Th>{t.admin.colDefaultPassword}</Th>
                  <Th>{t.admin.actions}</Th>
                </tr>
              </THead>
              <TBody>
                {users.data.items.map((u) => {
                  const can = userActions(me, u);
                  return (
                    <Tr
                      key={u.id}
                      className={u.isActive ? undefined : "bg-slate-50 text-slate-600"}
                    >
                      <Td>
                        <span className="block font-semibold text-slate-900">
                          {u.nameBn}
                          {u.id === me.id && (
                            <span className="ml-2 text-xs font-normal text-slate-600">
                              ({t.admin.you})
                            </span>
                          )}
                        </span>
                        <span className="block text-xs break-all text-slate-600">
                          {u.loginEmail}
                        </span>
                      </Td>
                      <Td>
                        {u.designation?.nameBn ?? t.profile.none}
                        {u.designationRemark && (
                          <span className="block text-xs text-slate-600">
                            {u.designationRemark}
                          </span>
                        )}
                      </Td>
                      <Td>{u.wing?.nameBn ?? t.profile.none}</Td>
                      <Td>
                        <RoleBadge role={u.role} />
                      </Td>
                      <Td>
                        <ActiveBadge active={u.isActive} />
                      </Td>
                      <Td>
                        {u.role === "SUPER_ADMIN" ? (
                          t.profile.none
                        ) : (
                          <DefaultPasswordBadge isDefault={u.passwordIsDefault} />
                        )}
                      </Td>
                      <Td>
                        {can.protected ? (
                          <ProtectedBadge />
                        ) : (
                          <Link
                            href={`/admin/users/${u.id}`}
                            className="font-medium text-brand-700 hover:underline"
                            aria-label={`${t.admin.open}: ${u.nameBn}`}
                          >
                            {t.admin.open}
                          </Link>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
            <Pagination
              page={users.data.page}
              totalPages={users.data.totalPages}
              onChange={(p) => set({ page: p })}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
