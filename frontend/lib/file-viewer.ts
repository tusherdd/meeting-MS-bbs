/**
 * v1.17 (SPEC.md §13.22): pure rules of the shared file viewer side panel.
 * - PDF → shown in an iframe; JPG / PNG → shown in an img; everything else (DOCX) → never shown,
 *   only downloaded.
 * - iPhone / iPad (also iPadOS that reports itself as a Mac) and browsers without an inline PDF
 *   viewer get a note with "Open in new tab" and "Download" instead of the iframe.
 */
export type ViewKind = "pdf" | "image" | "download";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

/** The bare, lower-case mime type ("application/pdf; x=y" → "application/pdf"). */
export function bareMime(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

export function viewKind(mime: string | null | undefined): ViewKind {
  const type = bareMime(mime);
  if (type === "application/pdf") return "pdf";
  if (IMAGE_TYPES.has(type)) return "image";
  return "download";
}

/** PDF and images open in the panel; a DOCX (or anything else) is a direct download. */
export function opensInPanel(mime: string | null | undefined): boolean {
  return viewKind(mime) !== "download";
}

export interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** `navigator.pdfViewerEnabled` (false on Android Chrome and where PDFs are always downloaded). */
  pdfViewerEnabled?: boolean;
}

/** iPhone, iPod or iPad — including iPadOS 13+, which reports "MacIntel" but has a touch screen. */
export function isAppleMobile(nav: NavigatorLike): boolean {
  if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

/** Can this browser show a PDF inside the panel's iframe? */
export function canShowPdfInline(nav: NavigatorLike): boolean {
  if (isAppleMobile(nav)) return false;
  return nav.pdfViewerEnabled !== false;
}
