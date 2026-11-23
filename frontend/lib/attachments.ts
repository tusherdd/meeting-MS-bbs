/**
 * v1.17 (SPEC.md §6.11, §13.6): pure rules of the "অন্যান্য সংযুক্তি" / "Other attachments" form
 * section. The backend checks everything again (the file by its bytes).
 */
import { z } from "zod";
import { noticeFileProblem } from "./notice-file";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_NAME = 150;

/** The label as the backend stores it: trimmed, inner whitespace collapsed. */
export function attachmentLabel(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export type AttachmentProblem = "nameTooLong" | "type" | "size" | null;

/** What is wrong with the typed name / chosen file (an empty name or no file is not an error yet). */
export function attachmentProblem(name: string, file: File | null): AttachmentProblem {
  if (attachmentLabel(name).length > MAX_ATTACHMENT_NAME) return "nameTooLong";
  return file ? noticeFileProblem(file) : null;
}

/**
 * One attachment row: a name AND an allowed file. Decides when "Add" is enabled. The section is
 * optional, so its fields carry no required mark (SPEC.md §13.6a exception).
 */
export const attachmentEntrySchema = z.object({
  name: z.string().transform(attachmentLabel).pipe(z.string().min(1).max(MAX_ATTACHMENT_NAME)),
  file: z.custom<File>(
    (v) => typeof File !== "undefined" && v instanceof File && noticeFileProblem(v) === null,
  ),
});

/** "Add" is enabled only with a valid name AND a valid file, below the limit. */
export function canAddAttachment(name: string, file: File | null, count: number): boolean {
  if (count >= MAX_ATTACHMENTS) return false;
  return attachmentEntrySchema.safeParse({ name, file }).success;
}
