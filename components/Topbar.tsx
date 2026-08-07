import Image from "next/image";
import { BellIcon } from "./icons";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 border-b border-rfp-border bg-rfp-surface/95 px-5 backdrop-blur supports-backdrop-blur:bg-rfp-surface/80 lg:px-8">
      {/* Only shown below lg, where the sidebar (and its wordmark) is hidden. */}
      <Image
        src="/brand/caravann-black.png"
        alt="Caravann"
        width={1494}
        height={205}
        className="h-[18px] w-auto shrink-0 object-contain lg:hidden"
      />

      <div className="ml-auto flex items-center gap-2.5">
        <span className="hidden items-center gap-1.5 rounded-full bg-rfp-surface-sunken px-2.5 py-1 text-xs font-semibold text-rfp-ink-muted sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-rfp-gold" />
          Demo data — not yet wired up
        </span>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-rfp-ink-secondary transition-colors hover:bg-rfp-surface-sunken"
          aria-label="Notifications"
        >
          <BellIcon className="h-4.5 w-4.5" />
        </button>
      </div>
    </header>
  );
}
