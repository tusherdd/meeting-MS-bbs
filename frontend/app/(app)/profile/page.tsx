import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).profile.title };
}

export default function Page() {
  return <ProfileView />;
}
