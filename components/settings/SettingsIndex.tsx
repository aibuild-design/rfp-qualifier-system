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
                className="press flex flex-col rounded-xl border bg-rfp-surface px-5 py-4 hover:bg-rfp-surface-sunken"
                style={{ borderColor: c.attention ? "var(--rfp-warning)" : "var(--rfp-border)" }}
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-rfp-ink">{c.title}</span>
                  {c.attention && (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--rfp-warning)" }}
                    />
                  )}
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
