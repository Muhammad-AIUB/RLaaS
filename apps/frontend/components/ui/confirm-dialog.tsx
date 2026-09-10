'use client';

import { ReactNode, useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Say what actually happens, in the terms the operator cares about. */
  body: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * One confirmation dialog for every destructive action in the console.
 *
 * Revoking a key, removing a member, deleting a rule or a webhook all used to
 * fire on a single click with no confirmation and no undo, each with its own
 * ad-hoc modal markup or none at all. This is the single place that behaviour
 * lives now, so Escape, the backdrop click, and focus handling work the same
 * everywhere.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pendingLabel,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onCancel();
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, pending, onCancel]);

  // Focus lands on the confirm button so the keyboard path is one Tab from
  // Cancel, not a hunt through the page behind the dialog.
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-raised p-6 shadow-overlay"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-slate-900"
        >
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-500">{body}</div>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <button
            ref={confirmRef}
            type="button"
            className="btn-danger-solid"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? 'Working…') : confirmLabel}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
