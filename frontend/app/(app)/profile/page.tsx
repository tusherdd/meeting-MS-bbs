import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.profile.title };

export default function Page() {
  return <ProfileView />;
}
