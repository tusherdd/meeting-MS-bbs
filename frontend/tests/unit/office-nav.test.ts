import { describe, expect, it } from "vitest";
import { adminLinks } from "@/components/admin/admin-nav";
import { OFFICE_REPORT_PATH, navFor } from "@/components/layout/nav-items";
import { createFormatter } from "@/lib/format";
import { bn, en } from "@/messages";

describe("office report menu (v1.15)", () => {
  it("NONE officers get no item; WING / OFFICE officers get it LAST, below প্রোফাইল", () => {
    expect(navFor(false, bn, "NONE").map((i) => i.href)).not.toContain(OFFICE_REPORT_PATH);
    for (const scope of ["WING", "OFFICE"] as const) {
      const items = navFor(false, bn, scope);
      expect(items.at(-2)?.href).toBe("/profile");
      expect(items.at(-1)).toEqual({ href: "/office-report", label: "অফিস রিপোর্ট" });
    }
    expect(navFor(false, en, "WING").at(-1)?.label).toBe("Office report");
  });

  it("admins keep the item in the admin section, pointing at the one page", () => {
    const items = navFor(true, bn, "OFFICE");
    expect(items.filter((i) => i.href === OFFICE_REPORT_PATH)).toHaveLength(0);
    const admin = items.find((i) => i.href === "/admin");
    expect(admin?.children?.some((c) => c.href === "/office-report")).toBe(true);
    expect(adminLinks(bn).some((l) => l.href === "/admin/reports")).toBe(false);
  });

  it("table date and time: dd/mm/yyyy and the 24-hour clock in Dhaka, Bangla digits in bn", () => {
    // 08:30 UTC = 14:30 Dhaka on 3 Nov 2026
    const at = "2026-11-03T08:30:00Z";
    expect(createFormatter("bn").formatNumericDate(at)).toBe("০৩/১১/২০২৬");
    expect(createFormatter("bn").formatClock(at)).toBe("১৪:৩০");
    expect(createFormatter("en").formatNumericDate(at)).toBe("03/11/2026");
    expect(createFormatter("en").formatClock("2026-11-03T03:05:00Z")).toBe("09:05");
  });
});
