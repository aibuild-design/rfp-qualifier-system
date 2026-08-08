"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, isNavItemActive, type NavCounts } from "@/lib/nav";

/**
 * Below `lg` the dark rail is hidden, which previously left no way to reach any
 * page but the one you were on. This is the same nav list flattened into a
 * scrollable strip — no drawer, no toggle state, everything one tap away.
 */
export function MobileNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const items = NAV_GROUPS.flatMap((g) => g.items);

  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-rfp-border bg-rfp-surface px-4 py-2 lg:hidden">
      {items.map((item) => {
        const active = isNavItemActive(pathname, item);
        const badge = item.countKey ? counts[item.countKey] : 0;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-rfp-black text-white"
                : "text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
            }`}
          >
            {item.label}
            {badge > 0 && (
              <span
                className={`tabular rounded-full px-1.5 text-[10px] font-semibold ${
                  active ? "bg-white/20 text-white" : "bg-rfp-surface-sunken text-rfp-ink-muted"
                }`}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
