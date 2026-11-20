import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { navFor } from "@/components/layout/nav-items";
import { bn, en } from "@/messages";

const root = join(__dirname, "..", "..");

describe("v1.15: calendar and fiscal year removed", () => {
  it("no calendar in the menu, the texts or the app", () => {
    for (const admin of [false, true]) {
      for (const t of [bn, en]) {
        const hrefs = navFor(admin, t, "OFFICE").flatMap((i) => [
          i.href,
          ...(i.children ?? []).map((c) => c.href),
        ]);
        expect(hrefs).not.toContain("/calendar");
      }
    }
    expect("calendar" in bn).toBe(false);
    expect("calendar" in en).toBe(false);
    expect("calendar" in bn.nav).toBe(false);
    expect(JSON.stringify(bn)).not.toContain("ক্যালেন্ডার");
    expect(existsSync(join(root, "app", "(app)", "calendar"))).toBe(false);
    expect(existsSync(join(root, "components", "calendar"))).toBe(false);
  });

  it("no fiscal year anywhere in the texts", () => {
    expect(JSON.stringify(bn)).not.toContain("অর্থবছর");
    expect(JSON.stringify(en).toLowerCase()).not.toContain("fiscal");
  });
});
