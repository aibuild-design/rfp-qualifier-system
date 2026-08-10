"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon, MonitorIcon } from "./icons";

type Theme = "system" | "light" | "dark";
const KEY = "rfp-theme";

/**
 * Light / dark / follow-the-system.
 *
 * Three states rather than a two-way switch. A plain toggle has to pick a
 * starting side, and in doing so overrides the operating system for someone who
 * never asked it to. "Auto" is the default and stays the default until Khaled
 * actively chooses otherwise.
 *
 * The choice is written to <html data-theme> and to localStorage; the tokens in
 * globals.css do the rest, so no component needs to know the theme exists. The
 * blocking script in app/layout.tsx applies the stored value before first
 * paint, which is what stops a dark-mode user being flashed a white page on
 * every navigation.
 *
 * useSyncExternalStore rather than useState + useEffect, because the theme
 * genuinely lives outside React - the inline script has already read it and set
 * data-theme before this component exists. Syncing it into state in an effect
 * costs an extra render on every mount; this reads it directly and gets
 * cross-tab updates for free, so changing the theme in one tab moves the toggle
 * in the other.
 *
 * Labelled, not icon-only. A sun and a moon read instantly; a monitor standing
 * for "neither, decide for me" does not, and there is room for the words.
 */
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    // Private modes throw on localStorage. A theme is never worth an error.
    return "system";
  }
}

export function ThemeToggle() {
  // "system" on the server, which has no localStorage - and is what the markup
  // must say for hydration to match.
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  const choose = useCallback((next: Theme) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Apply it for this session even if it cannot be remembered.
    }
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    // storage events do not fire in the tab that made the change.
    listeners.forEach((l) => l());
  }, []);

  const OPTIONS: { key: Theme; label: string; title: string; Icon: typeof SunIcon }[] = [
    { key: "light", label: "Light", title: "Always light", Icon: SunIcon },
    { key: "dark", label: "Dark", title: "Always dark", Icon: MoonIcon },
    { key: "system", label: "Auto", title: "Match your device's light or dark setting", Icon: MonitorIcon },
  ];

  return (
    <div role="group" aria-label="Colour theme" className="flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5">
      {OPTIONS.map(({ key, label, title, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => choose(key)}
          aria-pressed={theme === key}
          title={title}
          className={`press flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
            theme === key ? "bg-white/15 text-white" : "text-white/45 hover:text-white/80"
          }`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}
