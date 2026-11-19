import { saveBlob } from "./api";
import { noticesApi } from "./endpoints";

/** v1.13 (SPEC.md §6.8): types the browser may show itself; a DOCX is always saved. */
const INLINE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function opensInline(mime: string): boolean {
  return INLINE_TYPES.has(mime.split(";")[0].trim().toLowerCase());
}

/** Client-side pre-check of a chosen notice file (the backend decides by the bytes). */
export const NOTICE_MAX_BYTES = 10 * 1024 * 1024;
const NOTICE_NAME = /\.(pdf|docx|jpe?g|png)$/i;

export function noticeFileProblem(file: File): "type" | "size" | null {
  if (!NOTICE_NAME.test(file.name)) return "type";
  if (file.size > NOTICE_MAX_BYTES) return "size";
  return null;
}

/**
 * Opens the meeting's notice: PDF and images in a new tab, a DOCX as a download. The tab is
 * opened during the click (popup blockers) and closed again for a DOCX.
 */
export async function openMeetingNotice(meetingId: string): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const file = await noticesApi.download(meetingId, true);
    if (tab && opensInline(file.blob.type)) {
      const url = URL.createObjectURL(file.blob);
      tab.opener = null;
      tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      tab?.close();
      saveBlob(file);
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}
