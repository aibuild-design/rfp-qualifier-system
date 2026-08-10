"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Something is being read right now", in the rail.
 *
 * Triage takes forty to ninety seconds and the submit form already returns
 * immediately, so the work has always run in the background. What was missing
 * was any sign of it: you submitted, got a row marked Pending, and had no way
 * to tell whether it was working or had quietly died. The only recourse was
 * refreshing the page until something changed.
 *
 * So this appears while anything is pending, links straight to it, and takes
 * itself away when the last one lands. A permanent "0 being read" would be a
 * line that says nothing almost all of the time and trains you not to look at
 * the one place that matters.
 *
 * It polls rather than opening a realtime socket. The window is a minute or
 * two, a few times a day; a websocket for that is a connection to keep alive,
 * reconnect, and reason about for a page that is usually idle. `router.refresh`
 * re-runs the server components and leaves scroll position and form state
 * alone, so the refresh is invisible unless something actually changed.
 *
 * The interval only exists while there is something to wait for, so an idle
 * dashboard makes no requests at all.
 */
export function TriageStatus({ pending, href }: { pending: number; href: string }) {
  const router = useRouter();

  useEffect(() => {
    if (pending === 0) return;
    const id = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(id);
  }, [pending, router]);

  if (pending === 0) return null;

  return (
    <Link
      href={href}
      className="press press-row mb-2 flex items-center gap-2.5 rounded-lg bg-rfp-gold-bright/10 px-3 py-2.5 hover:bg-rfp-gold-bright/15"
    >
      <span aria-hidden className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-rfp-gold-bright" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-white">
          {pending === 1 ? "Being read now" : `${pending} being read now`}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-white/45">
          About a minute. You can close this.
        </span>
      </span>
    </Link>
  );
}
