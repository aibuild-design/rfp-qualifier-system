"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * A settings form that only writes when somebody says so.
 *
 * These saved on blur: type an insurance limit, click away, saved. That is
 * invisible in both directions. There is no moment where a person decides the
 * change is right, and no way to change their mind, so a half-typed figure
 * became the number that decides verdicts the instant focus moved. The one
 * guard that existed covered a browser reload and nothing else, which is the
 * rarest way to leave a page.
 *
 * So: hold a draft, compare it to what is stored, and write only on Save. The
 * dirty flag drives both the save bar and the two guards below, because a
 * warning that fires when nothing is at stake gets dismissed without reading
 * and is then not there when it matters.
 */
export function useSavedForm<T>(
  stored: T,
  persist: (value: T) => Promise<{ message: string } | null>,
) {
  const [value, setValue] = useState<T>(stored);
  const [saved, setSaved] = useState<T>(stored);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const guard = useUnsavedGuard(dirty);

  const commit = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    const failure = await persist(value);
    setSaving(false);
    if (failure) {
      setError(failure.message);
      return;
    }
    setSaved(value);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  }, [dirty, saving, persist, value]);

  const discard = useCallback(() => {
    setValue(saved);
    setError(null);
  }, [saved]);

  return { value, setValue, dirty, saving, error, justSaved, commit, discard, guard };
}

/**
 * Warn before leaving with work that has not been written down.
 *
 * Two exits, because they are genuinely different. Closing the tab or reloading
 * is the browser's to intercept, and it shows its own wording; no current
 * browser lets that be customised, which is why none is supplied.
 *
 * Navigating inside the app is ours. Next's client router never touches
 * beforeunload, so the old guard let every in-app click through silently, which
 * is how almost everybody actually leaves a settings page. The click is caught
 * in the capture phase, before the router sees it, and only for links that
 * genuinely go somewhere else.
 */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  /** Where the interrupted click was going, and the reason the dialog is up. */
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;

    // The browser's own dialog, which cannot be styled or reworded in any
    // current browser. It only fires for closing the tab or reloading, which
    // is the one exit we do not own.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    // Every other exit is ours, so it gets a dialog that looks like the rest of
    // the app rather than a system alert. Caught in the capture phase, before
    // Next's router sees the click.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      const here = window.location.pathname + window.location.search;
      const there = link.getAttribute("href") ?? "";
      if (!there.startsWith("/") || there === here) return;

      e.preventDefault();
      e.stopPropagation();
      setPending(there);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return {
    pending,
    stay: useCallback(() => setPending(null), []),
    leave: useCallback(() => {
      const to = pending;
      setPending(null);
      if (to) router.push(to);
    }, [pending, router]),
  };
}
