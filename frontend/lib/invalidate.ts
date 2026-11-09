import type { QueryClient } from "@tanstack/react-query";

/**
 * After a meeting is created, edited, cancelled, completed or deleted: everything that can show
 * it must reload — today/lists/calendar/detail ("meetings"), conflicts, notification counts and
 * the report numbers on the dashboard.
 */
export async function invalidateMeetingData(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    ["meetings", "conflicts", "notifications", "reports"].map((group) =>
      queryClient.invalidateQueries({ queryKey: [group] }),
    ),
  );
}
