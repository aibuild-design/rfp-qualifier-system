"use client";

import { useOptimistic, useTransition } from "react";
import { setComplianceComplete } from "@/app/dashboard/rfps/[id]/actions";

/**
 * The tick on a compliance item.
 *
 * Was a span: it displayed whether an item was done and could not be told that
 * it was. Now a real control, with the label as its accessible name so a screen
 * reader says which rule is being ticked rather than "checkbox".
 *
 * Optimistic, because the value is the user's own click and a checklist that
 * lags behind the finger feels broken even when it is only slow.
 */
export function ComplianceTick({
  rfpId,
  itemId,
  label,
  complete,
}: {
  rfpId: string;
  itemId: string;
  label: string;
  complete: boolean;
}) {
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(complete);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={shown}
      aria-label={`Done: ${label}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setShown(!shown);
          await setComplianceComplete(rfpId, itemId, !shown);
        })
      }
      className="press mt-0.5 inline-flex h-11 w-11 shrink-0 -translate-x-3 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold"
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border text-white ${
          shown ? "border-rfp-good bg-rfp-good" : "border-rfp-border-strong"
        }`}
      >
        {shown && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
            <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  );
}
