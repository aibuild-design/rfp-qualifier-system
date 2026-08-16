"use client";

import { restartTour } from "./Tour";

/** Sits in the rail under the account block, where someone goes looking when
 *  they want to be shown something again. */
export function RestartTourButton() {
  return (
    <button
      type="button"
      onClick={restartTour}
      className="press flex min-h-11 w-full items-center gap-2 px-3 text-xs font-medium text-white/45 hover:text-white/80"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
        <path
          d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5V7h-3.5"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Take the tour again
    </button>
  );
}
