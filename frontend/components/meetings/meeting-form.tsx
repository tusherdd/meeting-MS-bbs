"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { meetingsApi } from "@/lib/endpoints";
import { formatNumber } from "@/lib/format";
import { invalidateMeetingData } from "@/lib/invalidate";
import { addMinutesToTime, fromIso, toIso } from "@/lib/meeting-time";
import { meetingFormSchema, type MeetingFormValues } from "@/lib/schemas";
import type { Clash, MeetingDetail } from "@/lib/types";
import { t } from "@/messages";
import { useCurrentUser } from "@/providers/auth-provider";
import { ConflictPanel } from "./conflict-panel";
import { ParticipantPicker } from "./participant-picker";
import { fromParticipant, type SelectedPerson } from "./people";
import { clashingOfficerIds, useConflictCheck } from "./use-conflict-check";

interface Props {
  /** Edit mode when given. */
  meeting?: MeetingDetail;
  /** New meeting: prefilled Dhaka date and times (from the calendar or defaults). */
  initialSlot?: { date: string; start: string; end: string };
}

const DURATIONS = [
  { minutes: 30, label: t.meetingForm.d30 },
  { minutes: 60, label: t.meetingForm.d60 },
  { minutes: 120, label: t.meetingForm.d120 },
];

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
      chairId: meeting.chair?.id ?? "",
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
  };
}

/** One form for /meetings/new and /meetings/[id]/edit. */
export function MeetingForm({ meeting, initialSlot }: Props) {
  const me = useCurrentUser();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!meeting;
  const organizer = meeting?.organizer ?? { id: me.id, nameBn: me.nameBn };

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: initialValues(meeting, initialSlot),
  });
  const { errors } = form.formState;
  const [people, setPeople] = useState<SelectedPerson[]>(() =>
    (meeting?.participants ?? []).filter((p) => p.id !== organizer.id).map(fromParticipant),
  );

  const [date, startTime, endTime, chairId] = useWatch({
    control: form.control,
    name: ["date", "startTime", "endTime", "chairId"],
  });
  const startAt = toIso(date, startTime);
  const endAt = toIso(date, endTime);
  const participantIds = useMemo(() => people.map((p) => p.id), [people]);

  // Priority shown before saving: my designation now (new) or the stored snapshot (edit).
  const priority = isEdit ? meeting.priority : me.priority;
  const priorityDesignation = isEdit
    ? (meeting.organizer.designation?.nameBn ?? "")
    : (me.designation?.nameBn ?? "");
  const cannotOrganize = !isEdit && priority === null;

  const check = useConflictCheck({
    startAt,
    endAt,
    participantIds,
    chairId: chairId || null,
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
        room: values.room.trim() || null,
        onlineLink: values.onlineLink.trim() || null,
        chairId: values.chairId || null,
        participantIds,
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
      await invalidateMeetingData(queryClient);
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

  function setDuration(minutes: number) {
    if (!startTime) return;
    form.setValue("endTime", addMinutesToTime(startTime, minutes), { shouldValidate: true });
  }

  // The chair is chosen from the people of the meeting (organizer + selected).
  const chairOptions = [
    { value: organizer.id, label: t.meetingForm.organizerOption(organizer.nameBn) },
    ...people.map((p) => ({ value: p.id, label: p.nameBn })),
  ];

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

      {cannotOrganize ? (
        <Alert tone="error">{t.meetingForm.noDesignation}</Alert>
      ) : (
        <Alert tone="info" className="flex flex-col gap-0.5">
          <p className="font-semibold" data-testid="meeting-priority">
            {isEdit
              ? t.meetingForm.priorityStored(formatNumber(priority ?? 0), priorityDesignation)
              : t.meetingForm.priorityMine(formatNumber(priority ?? 0), priorityDesignation)}
          </p>
          <p className="text-xs">{t.meetingForm.priorityHint}</p>
        </Alert>
      )}

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
                required
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
                  required
                  error={errors.date?.message}
                  {...form.register("date")}
                />
                <Input
                  id="startTime"
                  type="time"
                  step={300}
                  label={t.meetingForm.startTime}
                  required
                  error={errors.startTime?.message}
                  {...form.register("startTime")}
                />
                <Input
                  id="endTime"
                  type="time"
                  step={300}
                  label={t.meetingForm.endTime}
                  required
                  error={errors.endTime?.message}
                  {...form.register("endTime")}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-600">{t.meetingForm.duration}</span>
                {DURATIONS.map((d) => (
                  <Button
                    key={d.minutes}
                    variant="secondary"
                    size="sm"
                    onClick={() => setDuration(d.minutes)}
                    disabled={!startTime}
                  >
                    {d.label}
                  </Button>
                ))}
                <span className="text-xs text-slate-500">{t.meetingForm.timeHint}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="room"
                  label={t.meetingForm.room}
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
