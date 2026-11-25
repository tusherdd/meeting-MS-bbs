"use client";

import type { ReactNode } from "react";
import { useT } from "@/providers/locale-provider";
import { ErrorAlert } from "./alert";
import { Button } from "./button";
import { Modal } from "./modal";

/**
 * "Are you sure?" for every dangerous action. The confirm button shows the busy text while the
 * request runs; a failed request shows the backend message inside the dialog.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  busy = false,
  error,
  danger = false,
  confirmDisabled = false,
  cancelLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: unknown;
  danger?: boolean;
  confirmDisabled?: boolean;
  /** v1.21: a different label for the cancel button (default: common.cancel). */
  cancelLabel?: string;
}) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel ?? t.common.cancel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
            loadingText={t.common.working}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        {error ? <ErrorAlert error={error} /> : null}
        {children}
      </div>
    </Modal>
  );
}
