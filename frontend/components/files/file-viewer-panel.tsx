"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveBlob, type DownloadedFile } from "@/lib/api";
import { bareMime, canShowPdfInline, viewKind, type ViewKind } from "@/lib/file-viewer";
import { useT } from "@/providers/locale-provider";

/** One file the panel can show (or, for a DOCX, only download). */
export interface ViewerFile {
  id: string;
  /** Shown until the server's file name (Content-Disposition) is known. */
  name: string;
  /** Known type (from the API); null = decided by the downloaded bytes' Content-Type. */
  mime: string | null;
  /** Fetches the file with the session (lib/api.ts `apiDownload`). */
  load: () => Promise<DownloadedFile>;
}

/** Unknown type → fetched and decided by the bytes' Content-Type; DOCX → download only. */
function mayView(file: ViewerFile): boolean {
  return file.mime === null || viewKind(file.mime) !== "download";
}

type Loaded =
  | { id: string; status: "error"; error: unknown }
  | { id: string; status: "ready"; file: DownloadedFile; kind: ViewKind; url: string | null };

type Shown = { status: "idle" } | { status: "loading" } | Loaded;

/**
 * v1.17 (SPEC.md §13.22): the ONE shared file viewer side panel.
 * - A native modal `<dialog>` sliding in from the right: about half the width from 768 px up,
 *   full screen below. The page behind stays mounted, so it keeps its state.
 * - The browser traps focus inside and Escape closes it; a click on the dim background closes it;
 *   focus returns to the element that opened it.
 * - The file is fetched with the session and shown through a Blob URL: PDF in an iframe, JPG / PNG
 *   in an img (fit to width). The URL is revoked when the file changes or the panel closes.
 * - iPhone / iPad and browsers without an inline PDF viewer: a note with "Open in new tab" and
 *   "Download" instead of the iframe. A DOCX is never shown, only downloaded.
 * - Several files: the header lists them for switching; DOCX entries only offer Download.
 */
export function FileViewerPanel({
  open,
  onClose,
  files,
  initialId,
  loadingText,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  files: ViewerFile[];
  /** The file shown first (default: the first one that can be shown). */
  initialId?: string;
  /** Optional text while loading (reports: "তৈরি হচ্ছে…"). */
  loadingText?: string;
  /** Where focus goes on close when the opener was busy (disabled) while the panel opened. */
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pdfInline, setPdfInline] = useState(true);
  const [saveError, setSaveError] = useState<unknown>(null);

  const firstViewable = files.find(mayView);
  const current =
    files.find((f) => f.id === currentId) ??
    files.find((f) => f.id === initialId) ??
    firstViewable ??
    files[0];

  // Open / close the native dialog; remember the opener and give focus back to it afterwards.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const active = document.activeElement;
      opener.current =
        returnFocus?.current ??
        (active instanceof HTMLElement && active !== document.body ? active : null);
      setPdfInline(canShowPdfInline(navigator));
      setCurrentId(null);
      setSaveError(null);
      setLoaded(null);
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
    if (!open && opener.current) {
      if (opener.current.isConnected) opener.current.focus({ preventScroll: true });
      opener.current = null;
    }
  }, [open, returnFocus]);

  // Fetch the current file and show it through a Blob URL (revoked on change / close).
  const currentKey = open && current && mayView(current) ? current : null;
  const currentFileId = currentKey?.id ?? null;
  useEffect(() => {
    if (!currentKey) return;
    const id = currentKey.id;
    let cancelled = false;
    let url: string | null = null;
    currentKey.load().then(
      (file) => {
        if (cancelled) return;
        const kind = viewKind(currentKey.mime ?? file.blob.type);
        if (kind !== "download") {
          // Only the allowed types are ever turned into a viewable Blob URL.
          const type = kind === "pdf" ? "application/pdf" : bareMime(currentKey.mime ?? file.blob.type);
          url = URL.createObjectURL(new Blob([file.blob], { type }));
        }
        setLoaded({ id, status: "ready", file, kind, url });
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ id, status: "error", error });
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // The file id identifies the request; `load` closures change on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFileId]);

  const shown: Shown = !currentKey
    ? { status: "idle" }
    : loaded && loaded.id === currentFileId
      ? loaded
      : { status: "loading" };

  async function download(file: ViewerFile) {
    setSaveError(null);
    try {
      if (file.id === current?.id && shown.status === "ready") saveBlob(shown.file);
      else saveBlob(await file.load());
    } catch (err) {
      setSaveError(err);
    }
  }

  const title = shown.status === "ready" ? shown.file.filename : current?.name;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the dim background
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-none translate-x-0 bg-white p-0 text-slate-800 shadow-md transition-transform duration-200 ease-out backdrop:bg-slate-900/40 motion-reduce:transition-none md:w-1/2 starting:open:translate-x-full"
      data-file-viewer
    >
      {open && current && (
        <div className="flex h-full flex-col">
          <header className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id={titleId}
                className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900"
                title={title}
              >
                {title}
              </h2>
              <Button variant="secondary" size="sm" onClick={() => void download(current)}>
                {t.fileViewer.download}
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose}>
                {t.fileViewer.close}
              </Button>
            </div>
            {files.length > 1 && (
              <ul aria-label={t.fileViewer.files} className="mt-3 flex flex-col gap-1" data-file-list>
                {files.map((f) => {
                  const viewable = mayView(f);
                  const selected = f.id === current.id;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`min-w-0 flex-1 truncate ${selected ? "font-semibold" : ""}`}>
                        {f.name}
                      </span>
                      {viewable ? (
                        <Button
                          variant={selected ? "primary" : "secondary"}
                          size="sm"
                          aria-pressed={selected}
                          onClick={() => setCurrentId(f.id)}
                        >
                          {t.fileViewer.view}
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => void download(f)}>
                          {t.fileViewer.download}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {saveError !== null && (
              <div className="mt-3">
                <ErrorAlert error={saveError} />
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
            {shown.status === "loading" && (
              <p role="status" className="p-4 text-slate-600">
                {loadingText ?? t.common.loading}
              </p>
            )}
            {shown.status === "error" && (
              <div className="p-4">
                <ErrorAlert error={shown.error} />
              </div>
            )}
            {shown.status === "ready" && shown.kind === "pdf" && shown.url && pdfInline && (
              <iframe src={shown.url} title={title} className="block h-full w-full border-0 bg-white" />
            )}
            {shown.status === "ready" && shown.kind === "pdf" && shown.url && !pdfInline && (
              <div className="space-y-3 p-4" data-pdf-fallback>
                <p className="text-slate-800">{t.fileViewer.cantShow}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (shown.url) window.open(shown.url, "_blank", "noopener");
                    }}
                  >
                    {t.fileViewer.openNewTab}
                  </Button>
                  <Button variant="secondary" onClick={() => saveBlob(shown.file)}>
                    {t.fileViewer.download}
                  </Button>
                </div>
              </div>
            )}
            {shown.status === "ready" && shown.kind === "image" && shown.url && (
              // A Blob URL of the session-fetched file: next/image cannot optimise it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown.url} alt={title ?? ""} className="block h-auto w-full bg-white" />
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

/** One button that opens the panel for a single file (or downloads a DOCX directly). */
export function FileViewButton({
  file,
  viewLabel,
  downloadLabel,
  size = "sm",
}: {
  file: ViewerFile;
  viewLabel: string;
  downloadLabel: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const viewable = mayView(file);

  async function onDownload() {
    setError(null);
    try {
      saveBlob(await file.load());
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      {viewable ? (
        <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
          {viewLabel}
        </Button>
      ) : (
        <Button variant="secondary" size={size} onClick={() => void onDownload()}>
          {downloadLabel}
        </Button>
      )}
      {viewable && <FileViewerPanel open={open} onClose={() => setOpen(false)} files={[file]} />}
      {error !== null && <ErrorAlert error={error} />}
    </>
  );
}
