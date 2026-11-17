"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { meetingsApi } from "@/lib/endpoints";
import { invalidateMeetingData } from "@/lib/invalidate";
import type { MeetingDetail } from "@/lib/types";
import { useT } from "@/providers/locale-provider";
import { useAuth } from "@/providers/auth-provider";
import { CancelMeetingModal } from "./cancel-meeting-modal";

const NOTES_MAX = 20_000;

/** What the current user may do with this meeting (the backend checks again). */
export function meetingPermissions(
  meeting: MeetingDetail,
  userId: string,
  isAdmin: boolean,
  now = new Date(),
) {
  const manage = isAdmin || meeting.organizer.id === userId;
  // v1.10: the internal chair may edit and cancel like the organizer (not complete).
  const editOrCancel = manage || meeting.chair?.id === userId;
  const scheduled = meeting.status === "SCHEDULED";
  return {
    edit: editOrCancel && scheduled && now < new Date(meeting.endAt),
    cancel: editOrCancel && scheduled,
    complete: manage && scheduled && now >= new Date(meeting.startAt),
    remove: isAdmin,
  };
}

export function MeetingActions({ meeting }: { meeting: MeetingDetail }) {
  const t = useT();
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<"cancel" | "complete" | "delete" | null>(null);
  const [notes, setNotes] = useState("");
  const [typedTitle, setTypedTitle] = useState("");
  const close = () => setModal(null);

  const complete = useMutation({
    mutationFn: () => meetingsApi.complete(meeting.id, notes.trim() || null),
    onSuccess: async () => {
      await invalidateMeetingData(queryClient);
      toast.show(t.meetingDetail.completed);
      close();
    },
  });
  const remove = useMutation({
    mutationFn: () => meetingsApi.remove(meeting.id),
    onSuccess: async () => {
      // Do not refetch the deleted meeting: drop it, then refresh the rest.
      queryClient.removeQueries({ queryKey: ["meetings", "detail", meeting.id] });
      await invalidateMeetingData(queryClient);
      toast.show(t.meetingDetail.deleted);
      router.push("/meetings");
    },
  });

  if (!user) return null;
  const can = meetingPermissions(meeting, user.id, isAdmin);
  if (!can.edit && !can.cancel && !can.complete && !can.remove) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && (
        <LinkButton href={`/meetings/${meeting.id}/edit`} variant="secondary">
          {t.meetingDetail.edit}
        </LinkButton>
      )}
      {can.complete && (
        <Button variant="secondary" onClick={() => setModal("complete")}>
          {t.meetingDetail.complete}
        </Button>
      )}
      {can.cancel && (
        <Button variant="secondary" className="text-red-700" onClick={() => setModal("cancel")}>
          {t.meetingDetail.cancel}
        </Button>
      )}
      {can.remove && (
        <Button variant="danger" onClick={() => setModal("delete")}>
          {t.meetingDetail.delete}
        </Button>
      )}

      <CancelMeetingModal
        meetingId={meeting.id}
        meetingTitle={meeting.title}
        open={modal === "cancel"}
        onClose={close}
      />

      <Modal
        open={modal === "complete"}
        onClose={close}
        title={t.meetingDetail.completeTitle}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t.meetingDetail.keep}
            </Button>
            <Button
              onClick={() => complete.mutate()}
              loading={complete.isPending}
              disabled={notes.length > NOTES_MAX}
            >
              {t.meetingDetail.confirmComplete}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {complete.isError && <ErrorAlert error={complete.error} />}
          <Textarea
            id="complete-notes"
            label={t.meetingDetail.notesLabel}
            hint={t.meetingDetail.notesHint}
            rows={8}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={notes.length > NOTES_MAX ? t.meetingDetail.notesTooLong : undefined}
          />
        </div>
      </Modal>

      <Modal
        open={modal === "delete"}
        onClose={close}
        title={t.meetingDetail.deleteTitle}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t.meetingDetail.keep}
            </Button>
            <Button
              variant="danger"
              onClick={() => remove.mutate()}
              loading={remove.isPending}
              disabled={typedTitle.trim() !== meeting.title.trim()}
            >
              {t.meetingDetail.confirmDelete}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {remove.isError && <ErrorAlert error={remove.error} />}
          <p className="text-sm text-slate-700">{t.meetingDetail.deleteBody}</p>
          <p className="rounded bg-slate-100 px-3 py-2 font-medium select-all">{meeting.title}</p>
          <Input
            id="delete-confirm"
            label={t.meetingDetail.deleteTypeLabel}
            value={typedTitle}
            onChange={(e) => setTypedTitle(e.target.value)}
            autoComplete="off"
          />
        </div>
      </Modal>
    </div>
  );
}
