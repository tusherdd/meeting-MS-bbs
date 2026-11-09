import { redirect } from "next/navigation";

/** "/" → dashboard (the (app) guard sends visitors without a session to /login). */
export default function Home() {
  redirect("/dashboard");
}
