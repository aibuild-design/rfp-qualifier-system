"use client";

import { useEffect } from "react";

/**
 * Warn before leaving with work that has not been written down.
 *
 * The settings forms save on blur, which is invisible and mostly fine: click
 * away, it saves. The gap is real though - type an insurance paragraph, then
 * reload or close the tab without leaving the field, and it is gone with no
 * indication it was ever at risk. That paragraph is the single most valuable
 * thing anyone types into this system.
 *
 * Deliberately narrow. It fires only while something genuinely differs from
 * what is stored, never on every page with a form, because a confirm dialog
 * that appears when nothing is at stake teaches people to dismiss it without
 * reading - and then it is not there when it matters.
 *
 * The browser shows its own wording; the message cannot be customised in any
 * current browser, which is why none is supplied.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers required returnValue to be set; harmless in new ones.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
