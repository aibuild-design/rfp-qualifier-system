import Image from "next/image";
import Link from "next/link";
import { MobileNav } from "./MobileNav";
import { PlusIcon } from "./icons";
import { timeZoneLabel } from "@/lib/rfp";
import type { NavCounts } from "@/lib/nav";

export function Topbar({ counts }: { counts: NavCounts }) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-rfp-border bg-rfp-surface/95 backdrop-blur supports-backdrop-blur:bg-rfp-surface/80">
      <div className="flex h-16 items-center gap-4 px-5 lg:px-8">
        {/* Only shown below lg, where the sidebar (and its wordmark) is hidden. */}
        <Image
          src="/brand/caravann-black.png"
          alt="Caravann"
          width={1494}
          height={205}
          className="h-[18px] w-auto shrink-0 object-contain lg:hidden"
        />

        <div className="ml-auto flex items-center gap-2.5">
          {/* Every date in the app is rendered in one fixed zone. Saying which
              one, once, is what stops a 7pm Pacific deadline being read as the
              next day — the one direction a bid desk must not get wrong. */}
          <span className="hidden items-center gap-1.5 rounded-full bg-rfp-surface-sunken px-2.5 py-1 text-xs font-medium text-rfp-ink-muted sm:inline-flex">
            Deadlines shown in {timeZoneLabel()}
          </span>

          {/* The rail's primary action, mirrored for the breakpoints that hide it. */}
          <Link
            href="/dashboard/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-rfp-black px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rfp-black-2 lg:hidden"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add
          </Link>
        </div>
      </div>

      <MobileNav counts={counts} />
    </header>
  );
}
