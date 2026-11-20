import { describe, expect, it } from "vitest";
import { bn, en } from "@/messages";

/** v1.16 (SPEC.md §13.12): every PDF download button uses one shared key, common.downloadPdf. */
describe("PDF button label", () => {
  it('is bn "PDF ডাউনলোড" / en "Download PDF"', () => {
    expect(bn.common.downloadPdf).toBe("PDF ডাউনলোড");
    expect(en.common.downloadPdf).toBe("Download PDF");
  });

  it("no other text holds its own PDF button label", () => {
    const count = (m: object, label: string) => JSON.stringify(m).split(`"${label}"`).length - 1;
    expect(count(bn, "PDF ডাউনলোড")).toBe(1);
    expect(count(bn, "Download PDF")).toBe(0);
    expect(count(en, "Download PDF")).toBe(1);
  });
});
