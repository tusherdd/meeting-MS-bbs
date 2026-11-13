"use client";

import { useQuery } from "@tanstack/react-query";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { profileApi, queryKeys } from "@/lib/endpoints";
import { formatDateTime, formatNumber } from "@/lib/format";
import { t } from "@/messages";
import { ChangeRequestsSection } from "./change-requests-section";
import { NotificationEmailSection } from "./notification-email-section";
import { PhotoSection } from "./photo-section";
import { ProfileForm } from "./profile-form";

/** /profile: my details, photo, notification email, change requests and password. */
export function ProfileView() {
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: profileApi.get });

  if (profile.isPending) return <LoadingBlock />;
  if (profile.isError) {
    return <ErrorAlert error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  const p = profile.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.profile.title}</h1>

      <Card>
        <CardBody>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-slate-600">{t.profile.nameBn}</dt>
              <dd className="font-semibold text-slate-900">{p.nameBn}</dd>
            </div>
            <div>
              <dt className="text-slate-600">{t.profile.loginEmail}</dt>
              <dd className="font-medium break-all text-slate-900">{p.loginEmail}</dd>
            </div>
            <div>
              <dt className="text-slate-600">{t.profile.role}</dt>
              <dd>
                <Badge tone={p.role === "OFFICER" ? "neutral" : "blue"}>{t.roles[p.role]}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">{t.profile.designation}</dt>
              <dd className="font-medium text-slate-900" data-testid="profile-designation">
                {p.designation
                  ? `${p.designation.nameBn}${p.designationRemark ? ` (${p.designationRemark})` : ""}`
                  : t.profile.none}
                {p.designation && (
                  <span className="ml-2 text-xs text-slate-600">
                    {t.profile.priority(formatNumber(p.designation.priority))}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">{t.profile.wing}</dt>
              <dd className="font-medium text-slate-900">{p.wing?.nameBn ?? t.profile.noWing}</dd>
            </div>
            <div>
              <dt className="text-slate-600">{t.profile.lastLogin}</dt>
              <dd className="text-slate-900">
                {p.lastLoginAt ? formatDateTime(p.lastLoginAt) : t.profile.none}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <ProfileForm key={p.updatedAt} profile={p} />
      <PhotoSection profile={p} />
      <NotificationEmailSection profile={p} />
      <ChangeRequestsSection profile={p} />
      <ChangePasswordForm embedded />
    </div>
  );
}
