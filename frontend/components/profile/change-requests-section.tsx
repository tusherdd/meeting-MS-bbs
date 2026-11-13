"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  RequestStatusBadge,
  changeValueText,
} from "@/components/change-requests/change-request-parts";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingBlock } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { designationsApi, profileApi, queryKeys } from "@/lib/endpoints";
import { formatDateTime, formatNumber } from "@/lib/format";
import { loginEmailRequestSchema, type LoginEmailRequestValues } from "@/lib/schemas";
import type {
  ChangeRequest,
  ChangeRequestType,
  CreateChangeRequestInput,
  Profile,
} from "@/lib/types";
import { t } from "@/messages";

/** Login-email and designation change requests (admin approval) + my request history. */
export function ChangeRequestsSection({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [designationId, setDesignationId] = useState("");
  const [cancelling, setCancelling] = useState<ChangeRequest | null>(null);

  const requests = useQuery({
    queryKey: queryKeys.myChangeRequests,
    queryFn: profileApi.changeRequests,
  });
  const designations = useQuery({
    queryKey: queryKeys.designations(true),
    queryFn: () => designationsApi.list(true),
  });

  const emailForm = useForm<LoginEmailRequestValues>({
    resolver: zodResolver(loginEmailRequestSchema),
    defaultValues: { loginEmail: "" },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.myChangeRequests });

  const create = useMutation({
    mutationFn: (input: CreateChangeRequestInput) => profileApi.createChangeRequest(input),
    onSuccess: async (_res, input) => {
      toast.show(t.profile.requestSent);
      if (input.type === "LOGIN_EMAIL") emailForm.reset();
      else setDesignationId("");
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => profileApi.cancelChangeRequest(id),
    onSuccess: async () => {
      toast.show(t.profile.requestCancelled);
      setCancelling(null);
      await refresh();
    },
  });

  const pending = (type: ChangeRequestType) =>
    (requests.data ?? []).some((r) => r.type === type && r.status === "PENDING");
  const lastType = create.variables?.type;

  const designationChoices = (designations.data ?? [])
    .filter((d) => d.id !== profile.designation?.id)
    .map((d) => ({
      value: d.id,
      label: t.profile.designationOption(d.nameBn, formatNumber(d.priority)),
    }));

  return (
    <Card>
      <CardHeader title={t.profile.requestsTitle} />
      <CardBody className="space-y-6">
        <p className="text-sm text-slate-600">{t.profile.requestsHint}</p>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Login email */}
          <form
            noValidate
            className="space-y-3 rounded-lg border border-slate-200 p-4"
            onSubmit={emailForm.handleSubmit((v) =>
              create.mutate({ type: "LOGIN_EMAIL", loginEmail: v.loginEmail.trim().toLowerCase() }),
            )}
          >
            <p className="text-sm text-slate-700">
              {t.profile.loginEmail}: <span className="font-medium">{profile.loginEmail}</span>
            </p>
            <Input
              id="request-login-email"
              type="email"
              label={t.profile.loginEmailRequest}
              hint={t.profile.loginEmailNote}
              disabled={pending("LOGIN_EMAIL")}
              error={emailForm.formState.errors.loginEmail?.message}
              {...emailForm.register("loginEmail")}
            />
            {pending("LOGIN_EMAIL") && <Alert tone="info">{t.profile.pendingExists}</Alert>}
            {create.isError && lastType === "LOGIN_EMAIL" && <ErrorAlert error={create.error} />}
            <Button
              type="submit"
              disabled={pending("LOGIN_EMAIL")}
              loading={create.isPending && lastType === "LOGIN_EMAIL"}
              loadingText={t.common.working}
            >
              {t.profile.loginEmailSubmit}
            </Button>
          </form>

          {/* Designation */}
          <form
            noValidate
            className="space-y-3 rounded-lg border border-slate-200 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (designationId) create.mutate({ type: "DESIGNATION", designationId });
            }}
          >
            <p className="text-sm text-slate-700">
              {t.profile.designation}:{" "}
              <span className="font-medium">
                {profile.designation
                  ? t.profile.designationOption(
                      profile.designation.nameBn,
                      formatNumber(profile.designation.priority),
                    )
                  : t.profile.none}
              </span>
            </p>
            <Select
              id="request-designation"
              label={t.profile.designationRequest}
              hint={t.profile.designationNote}
              placeholder={t.profile.designationChoose}
              options={designationChoices}
              value={designationId}
              disabled={pending("DESIGNATION")}
              onChange={(e) => setDesignationId(e.target.value)}
            />
            {pending("DESIGNATION") && <Alert tone="info">{t.profile.pendingExists}</Alert>}
            {create.isError && lastType === "DESIGNATION" && <ErrorAlert error={create.error} />}
            <Button
              type="submit"
              disabled={!designationId || pending("DESIGNATION")}
              loading={create.isPending && lastType === "DESIGNATION"}
              loadingText={t.common.working}
            >
              {t.profile.designationSubmit}
            </Button>
          </form>
        </div>

        {/* History */}
        <section aria-labelledby="request-history-title" className="space-y-3">
          <h3 id="request-history-title" className="font-semibold text-slate-900">
            {t.profile.historyTitle}
          </h3>
          {requests.isPending ? (
            <LoadingBlock />
          ) : requests.isError ? (
            <ErrorAlert error={requests.error} onRetry={() => void requests.refetch()} />
          ) : requests.data.length === 0 ? (
            <EmptyState title={t.profile.historyEmpty} />
          ) : (
            <ul
              className="divide-y divide-slate-100 rounded-lg border border-slate-200"
              data-testid="request-history"
            >
              {requests.data.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      {t.profile.type[r.type]}
                      <RequestStatusBadge status={r.status} />
                    </p>
                    <p className="text-slate-700">
                      {t.profile.requested} {changeValueText(r.type, r.requestedValue)}
                    </p>
                    <p className="text-xs text-slate-600">
                      {t.profile.requestedAt} {formatDateTime(r.createdAt)}
                    </p>
                    {r.reviewNote && (
                      <p className="text-slate-700">
                        {t.profile.adminNote} {r.reviewNote}
                        {r.reviewedBy && r.reviewedAt && (
                          <span className="block text-xs text-slate-600">
                            {t.profile.reviewedBy(
                              r.reviewedBy.nameBn,
                              formatDateTime(r.reviewedAt),
                            )}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  {r.status === "PENDING" && (
                    <Button variant="secondary" size="sm" onClick={() => setCancelling(r)}>
                      {t.profile.cancelRequest}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <ConfirmModal
          open={cancelling !== null}
          onClose={() => setCancelling(null)}
          onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
          title={t.profile.cancelRequestTitle}
          confirmLabel={t.profile.cancelRequestConfirm}
          busy={cancel.isPending}
          error={cancel.error}
          danger
        >
          <p>{t.profile.cancelRequestBody}</p>
          {cancelling && (
            <p className="font-medium">
              {t.profile.type[cancelling.type]}:{" "}
              {changeValueText(cancelling.type, cancelling.requestedValue)}
            </p>
          )}
        </ConfirmModal>
      </CardBody>
    </Card>
  );
}
