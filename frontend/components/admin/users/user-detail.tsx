"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { queryKeys, usersApi } from "@/lib/endpoints";
import { formatDateTime } from "@/lib/format";
import type { UserDetail as User } from "@/lib/types";
import { userActions } from "@/lib/user-policy";
import { t } from "@/messages";
import { useCurrentUser } from "@/providers/auth-provider";
import { ActiveBadge, DefaultPasswordBadge, ProtectedBadge, RoleBadge } from "./user-badges";
import { UserForm } from "./user-form";

type Action = "deactivate" | "activate" | "makeAdmin" | "removeAdmin" | "resetPassword";

/** /admin/users/:id: account status, the dangerous actions (with confirmation) and the edit form. */
export function UserDetailView({ id }: { id: string }) {
  const me = useCurrentUser();
  const created = useSearchParams().get("created") === "1";
  const user = useQuery({ queryKey: queryKeys.user(id), queryFn: () => usersApi.get(id) });

  if (user.isPending) return <LoadingBlock />;
  if (user.isError) {
    if (isApiError(user.error) && user.error.status === 404) {
      return (
        <EmptyState
          title={t.admin.userNotFound}
          action={<LinkButton href="/admin/users">{t.admin.backToUsers}</LinkButton>}
        />
      );
    }
    return <ErrorAlert error={user.error} onRetry={() => void user.refetch()} />;
  }
  const u = user.data;
  const can = userActions(me, u);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{u.nameBn}</h1>
        <LinkButton href="/admin/users" variant="secondary">
          {t.admin.backToUsers}
        </LinkButton>
      </div>
      {created && <Alert tone="success">{t.admin.created}</Alert>}

      <AccountCard user={u} isSelf={u.id === me.id} actions={can} />
      {can.edit && <UserForm key={u.updatedAt} user={u} />}
    </div>
  );
}

function AccountCard({
  user: u,
  isSelf,
  actions: can,
}: {
  user: User;
  isSelf: boolean;
  actions: ReturnType<typeof userActions>;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<Action | null>(null);

  const run = useMutation({
    mutationFn: async (a: Action) => {
      switch (a) {
        case "deactivate":
          return usersApi.setActive(u.id, false);
        case "activate":
          return usersApi.setActive(u.id, true);
        case "makeAdmin":
          return usersApi.setRole(u.id, "ADMIN");
        case "removeAdmin":
          return usersApi.setRole(u.id, "OFFICER");
        case "resetPassword":
          return usersApi.resetPassword(u.id);
      }
    },
    onSuccess: async (res) => {
      toast.show(
        res && "message" in res && typeof res.message === "string" ? res.message : t.admin.done,
      );
      setAction(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const open = (a: Action) => {
    run.reset();
    setAction(a);
  };

  const confirm: Record<Action, { title: string; body: string; label: string; danger: boolean }> = {
    deactivate: {
      title: t.admin.confirmDeactivateTitle,
      body: t.admin.confirmDeactivateBody(u.nameBn),
      label: t.admin.deactivate,
      danger: true,
    },
    activate: {
      title: t.admin.confirmActivateTitle,
      body: t.admin.confirmActivateBody(u.nameBn),
      label: t.admin.activate,
      danger: false,
    },
    makeAdmin: {
      title: t.admin.confirmMakeAdminTitle,
      body: t.admin.confirmMakeAdminBody(u.nameBn),
      label: t.admin.makeAdmin,
      danger: false,
    },
    removeAdmin: {
      title: t.admin.confirmRemoveAdminTitle,
      body: t.admin.confirmRemoveAdminBody(u.nameBn),
      label: t.admin.removeAdmin,
      danger: true,
    },
    resetPassword: {
      title: t.admin.confirmResetTitle,
      body: t.admin.confirmResetBody(u.nameBn),
      label: t.admin.resetPassword,
      danger: true,
    },
  };
  const current = action ? confirm[action] : null;

  return (
    <Card>
      <CardHeader
        title={t.admin.accountTitle}
        actions={can.protected ? <ProtectedBadge /> : undefined}
      />
      <CardBody className="space-y-4">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-600">{t.admin.loginEmail}</dt>
            <dd className="font-medium break-all">{u.loginEmail}</dd>
          </div>
          <div>
            <dt className="text-slate-600">{t.admin.role}</dt>
            <dd>
              <RoleBadge role={u.role} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">{t.admin.status}</dt>
            <dd>
              <ActiveBadge active={u.isActive} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">{t.admin.passwordDefault}</dt>
            <dd>
              <DefaultPasswordBadge isDefault={u.passwordIsDefault} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">{t.admin.lastLogin}</dt>
            <dd>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t.admin.never}</dd>
          </div>
          <div>
            <dt className="text-slate-600">{t.admin.createdAt}</dt>
            <dd>{formatDateTime(u.createdAt)}</dd>
          </div>
        </dl>

        {!can.protected && (
          <div className="flex flex-wrap gap-2" data-testid="user-actions">
            {can.status &&
              (u.isActive ? (
                <Button
                  variant="secondary"
                  className="text-red-700"
                  onClick={() => open("deactivate")}
                >
                  {t.admin.deactivate}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => open("activate")}>
                  {t.admin.activate}
                </Button>
              ))}
            {can.role &&
              (u.role === "ADMIN" ? (
                <Button
                  variant="secondary"
                  className="text-red-700"
                  onClick={() => open("removeAdmin")}
                >
                  {t.admin.removeAdmin}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => open("makeAdmin")}>
                  {t.admin.makeAdmin}
                </Button>
              ))}
            {can.resetPassword && (
              <Button variant="secondary" onClick={() => open("resetPassword")}>
                {t.admin.resetPassword}
              </Button>
            )}
          </div>
        )}
        {isSelf && <p className="text-sm text-slate-600">{t.admin.selfNote}</p>}

        <ConfirmModal
          open={current !== null}
          onClose={() => setAction(null)}
          onConfirm={() => action && run.mutate(action)}
          title={current?.title ?? ""}
          confirmLabel={current?.label ?? ""}
          danger={current?.danger}
          busy={run.isPending}
          error={run.error}
        >
          <p>{current?.body}</p>
        </ConfirmModal>
      </CardBody>
    </Card>
  );
}
