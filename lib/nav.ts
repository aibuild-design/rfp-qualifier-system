/**
 * The single definition of what's in the dashboard nav.
 *
 * Pure data, no JSX - so the dark rail, the mobile bar, and any server
 * component that needs to know the routes all read the same list. Icons are
 * looked up by `key` at the render site, which keeps this file importable from
 * server components without pulling a component tree along with it.
 */

export type NavCountKey = "queue" | "review" | "proposals";

export type NavItem = {
  /** Stable id - also the icon lookup key. */
  key: "overview" | "queue" | "proposals" | "library" | "review" | "settings";
  label: string;
  href: string;
  /** Which live count to show as a badge, if any. */
  countKey?: NavCountKey;
  /** `attention` badges are gold - something is waiting on a person. */
  countTone?: "attention" | "neutral";
  /**
   * Extra path prefixes that should light this item up. An RFP detail page
   * belongs to the queue, so `/dashboard/rfps/…` keeps "RFP queue" selected
   * rather than leaving the whole nav looking unselected.
   */
  alsoMatches?: string[];
};

export type NavGroup = { label: string; items: NavItem[] };

export type NavCounts = Record<NavCountKey, number>;

/** The three numbers that decide what gets worked on today. Shown in the rail
 *  so they are on screen on every page, not just the ones that query them. */
export type AttentionCounts = {
  /** Submitted, no verdict back yet. */
  pendingTriage: number;
  /** Open compliance items falling due inside 7 days. */
  dueSoon: number;
  /** Edge cases the weekly pass has not cleared. */
  review: number;
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Bid desk",
    items: [
      { key: "overview", label: "Overview", href: "/dashboard/overview" },
      {
        key: "queue",
        label: "RFP queue",
        href: "/dashboard",
        countKey: "queue",
        countTone: "neutral",
        alsoMatches: ["/dashboard/rfps"],
      },
      {
        // Deciding and writing are different jobs, days apart, and were sharing
        // one page. The queue is where a bid is judged; this is where the ones
        // already accepted are worked on.
        key: "proposals",
        label: "Proposals",
        href: "/dashboard/proposals",
        countKey: "proposals",
        countTone: "neutral",
      },
    ],
  },
  {
    label: "Prepare & tune",
    items: [
      { key: "library", label: "Approved language", href: "/dashboard/library" },
      {
        key: "review",
        label: "Weekly review",
        href: "/dashboard/review",
        countKey: "review",
        countTone: "attention",
      },
      { key: "settings", label: "Settings", href: "/dashboard/settings" },
    ],
  },
];

/**
 * `/dashboard` is the queue and also the prefix of every other route, so an
 * exact match is required for it while the rest match their own subtrees.
 */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)) return true;
  return (item.alsoMatches ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
