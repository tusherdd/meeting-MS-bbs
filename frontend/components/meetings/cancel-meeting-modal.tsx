"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { meetingsApi } from "@/lib/endpoints";
import { invalidateMeetingData } from "@/lib/invalidate";
import { cancelReasonSchema, type CancelReasonForm } from "@/lib/schemas";
import { t } from "@/messages";

/** "Cancel meeting" with a required reason (used on the detail page and on /conflicts). */
export function CancelMeetingModal({
  meetingId,
  meetingTitle,
  open,
  onClose,
}: {
  meetingId: string;
  meetingTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<CancelReasonForm>({
    resolver: zodResolver(cancelReasonSchema),
    defaultValues: { reason: "" },
  });
  const cancel = useMutation({
    mutationFn: (values: CancelReasonForm) => meetingsApi.cancel(meetingId, values.reason.trim()),
    onSuccess: async () => {
      await invalidateMeetingData(queryClient);
      toast.show(t.meetingDetail.cancelled);
      form.reset();
      onClose();
    },
  });
  const formId = `cancel-${meetingId}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.meetingDetail.cancelTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.meetingDetail.keep}
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={cancel.isPending}>
            {t.meetingDetail.confirmCancel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-3"
        onSubmit={form.handleSubmit((values) => cancel.mutate(values))}
      >
        <p className="font-medium text-slate-900">{meetingTitle}</p>
        {cancel.isError && <ErrorAlert error={cancel.error} />}
        <Textarea
          id={`${formId}-reason`}
          label={t.meetingDetail.cancelReasonLabel}
          hint={t.meetingDetail.cancelReasonHint}
          required
          rows={3}
          error={form.formState.errors.reason?.message}
          {...form.register("reason")}
        />
      </form>
    </Modal>
  );
}
