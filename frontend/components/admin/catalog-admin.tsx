"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LoadingBlock } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { designationsApi, queryKeys, wingsApi } from "@/lib/endpoints";
import { formatNumber } from "@/lib/format";
import { designationFormSchema, wingFormSchema, type DesignationFormValues } from "@/lib/schemas";
import { toEnglishDigits } from "@/lib/phone";
import { t } from "@/messages";

/** One row of either list (a wing has no priority). */
interface Item {
  id: string;
  nameBn: string;
  nameEn: string;
  priority?: number;
  isActive: boolean;
  userCount: number;
}

type Kind = "designation" | "wing";

/** Both forms use the designation schema; for wings the priority field is hidden and ignored. */
type Values = DesignationFormValues;

function api(kind: Kind) {
  if (kind === "designation") {
    return {
      key: queryKeys.designations(false),
      list: () => designationsApi.list(false) as Promise<Item[]>,
      create: (v: Values) =>
        designationsApi.create({
          nameBn: v.nameBn.trim(),
          nameEn: v.nameEn.trim(),
          priority: Number(v.priority),
        }),
      update: (id: string, input: Partial<Item>) => designationsApi.update(id, input),
      remove: (id: string) => designationsApi.remove(id),
    };
  }
  return {
    key: queryKeys.allWings,
    list: () => wingsApi.list() as Promise<Item[]>,
    create: (v: Values) => wingsApi.create({ nameBn: v.nameBn.trim(), nameEn: v.nameEn.trim() }),
    update: (id: string, input: Partial<Item>) =>
      wingsApi.update(id, { nameBn: input.nameBn, nameEn: input.nameEn, isActive: input.isActive }),
    remove: (id: string) => wingsApi.remove(id),
  };
}

/** Accept Bangla digits in the priority field ("৬" → "6"). */
function normalizeValues(v: Values): Values {
  return { ...v, priority: toEnglishDigits(v.priority).trim() };
}

function ItemForm({
  kind,
  idPrefix,
  initial,
  submitLabel,
  busy,
  onSubmit,
}: {
  kind: Kind;
  idPrefix: string;
  initial: Values;
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: Values) => void;
}) {
  const withPriority = kind === "designation";
  const form = useForm<Values>({
    resolver: zodResolver(withPriority ? designationFormSchema : wingFormSchema),
    defaultValues: initial,
  });
  const errors = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((v) => onSubmit(normalizeValues(v)))}
    >
      <div className={withPriority ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
        <Input
          id={`${idPrefix}-nameBn`}
          label={t.admin.nameBn}
          required
          error={errors.nameBn?.message}
          {...form.register("nameBn")}
        />
        <Input
          id={`${idPrefix}-nameEn`}
          label={t.admin.nameEn}
          required
          error={errors.nameEn?.message}
          {...form.register("nameEn")}
        />
        {withPriority && (
          <Input
            id={`${idPrefix}-priority`}
            type="text"
            inputMode="numeric"
            label={t.admin.priority}
            required
            hint={t.admin.priorityHint}
            error={errors.priority?.message}
            {...form.register("priority", { setValueAs: (v: string) => toEnglishDigits(v) })}
          />
        )}
      </div>
      <Button type="submit" loading={busy} loadingText={t.common.working}>
        {submitLabel}
      </Button>
    </form>
  );
}

/**
 * /admin/designations and /admin/wings: list with user counts; create, edit (rename, priority),
 * activate / deactivate and delete (only when nobody uses it).
 */
export function CatalogAdmin({ kind }: { kind: Kind }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const a = api(kind);
  const withPriority = kind === "designation";
  const [editing, setEditing] = useState<Item | null>(null);
  const [deactivating, setDeactivating] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [createKey, setCreateKey] = useState(0);

  const list = useQuery({ queryKey: a.key, queryFn: a.list });

  // Designation changes also change the user list labels; wings likewise.
  const refresh = () =>
    Promise.all(
      [kind === "designation" ? "designations" : "wings", "users"].map((group) =>
        queryClient.invalidateQueries({ queryKey: [group] }),
      ),
    );

  const create = useMutation({
    mutationFn: a.create,
    onSuccess: async () => {
      toast.show(t.admin.createdItem);
      setCreateKey((k) => k + 1); // fresh, empty form
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Item> }) => a.update(id, input),
    onSuccess: async () => {
      toast.show(t.admin.savedItem);
      setEditing(null);
      setDeactivating(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => a.remove(id),
    onSuccess: async () => {
      toast.show(t.admin.deleted);
      setDeleting(null);
      await refresh();
    },
  });

  const title = withPriority ? t.admin.designationsTitle : t.admin.wingsTitle;
  const newTitle = withPriority ? t.admin.newDesignation : t.admin.newWing;
  const emptyValues: Values = { nameBn: "", nameEn: "", priority: "" };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {withPriority && (
        <Alert tone="info" title={t.admin.priorityExplain}>
          {t.admin.priorityKeepNote}
        </Alert>
      )}

      <Card>
        <CardHeader title={newTitle} />
        <CardBody className="space-y-3">
          {create.isError && <ErrorAlert error={create.error} />}
          <ItemForm
            key={createKey}
            kind={kind}
            idPrefix={`new-${kind}`}
            initial={emptyValues}
            submitLabel={t.admin.create}
            busy={create.isPending}
            onSubmit={(v) => create.mutate(v)}
          />
        </CardBody>
      </Card>

      <Card>
        {list.isPending ? (
          <LoadingBlock />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState title={withPriority ? t.admin.designationsEmpty : t.admin.wingsEmpty} />
        ) : (
          <Table data-testid={`${kind}-table`}>
            <THead>
              <tr>
                {withPriority && <Th className="w-28">{t.admin.priority}</Th>}
                <Th>{t.admin.nameBn}</Th>
                <Th>{t.admin.nameEn}</Th>
                <Th>{t.admin.userCount}</Th>
                <Th>{t.admin.status}</Th>
                <Th>{t.admin.actions}</Th>
              </tr>
            </THead>
            <TBody>
              {list.data.map((item) => {
                const deleteHintId = `${kind}-${item.id}-delete-hint`;
                return (
                  <Tr
                    key={item.id}
                    className={item.isActive ? undefined : "bg-slate-50 text-slate-600"}
                  >
                    {withPriority && (
                      <Td className="font-semibold">{formatNumber(item.priority ?? 0)}</Td>
                    )}
                    <Td className="font-medium text-slate-900">{item.nameBn}</Td>
                    <Td>{item.nameEn}</Td>
                    <Td>{formatNumber(item.userCount)}</Td>
                    <Td>
                      <Badge tone={item.isActive ? "green" : "neutral"}>
                        {item.isActive ? t.admin.active : t.admin.inactive}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={t.admin.editItem(item.nameBn)}
                          onClick={() => {
                            update.reset();
                            setEditing(item);
                          }}
                        >
                          {t.admin.edit}
                        </Button>
                        {item.isActive ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              update.reset();
                              setDeactivating(item);
                            }}
                          >
                            {t.admin.deactivateItem}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={update.isPending && update.variables?.id === item.id}
                            loadingText={t.common.working}
                            onClick={() =>
                              update.mutate({ id: item.id, input: { isActive: true } })
                            }
                          >
                            {t.admin.activateItem}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-red-700"
                          disabled={item.userCount > 0}
                          aria-describedby={item.userCount > 0 ? deleteHintId : undefined}
                          onClick={() => {
                            remove.reset();
                            setDeleting(item);
                          }}
                        >
                          {t.admin.delete}
                        </Button>
                      </div>
                      {item.userCount > 0 && (
                        <p id={deleteHintId} className="mt-1 max-w-xs text-xs text-slate-600">
                          {t.admin.deleteDisabled}
                        </p>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      {update.isError && !editing && !deactivating && <ErrorAlert error={update.error} />}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? t.admin.editItem(editing.nameBn) : ""}
      >
        {editing && (
          <div className="space-y-3">
            {withPriority && <p className="text-sm text-slate-700">{t.admin.priorityKeepNote}</p>}
            {update.isError && <ErrorAlert error={update.error} />}
            <ItemForm
              key={editing.id}
              kind={kind}
              idPrefix={`edit-${kind}`}
              initial={{
                nameBn: editing.nameBn,
                nameEn: editing.nameEn,
                priority: String(editing.priority ?? ""),
              }}
              submitLabel={t.common.save}
              busy={update.isPending}
              onSubmit={(v) =>
                update.mutate({
                  id: editing.id,
                  input: {
                    nameBn: v.nameBn.trim(),
                    nameEn: v.nameEn.trim(),
                    ...(withPriority ? { priority: Number(v.priority) } : {}),
                  },
                })
              }
            />
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() =>
          deactivating && update.mutate({ id: deactivating.id, input: { isActive: false } })
        }
        title={t.admin.deactivateItemTitle}
        confirmLabel={t.admin.deactivateItem}
        busy={update.isPending}
        error={update.error}
        danger
      >
        <p>{deactivating && t.admin.deactivateItemBody(deactivating.nameBn)}</p>
      </ConfirmModal>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={t.admin.deleteTitle}
        confirmLabel={t.admin.delete}
        busy={remove.isPending}
        error={remove.error}
        danger
      >
        <p>{deleting && t.admin.deleteBody(deleting.nameBn)}</p>
      </ConfirmModal>
    </div>
  );
}
