import { describe, expect, it } from "vitest";
import {
  attachmentLabel,
  attachmentProblem,
  canAddAttachment,
  MAX_ATTACHMENTS,
} from "@/lib/attachments";

const file = (name: string, size = 100) => new File([new Uint8Array(size)], name);

/** v1.17 part 2 (SPEC.md §6.11, §13.6): the "অন্যান্য সংযুক্তি" form section rules. */
describe("other attachments: when Add is enabled", () => {
  it("needs a non-empty name AND a valid file", () => {
    expect(canAddAttachment("", file("a.pdf"), 0)).toBe(false);
    expect(canAddAttachment("   ", file("a.pdf"), 0)).toBe(false);
    expect(canAddAttachment("বাজেট", null, 0)).toBe(false);
    expect(canAddAttachment("বাজেট", file("a.pdf"), 0)).toBe(true);
    expect(canAddAttachment("বাজেট", file("a.docx"), 0)).toBe(true);
  });

  it("refuses other types, files over 10 MB and names over 150 characters", () => {
    expect(attachmentProblem("x", file("a.doc"))).toBe("type");
    expect(attachmentProblem("x", file("a.pdf", 10 * 1024 * 1024 + 1))).toBe("size");
    expect(attachmentProblem("ক".repeat(151), null)).toBe("nameTooLong");
    expect(attachmentProblem("ক".repeat(150), file("a.png"))).toBeNull();
    expect(canAddAttachment("ক".repeat(151), file("a.pdf"), 0)).toBe(false);
  });

  it("is disabled at 5 files", () => {
    expect(MAX_ATTACHMENTS).toBe(5);
    expect(canAddAttachment("x", file("a.pdf"), 4)).toBe(true);
    expect(canAddAttachment("x", file("a.pdf"), 5)).toBe(false);
  });

  it("trims and collapses whitespace like the backend", () => {
    expect(attachmentLabel("  বাজেট   প্রস্তাব ")).toBe("বাজেট প্রস্তাব");
  });
});
