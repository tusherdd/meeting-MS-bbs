"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { attachmentsApi, meetingsApi, noticesApi } from "@/lib/endpoints";
import { invalidateMeetingData } from "@/lib/invalidate";
import {
  DEFAULT_MEETING_MINUTES,
  durationMinutes,
  fromIso,
  moveEndWithStart,
  toIso,
} from "@/lib/meeting-time";
import { type MeetingFormValues } from "@/lib/schemas";
import { useSchemas } from "@/lib/hooks/use-schemas";
import { requiredFields } from "@/lib/required-fields";
import type { Clash, MeetingDetail } from "@/lib/types";
import { useNames, useT } from "@/providers/locale-provider";
import { useCurrentUser } from "@/providers/auth-provider";
import { ConflictPanel } from "./conflict-panel";
import {
  GUEST_CHAIR_PREFIX,
  GuestOfficers,
  guestChairValue,
  type GuestEntry,
} from "./guest-officers";
import { AttachmentsField, type PendingAttachment } from "./attachments-field";
import { NoticeField } from "./notice-field";
import { ParticipantPicker } from "./participant-picker";
import { fromParticipant, type SelectedPerson } from "./people";
import { clashingOfficerIds, useConflictCheck } from "./use-conflict-check";

interface Props {
  /** Edit mode when given. */
  meeting?: MeetingDetail;
  /** New meeting: prefilled Dhaka date and times (from the address or defaults). */
  initialSlot?: { date: string; start: string; end: string };
}

function initialValues(meeting?: MeetingDetail, slot?: Props["initialSlot"]): MeetingFormValues {
  if (meeting) {
    const start = fromIso(meeting.startAt);
    return {
      title: meeting.title,
      agenda: meeting.agenda ?? "",
      date: start.date,
      startTime: start.time,
      endTime: fromIso(meeting.endAt).time,
      room: meeting.room ?? "",
      onlineLink: meeting.onlineLink ?? "",
      // The chair select holds an officer id, or "guest:<email>" for a guest chair.
      chairId:
        meeting.chair?.id ??
        (meeting.guests.find((g) => g.isChair)
          ? guestChairValue(meeting.guests.find((g) => g.isChair)!.email)
          : ""),
      minutesRequired: meeting.minutesRequired,
    };
  }
  return {
    title: "",
    agenda: "",
    date: slot?.date ?? "",
    startTime: slot?.start ?? "",
    endTime: slot?.end ?? "",
    room: "",
    onlineLink: "",
    chairId: "",
    // v1.19: checked by default.
    minutesRequired: true,
  };
}

/** One form for /meetings/new and /meetings/[id]/edit. */
export function MeetingForm({ meeting, initialSlot }: Props) {
  const { meetingFormSchema } = useSchemas();
  const req = requiredFields(meetingFormSchema);
  const t = useT();
  const names = useNames();
  const me = useCurrentUser();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!meeting;
  const organizer = meeting?.organizer ?? { id: me.id, nameBn: me.nameBn, nameEn: me.nameEn };
  // v1.13: only the organizer sees the notice field (not the chair, not an admin editing).
  const isOrganizer = organizer.id === me.id;
  const [noticeFile, setNoticeFile] = useState<File | null>(null);
  // v1.17: "অন্যান্য সংযুক্তি" chosen on create, uploaded right after the meeting is saved.
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const [defaults] = useState(() => initialValues(meeting, initialSlot));
  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: defaults,
  });
  // v1.18: the end time follows the start time and keeps the current duration (45 min by default on
  // create, the stored duration on edit, or whatever the user set). Loading never changes the end time.
  const [timing, setTiming] = useState(() => ({
    prevStart: defaults.startTime,
    minutes: durationMinutes(defaults.startTime, defaults.endTime) ?? DEFAULT_MEETING_MINUTES,
  }));
  const onStartTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    const moved = moveEndWithStart(
      timing.prevStart,
      newStart,
      form.getValues("endTime"),
      timing.minutes,
    );
    setTiming({ prevStart: newStart, minutes: moved.minutes });
    if (moved.endTime !== null && moved.endTime !== form.getValues("endTime")) {
      form.setValue("endTime", moved.endTime, {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      });
    }
  };
  const { errors } = form.formState;
  const [people, setPeople] = useState<SelectedPerson[]>(() =>
    (meeting?.participants ?? []).filter((p) => p.id !== organizer.id).map(fromParticipant),
  );
  const [guests, setGuests] = useState<GuestEntry[]>(() =>
    (meeting?.guests ?? []).map((g) => ({
      name: g.name,
      designation: g.designation,
      email: g.email,
    })),
  );

  const [date, startTime, endTime, chairId] = useWatch({
    control: form.control,
    name: ["date", "startTime", "endTime", "chairId"],
  });
  const startAt = toIso(date, startTime);
  const endAt = toIso(date, endTime);
  const participantIds = useMemo(() => people.map((p) => p.id), [people]);

  // Priority numbers are never shown (v1.5); a SUPER_ADMIN (no designation) cannot organize.
  const cannotOrganize = !isEdit && me.priority === null;
  // Only an officer chair counts for the conflict check (a guest chair gives the organizer's priority).
  const officerChairId = chairId && !chairId.startsWith(GUEST_CHAIR_PREFIX) ? chairId : null;

  const check = useConflictCheck({
    startAt,
    endAt,
    participantIds,
    chairId: officerChairId,
    meetingId: meeting?.id,
    enabled: !cannotOrganize,
  });
  const clashing = clashingOfficerIds(check.state);
  const blocked = check.state.kind === "blocked";

  const save = useMutation({
    mutationFn: async (values: MeetingFormValues) => {
      const start = toIso(values.date, values.startTime)!;
      const end = toIso(values.date, values.endTime)!;
      const common = {
        title: values.title.trim(),
        agenda: values.agenda.trim() || null,
        room: values.room.trim(),
        onlineLink: values.onlineLink.trim() || null,
        minutesRequired: values.minutesRequired,
        chairId:
          values.chairId && !values.chairId.startsWith(GUEST_CHAIR_PREFIX) ? values.chairId : null,
        participantIds,
        guests: guests.map((g) => ({
          ...g,
          isChair: values.chairId === guestChairValue(g.email),
        })),
      };
      if (!meeting) return meetingsApi.create({ ...common, startAt: start, endAt: end });
      // Unchanged times are not sent (a meeting that already started may still be edited).
      const timeChanged =
        new Date(start).getTime() !== new Date(meeting.startAt).getTime() ||
        new Date(end).getTime() !== new Date(meeting.endAt).getTime();
      return meetingsApi.update(meeting.id, {
        ...common,
        ...(timeChanged ? { startAt: start, endAt: end } : {}),
      });
    },
    onSuccess: async (saved) => {
      // v1.13: on create, the notice is uploaded right after the meeting was saved. A failed
      // upload never undoes the meeting: the user is told and taken to the edit page to retry.
      let noticeFailed: unknown = null;
      if (!isEdit && noticeFile) {
        try {
          await noticesApi.upload(saved.id, noticeFile);
        } catch (err) {
          noticeFailed = err;
        }
      }
      // v1.17: then the other attachments, one request each; a failure keeps the meeting too.
      let attachmentFailed: unknown = null;
      if (!isEdit) {
        for (const a of pendingAttachments) {
          try {
            await attachmentsApi.upload(saved.id, a.name, a.file);
          } catch (err) {
            attachmentFailed ??= err;
          }
        }
      }
      await invalidateMeetingData(queryClient);
      if (noticeFailed !== null || attachmentFailed !== null) {
        const reasonOf = (err: unknown) => (err instanceof Error ? err.message : "");
        if (noticeFailed !== null)
          toast.show(t.notice.createFailed(reasonOf(noticeFailed)), "error");
        if (attachmentFailed !== null)
          toast.show(t.attachments.createFailed(reasonOf(attachmentFailed)), "error");
        router.push(`/meetings/${saved.id}/edit`);
        return;
      }
      toast.show(isEdit ? t.meetingForm.updated : t.meetingForm.created);
      router.push(`/meetings/${saved.id}`);
    },
    onError: (err) => {
      // Someone else booked meanwhile: show the returned clashes in the red panel; keep the data.
      if (isApiError(err) && err.status === 409 && Array.isArray(err.body?.blocking)) {
        check.reportServerBlock(err.body.blocking as Clash[]);
      }
    },
  });
  const showSaveError =
    save.isError &&
    !(isApiError(save.error) && save.error.status === 409 && save.error.body?.blocking);

  // The chair is chosen from the people of the meeting (organizer + selected) or the guests.
  const chairOptions = [
    { value: organizer.id, label: t.meetingForm.organizerOption(names.of(organizer)) },
    ...people.map((p) => ({ value: p.id, label: names.of(p) })),
    ...guests.map((g) => ({
      value: guestChairValue(g.email),
      label: t.meetingForm.guestOption(g.name),
    })),
  ];

  function onGuestsChange(next: GuestEntry[]) {
    setGuests(next);
    const chair = form.getValues("chairId");
    if (
      chair.startsWith(GUEST_CHAIR_PREFIX) &&
      !next.some((g) => guestChairValue(g.email) === chair)
    ) {
      form.setValue("chairId", ""); // the guest who chaired was removed
    }
  }

  function onPeopleChange(next: SelectedPerson[]) {
    setPeople(next);
    const chair = form.getValues("chairId");
    if (chair && chair !== organizer.id && !next.some((p) => p.id === chair)) {
      form.setValue("chairId", "");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        {isEdit ? t.meetingForm.editTitle : t.meetingForm.newTitle}
      </h1>

      {cannotOrganize && <Alert tone="error">{t.meetingForm.noDesignation}</Alert>}

      <form
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-4">
              <Input
                id="title"
                label={t.meetingForm.title}
                required={req.title}
                error={errors.title?.message}
                {...form.register("title")}
              />
              <Textarea
                id="agenda"
                label={t.meetingForm.agenda}
                hint={t.meetingForm.agendaHint}
                rows={4}
                error={errors.agenda?.message}
                {...form.register("agenda")}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  id="date"
                  type="date"
                  label={t.meetingForm.date}
                  required={req.date}
                  error={errors.date?.message}
                  {...form.register("date")}
                />
                <Input
                  id="startTime"
                  type="time"
                  step={300}
                  label={t.meetingForm.startTime}
                  required={req.startTime}
                  error={errors.startTime?.message}
                  {...form.register("startTime", { onChange: onStartTimeChange })}
                />
                <Input
                  id="endTime"
                  type="time"
                  step={300}
                  label={t.meetingForm.endTime}
                  required={req.endTime}
                  error={errors.endTime?.message}
                  {...form.register("endTime")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="room"
                  label={t.meetingForm.room}
                  required={req.room}
                  placeholder={t.meetingForm.roomPlaceholder}
                  error={errors.room?.message}
                  {...form.register("room")}
                />
                <Input
                  id="onlineLink"
                  type="url"
                  inputMode="url"
                  label={t.meetingForm.onlineLink}
                  hint={t.meetingForm.onlineLinkHint}
                  placeholder="https://"
                  error={errors.onlineLink?.message}
                  {...form.register("onlineLink")}
                />
              </div>
              {/* v1.19 (SPEC.md §6.9): minutes required yes / no; a checkbox, so no required mark. */}
              <label className="flex w-fit items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  id="minutesRequired"
                  type="checkbox"
                  className="size-4 accent-brand-700"
                  {...form.register("minutesRequired")}
                />
                {t.meetingForm.minutesRequired}
              </label>
              {isOrganizer && !cannotOrganize && (
                <NoticeField
                  meetingId={meeting?.id}
                  current={meeting?.notice ?? null}
                  onSelect={setNoticeFile}
                />
              )}
              {isOrganizer && !cannotOrganize && (
                <AttachmentsField
                  meetingId={meeting?.id}
                  pending={pendingAttachments}
                  onPendingChange={setPendingAttachments}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t.meetingForm.participants} />
            <CardBody className="space-y-4">
              <ParticipantPicker
                selected={people}
                onChange={onPeopleChange}
                organizerId={organizer.id}
                clashingIds={clashing}
              />
              <GuestOfficers guests={guests} onChange={onGuestsChange} />
              <Select
                id="chairId"
                label={t.meetingForm.chair}
                hint={t.meetingForm.chairHint}
                placeholder={t.meetingForm.noChair}
                options={chairOptions}
                {...form.register("chairId")}
              />
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardBody>
              <ConflictPanel state={check.state} />
            </CardBody>
          </Card>
          {showSaveError && <ErrorAlert error={save.error} />}
          {blocked && <p className="text-sm text-red-700">{t.meetingForm.blockedSubmit}</p>}
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              loading={save.isPending}
              loadingText={t.meetingForm.saving}
              disabled={blocked || cannotOrganize}
            >
              {isEdit ? t.meetingForm.saveChanges : t.meetingForm.create}
            </Button>
            <LinkButton href={isEdit ? `/meetings/${meeting.id}` : "/meetings"} variant="secondary">
              {t.common.cancel}
            </LinkButton>
          </div>
        </aside>
      </form>
    </div>
  );
}
