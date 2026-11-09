"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { isApiError } from "@/lib/api";
import { meetingsApi, queryKeys } from "@/lib/endpoints";
import { t } from "@/messages";
import { useCurrentUser, useAuth } from "@/providers/auth-provider";
import { meetingPermissions } from "./meeting-actions";
import { MeetingNotFound } from "./meeting-detail-view";
import { MeetingForm } from "./meeting-form";

export function EditMeeting({ id }: { id: string }) {
  const user = useCurrentUser();
  const { isAdmin } = useAuth();
  const meeting = useQuery({
    queryKey: queryKeys.meeting(id),
    queryFn: () => meetingsApi.get(id),
    // The form keeps its own copy; do not reset it while the user types.
    refetchOnWindowFocus: false,
  });

  if (meeting.isPending) return <LoadingBlock />;
  if (meeting.isError) {
    if (
      isApiError(meeting.error) &&
      (meeting.error.status === 404 || meeting.error.status === 400)
    ) {
      return <MeetingNotFound />;
    }
    return <ErrorAlert error={meeting.error} onRetry={() => void meeting.refetch()} />;
  }
  if (!meetingPermissions(meeting.data, user.id, isAdmin).edit) {
    return (
      <div className="space-y-4">
        <Alert tone="warning">{t.meetingForm.cannotEditEnded}</Alert>
        <LinkButton href={`/meetings/${id}`} variant="secondary">
          {t.meetingDetail.backToList}
        </LinkButton>
      </div>
    );
  }
  return <MeetingForm key={meeting.data.updatedAt} meeting={meeting.data} />;
}
