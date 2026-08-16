"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { RailContent } from "./Sidebar";
import { MenuIcon, CloseIcon } from "./icons";
import type { AttentionCounts, NavCounts } from "@/lib/nav";

/**
 * The rail, on a phone.
 *
 * Below `lg` the dark rail is hidden, and what replaced it was a horizontally
 * scrolling strip of links - which meant the last two destinations sat past the
 * right edge with nothing saying they were there, and the account block at the
 * foot of the rail (identity, theme, sign out) had no mobile home at all. There
 * was no way to sign out from a phone.
 *
 * So this opens the real rail rather than substituting for it. Same nav, same
 * attention numbers, same sign-out, from the same component - a second reduced
 * copy is how one breakpoint ends up missing a link the other has.
 */
export function MobileSidebar({
  userEmail,
  counts,
  attention,
}: {
  userEmail: string | null;
  counts: NavCounts;
  attention: AttentionCounts;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      // Keep Tab inside the drawer. Without this, tabbing walks out of the
      // panel and onto the page underneath, which is still covered by the
      // scrim - focus lands somewhere the user cannot see.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // The page behind a drawer should not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open]);

  function close() {
    setOpen(false);
    // Back to the button that opened it, so a keyboard user is not returned to
    // the top of the document.
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-rail"
        className="press -ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-rfp-ink hover:bg-rfp-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {/* Rendered into <body>, not in place.

          The trigger lives in the top bar, and that header carries a
          `backdrop-blur`. A backdrop-filter makes an element the containing
          block for every `position: fixed` descendant, so an in-place overlay
          resolved `inset-0` against the header rather than the viewport and came
          out 390x64 - a full-height rail clipped to the height of the bar it was
          launched from, with only its top 64px able to take a tap. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* The scrim fades on its own, faster than the panel travels, so the
              page dims before the rail arrives rather than with it. */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={close}
              className="drawer-scrim absolute inset-0 h-full w-full cursor-default bg-black/50"
            />

            <div
              id="mobile-rail"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              tabIndex={-1}
              /* Tapping a link navigates without unmounting this component, so the
               drawer would otherwise stay open over the page you just asked for.
               Handled on the click rather than by watching the pathname: an
               effect that sets state on every route change re-renders the whole
               rail a second time for a value it already knows here. No refocus
               of the trigger, because focus belongs on the page being opened. */
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a[href]"))
                  setOpen(false);
              }}
              className="drawer-panel absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col overflow-hidden border-r border-white/10 bg-rfp-black text-white outline-none"
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="press absolute right-2 top-2.5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <CloseIcon className="h-5 w-5" />
              </button>

              <RailContent
                userEmail={userEmail}
                counts={counts}
                attention={attention}
                pathname={pathname}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
