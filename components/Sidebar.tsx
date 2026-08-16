"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircleIcon,
  DocumentIcon,
  GridIcon,
  PlusIcon,
  PulseIcon,
  SettingsIcon,
} from "./icons";
import { SignOutButton } from "./SignOutButton";
import { RestartTourButton } from "./RestartTourButton";
import { TriageStatus } from "./TriageStatus";
import {
  NAV_GROUPS,
  isNavItemActive,
  type AttentionCounts,
  type NavCounts,
} from "@/lib/nav";

const ICONS = {
  overview: PulseIcon,
  queue: GridIcon,
  proposals: DocumentIcon,
  new: PlusIcon,
  library: DocumentIcon,
  review: CheckCircleIcon,
  settings: SettingsIcon,
} as const;

/**
 * The dark rail. Nav lives in `lib/nav.ts` rather than here so the mobile bar
 * renders the same list from the same source - two copies of the nav drifting
 * apart is how a link ends up reachable on one breakpoint and not the other.
 *
 * Counts come from the layout (a server component) rather than being fetched
 * here: the rail is on every dashboard page, so client-side fetching would mean
 * a request per navigation for numbers the server already has.
 */
export function Sidebar({
  userEmail,
  counts,
  attention,
}: {
  userEmail: string | null;
  counts: NavCounts;
  attention: AttentionCounts;
}) {
  const pathname = usePathname();

  // The rail carries an explicit right edge. It is brand black and the dark page
  // is nearly the same value, so without a border the whole left side of the app
  // dissolved into one field. A border defines it without moving the brand
  // colour, which a lighter rail would have.
  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-rfp-black text-white lg:flex">
      <RailContent userEmail={userEmail} counts={counts} attention={attention} pathname={pathname} />
    </aside>
  );
}

/**
 * Everything inside the rail. Split out so the mobile drawer renders the real
 * rail - the same nav, the same attention numbers, the same sign-out - instead
 * of a reduced copy of it. `pathname` is passed in rather than read here so both
 * callers stay in charge of their own render.
 */
export function RailContent({
  userEmail,
  counts,
  attention,
  pathname,
}: {
  userEmail: string | null;
  counts: NavCounts;
  attention: AttentionCounts;
  pathname: string;
}) {
  return (
    <>
      <div className="flex h-16 flex-col justify-center gap-1 border-b border-white/10 px-5">
        {/* Yellow wordmark on the near-black rail - 11.9:1, the variant
            Caravann's own site uses on dark. */}
        <Image
          src="/brand/caravann-yellow.png"
          alt="Caravann"
          width={1500}
          height={277}
          priority
          className="h-[22px] w-auto object-contain object-left"
        />
        <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
          RFP Bid Desk
        </p>
      </div>

      {/* The one thing you come here to do that isn't reading. */}
      <div className="px-3 pt-4">
        <Link
          href="/dashboard/new"
          data-tour="add"
          prefetch
          className="flex items-center justify-center gap-2 rounded-lg bg-rfp-gold-bright px-3 py-2.5 text-sm font-semibold text-rfp-black press hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" />
          Add a solicitation
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.key];
                const active = isNavItemActive(pathname, item);
                const badge = item.countKey ? counts[item.countKey] : 0;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    /* What the first-run tour spotlights. Keyed off the nav item
                       so a renamed or reordered link keeps its highlight. */
                    data-tour={item.key}
                    aria-current={active ? "page" : undefined}
                    prefetch
                    className={`press press-row relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                      active
                        ? "nav-rail bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white/90"
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span
                        className={`tabular rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          item.countTone === "attention"
                            ? "bg-rfp-gold-bright text-rfp-black"
                            : "bg-white/10 text-white/70"
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <AttentionPanel attention={attention} />

      <RestartTourButton />

      <SignOutButton userEmail={userEmail} />
    </>
  );
}

/**
 * Sits between the nav and the account row. The three numbers that decide what
 * gets worked on today, each a link to the view that resolves it - so "2 items
 * to review" is one click from being cleared rather than a number to remember.
 * When all three are zero it says so, which is information too.
 */
function AttentionPanel({ attention }: { attention: AttentionCounts }) {
  const rows = [
    {
      label: "Awaiting a verdict",
      value: attention.pendingTriage,
      href: "/dashboard",
      urgent: false,
    },
    {
      label: "Due within 7 days",
      value: attention.dueSoon,
      href: "/dashboard?sort=deadline",
      urgent: true,
    },
    { label: "To review", value: attention.review, href: "/dashboard/review", urgent: false },
  ].filter((r) => r.value > 0);

  return (
    <div className="mt-auto border-t border-white/10 px-3 py-4">
      {/* Above the attention list, because "working right now" is a different
          kind of fact from "waiting for you" and answers a different question:
          not what to do next, but whether to keep waiting. */}
      <TriageStatus pending={attention.pendingTriage} href="/dashboard?view=pending" />

      <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
        Needs attention
      </p>
      {rows.length === 0 ? (
        <p className="px-2 text-xs leading-relaxed text-white/45">
          Nothing waiting. Every solicitation has a verdict and no deadline is inside a week.
        </p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((row) => (
            <Link
              key={row.label}
              href={row.href}
              className="press press-row flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/60 hover:bg-white/5 hover:text-white/90"
            >
              <span
                className={`tabular w-6 shrink-0 text-sm font-semibold ${
                  row.urgent ? "text-rfp-gold-bright" : "text-white"
                }`}
              >
                {row.value}
              </span>
              <span className="truncate">{row.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
