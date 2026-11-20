import { redirect } from "next/navigation";

/**
 * v1.15: the office report is one page for every viewer at /office-report (SPEC.md §6.10, §13.21).
 * Old links keep working: this redirects with the same query (period, dates, filters).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, v);
    }
  }
  const qs = params.toString();
  redirect(qs ? `/office-report?${qs}` : "/office-report");
}
