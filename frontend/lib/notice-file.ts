/** Client-side pre-check of a chosen notice file (the backend decides by the bytes). */
export const NOTICE_MAX_BYTES = 10 * 1024 * 1024;
const NOTICE_NAME = /\.(pdf|docx|jpe?g|png)$/i;

export function noticeFileProblem(file: File): "type" | "size" | null {
  if (!NOTICE_NAME.test(file.name)) return "type";
  if (file.size > NOTICE_MAX_BYTES) return "size";
  return null;
}
