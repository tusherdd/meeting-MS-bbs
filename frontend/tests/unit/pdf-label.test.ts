import { describe, expect, it } from "vitest";
import { bn, en } from "@/messages";

/** v1.17 (SPEC.md §13.12): every report PDF button uses one shared key, common.viewPdf (opens the viewer). */
describe("PDF button label", () => {
  it('is bn "PDF দেখুন" / en "View PDF"', () => {
    expect(bn.common.viewPdf).toBe("PDF দেখুন");
    expect(en.common.viewPdf).toBe("View PDF");
  });

  it("no other text holds its own PDF button label", () => {
    const count = (m: object, label: string) => JSON.stringify(m).split(`"${label}"`).length - 1;
    expect(count(bn, "PDF দেখুন")).toBe(1);
    expect(count(en, "View PDF")).toBe(1);
    // v1.16's download label is gone.
    expect(count(bn, "PDF ডাউনলোড")).toBe(0);
    expect(count(bn, "Download PDF")).toBe(0);
    expect(count(en, "Download PDF")).toBe(0);
  });
});
