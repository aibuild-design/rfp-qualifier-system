import Link from "next/link";

export type SettingsCard = {
  href: string;
  title: string;
  blurb: string;
  /** What is actually filled in, so the index reads as a to-do list. */
  status: string;
  /** True when something here is blocking or missing. */
  attention: boolean;
};

/**
 * Settings as a set of places to go, rather than one long page.
 *
 * Everything used to be stacked on a single screen, which meant the team's
 * biographies and the Slack webhook competed for the same scroll, and adding
 * depth anywhere made the page worse for everybody. Each area is now its own
 * page with room to grow.
 *
 * Every card carries what is actually filled in rather than only a name. A
 * settings menu that says "Team roster" tells you nothing; one that says
 * "2 of 13 have the detail a proposal needs" tells you what to do next.
 */
export function SettingsIndex({ groups }: { groups: { label: string; cards: SettingsCard[] }[] }) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
            {group.label}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {group.cards.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                // Reads as something you can click, which it did not.
                //
                // These are links to nine separate pages, but they looked like
                // panels: no arrow, and a hover that moved the background one
                // step, from #1b1a18 to #232220 in dark mode, which is a
                // difference you have to be looking for. Nothing said "there is
                // more behind this".
                //
                // The chevron is the part that does the work, because it is
                // visible before the pointer arrives. The rest, the lift, the
                // firmer border, the shadow, only confirms it once you are
                // there. The border moved out of a style attribute so hover can
                // actually override it: an inline style wins against a class,
                // so hover:border-* was silently doing nothing.
                className={`press group flex cursor-pointer flex-col rounded-xl border bg-rfp-surface px-5 py-4 transition duration-150 hover:-translate-y-0.5 hover:bg-rfp-surface-sunken hover:shadow-[0_4px_14px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold ${
                  c.attention ? "border-rfp-warning" : "border-rfp-border hover:border-rfp-border-strong"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-rfp-ink">{c.title}</span>
                  {c.attention && (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--rfp-warning)" }}
                    />
                  )}
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ml-auto h-4 w-4 shrink-0 text-rfp-ink-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-rfp-ink"
                  >
                    <path d="M7.5 4.5 13 10l-5.5 5.5" />
                  </svg>
                </span>
                <span className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">{c.blurb}</span>
                <span
                  className="mt-2 text-xs font-medium"
                  style={{ color: c.attention ? "var(--rfp-warning)" : "var(--rfp-ink-secondary)" }}
                >
                  {c.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
