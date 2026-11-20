import { describe, expect, it } from "vitest";
import {
  DASHBOARD_FILTERS,
  DEFAULT_DASHBOARD_FILTER,
  filterMeetings,
  statusOfFilter,
} from "@/lib/dashboard-filter";
import { bn, en } from "@/messages";

const meetings = [
  { id: "s", status: "SCHEDULED" as const },
  { id: "c", status: "COMPLETED" as const },
  { id: "x", status: "CANCELLED" as const },
];
const ids = (list: { id: string }[]) => list.map((m) => m.id);

describe("dashboard status filter (v1.15)", () => {
  it("order and default", () => {
    expect(DASHBOARD_FILTERS).toEqual(["all", "pending", "complete"]);
    expect(DEFAULT_DASHBOARD_FILTER).toBe("pending");
  });

  it("maps to the server's status parameter", () => {
    expect(statusOfFilter("all")).toBeUndefined();
    expect(statusOfFilter("pending")).toBe("SCHEDULED");
    expect(statusOfFilter("complete")).toBe("COMPLETED");
  });

  it("filters on the client (today's list)", () => {
    expect(ids(filterMeetings(meetings, "all"))).toEqual(["s", "c", "x"]);
    expect(ids(filterMeetings(meetings, "pending"))).toEqual(["s"]);
    expect(ids(filterMeetings(meetings, "complete"))).toEqual(["c"]);
    expect(filterMeetings([], "pending")).toEqual([]);
  });

  it("labels as decided, no counts", () => {
    expect(bn.dashboard.filters).toEqual({ all: "সকল", pending: "চলমান", complete: "সম্পন্ন" });
    expect(en.dashboard.filters).toEqual({ all: "All", pending: "Pending", complete: "Complete" });
  });
});
