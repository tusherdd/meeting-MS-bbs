"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { FileViewerPanel, type ViewerFile } from "@/components/files/file-viewer-panel";
import { ErrorAlert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { saveBlob } from "@/lib/api";
import { decisionsApi, noticesApi } from "@/lib/endpoints";
import { rowActions, type RowMeeting, type RowMenuMode } from "@/lib/row-actions";
import { useT } from "@/providers/locale-provider";
import { CancelMeetingModal } from "./cancel-meeting-modal";

const MENU_WIDTH = 192; // px, w-48
const GAP = 4;

/**
 * v1.10 (SPEC.md §13.18): the three-dot "More actions" menu at the end of a meeting row.
 * The three dots are the only symbol allowed outside the header (owner decision 2026-11-17); the
 * button is named by its aria-label and the glyph is aria-hidden.
 *
 * Menu-button pattern: Enter / Space / Arrow Down open it on the first item (Arrow Up: last);
 * Arrow Up / Down, Home and End move between items; Escape closes it and returns focus to the
 * button; Tab or a click outside close it. The menu is `position: fixed` so the table's
 * horizontal scroll box never clips it; it opens upwards near the bottom edge and follows the
 * button on scroll / resize (closing once the button leaves the screen).
 */
export function MeetingRowMenu({
  meeting,
  mine,
  participant = mine,
  mode = "default",
}: {
  meeting: RowMeeting & { id: string; title: string };
  /** The viewer organizes the meeting or is its internal chair. */
  mine: boolean;
  /** v1.11: the viewer is one of the meeting's people (may upload a decision). */
  participant?: boolean;
  /** v1.15: the office report menu (view minutes instead of upload). */
  mode?: RowMenuMode;
}) {
  const t = useT();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focusFirst, setFocusFirst] = useState<"first" | "last">("first");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [noticeError, setNoticeError] = useState<unknown>(null);
  // v1.17: the file viewer panel (notice, or the minutes files listed for switching).
  const [viewerFiles, setViewerFiles] = useState<ViewerFile[] | null>(null);
  const can = rowActions(meeting, mine, new Date(), participant, mode);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus({ preventScroll: true });
  }, []);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // Place the menu next to the button (below, or above when there is no room). Returns false
  // when the button is no longer in the viewport.
  const place = useCallback((): boolean => {
    if (!buttonRef.current) return false;
    const rect = buttonRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const height = menuRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + GAP;
    const top =
      below + height > window.innerHeight && rect.top - GAP - height > 0
        ? rect.top - GAP - height
        : below;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPosition({ top, left });
    return true;
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // Focus the first (or last) item once the menu sits in its place (never scroll the page).
  const placed = position !== null;
  useEffect(() => {
    if (!open || !placed) return;
    const list = items();
    (focusFirst === "first" ? list[0] : list[list.length - 1])?.focus({ preventScroll: true });
  }, [open, placed, focusFirst]);

  // Outside click (mouse, pen or touch) closes the menu. On scroll / resize it follows its
  // button, and closes once the button has left the screen.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    const onScrollOrResize = (e: Event) => {
      if (e.type === "scroll" && menuRef.current?.contains(e.target as Node)) return;
      if (!place()) close(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, close, place]);

  function openMenu(at: "first" | "last") {
    setFocusFirst(at);
    setPosition(null);
    setOpen(true);
  }

  function onButtonKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(e.key === "ArrowDown" ? "first" : "last");
    }
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus({ preventScroll: true });
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(index + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        go(index - 1);
        break;
      case "Home":
        e.preventDefault();
        go(0);
        break;
      case "End":
        e.preventDefault();
        go(list.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  // v1.17: the uploaded notice — PDF / image in the file viewer panel, DOCX as a download.
  async function onNotice() {
    close(true);
    setNoticeError(null);
    if (can.noticeAction === "view") {
      setViewerFiles([
        {
          id: "notice",
          name: t.notice.label,
          mime: meeting.noticeMime ?? null,
          load: () => noticesApi.download(meeting.id),
        },
      ]);
      return;
    }
    setOpening(true);
    try {
      saveBlob(await noticesApi.download(meeting.id));
    } catch (err) {
      setNoticeError(err);
    } finally {
      setOpening(false);
    }
  }

  // v1.17: "View minutes" — the minutes files in the panel (DOCX entries: Download only).
  async function onMinutes() {
    close(true);
    setNoticeError(null);
    setOpening(true);
    try {
      const detail = await decisionsApi.detail(meeting.id);
      setViewerFiles(
        detail.files.map((f) => ({
          id: f.id,
          name: f.originalName,
          mime: f.mime,
          load: () => decisionsApi.download(meeting.id, f.id),
        })),
      );
    } catch (err) {
      setNoticeError(err);
    } finally {
      setOpening(false);
    }
  }

  const itemClass =
    "block w-full px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 focus:bg-brand-50 focus:outline-none";

  return (
    <div className="inline-block" data-testid="row-menu">
      <button
        ref={buttonRef}
        type="button"
        aria-label={t.rowMenu.button}
        title={t.rowMenu.button}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={opening || undefined}
        onClick={() => (open ? close(false) : openMenu("first"))}
        onKeyDown={onButtonKeyDown}
        className="flex size-11 items-center justify-center rounded-full text-xl leading-none font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 sm:size-9"
        disabled={opening}
        data-row-menu-button
      >
        <span aria-hidden="true" data-row-menu-glyph>
          ⋮
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t.rowMenu.button}
          onKeyDown={onMenuKeyDown}
          style={{
            position: "fixed",
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            width: MENU_WIDTH,
          }}
          className="z-50 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-md"
        >
          {can.view && (
            <Link
              role="menuitem"
              tabIndex={-1}
              href={`/meetings/${meeting.id}`}
              className={itemClass}
              onClick={() => close(false)}
            >
              {t.rowMenu.view}
            </Link>
          )}
          {can.noticeAction && (
            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              className={itemClass}
              onClick={() => void onNotice()}
            >
              {can.noticeAction === "view" ? t.rowMenu.viewNotice : t.rowMenu.downloadNotice}
            </button>
          )}
          {can.viewDecision && (
            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              className={itemClass}
              onClick={() => void onMinutes()}
            >
              {t.rowMenu.viewMinutes}
            </button>
          )}
          {can.uploadDecision && (
            <Link
              role="menuitem"
              tabIndex={-1}
              href={`/meetings/${meeting.id}/decision`}
              className={itemClass}
              onClick={() => close(false)}
            >
              {t.rowMenu.upload}
            </Link>
          )}
          {can.edit && (
            <Link
              role="menuitem"
              tabIndex={-1}
              href={`/meetings/${meeting.id}/edit`}
              className={itemClass}
              onClick={() => close(false)}
            >
              {t.rowMenu.edit}
            </Link>
          )}
          {can.cancel && (
            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              className={`${itemClass} text-red-700`}
              onClick={() => {
                close(false);
                setCancelOpen(true);
              }}
            >
              {t.rowMenu.cancel}
            </button>
          )}
        </div>
      )}

      {opening && (
        <span role="status" className="sr-only">
          {t.notice.opening}
        </span>
      )}
      {can.cancel && (
        <CancelMeetingModal
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
        />
      )}
      <FileViewerPanel
        open={viewerFiles !== null && viewerFiles.length > 0}
        onClose={() => setViewerFiles(null)}
        files={viewerFiles ?? []}
        returnFocus={buttonRef}
      />
      <Modal
        open={noticeError !== null}
        onClose={() => setNoticeError(null)}
        title={meeting.title}
      >
        {noticeError !== null && <ErrorAlert error={noticeError} />}
      </Modal>
    </div>
  );
}
