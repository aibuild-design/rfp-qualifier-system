"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { buttonClass, buttonSecondaryClass } from "@/components/ui/form";

/**
 * A modal that asks before doing something disruptive.
 *
 * Built on <dialog> rather than a hand-rolled overlay, so the browser supplies
 * the focus trap, the inert background and Escape-to-close — three things that
 * are easy to get wrong by hand and invisible when you do.
 *
 * Opens from nothing rather than sliding: a confirmation appearing where you
 * are looking is faster to read than one that travels. Exits quicker than it
 * enters, because waiting for a dismissed dialog to leave is the part that
 * feels slow.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        // Escape fires this; let the parent own the state rather than letting
        // the element close itself behind React's back.
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // Clicking the backdrop — the dialog element itself is the backdrop, so
        // a click that lands on it rather than on the panel means "outside".
        if (e.target === ref.current) onCancel();
      }}
      className="dialog m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-rfp-border bg-rfp-surface p-0 text-rfp-ink backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5">
        <h2 className="font-display text-base font-semibold text-rfp-ink">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-rfp-ink-secondary">{body}</div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onConfirm} className={buttonClass}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel} className={buttonSecondaryClass}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
