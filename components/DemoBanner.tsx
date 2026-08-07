// Shown whenever seeded demo RFPs are present. Deliberately loud: this
// dashboard exists to drive go/no-go calls on six-figure bids, so example
// data must never be mistakable for a real solicitation.
export function DemoBanner({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-rfp-serious/40 bg-rfp-serious/10 p-4">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rfp-serious text-[11px] font-bold text-white">
        !
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-rfp-ink">
          Showing {count} example {count === 1 ? "solicitation" : "solicitations"} — not real
        </p>
        <p className="mt-1 text-sm leading-relaxed text-rfp-ink-secondary">
          These are seeded to demonstrate the dashboard. The agencies, deadlines, and budgets
          are invented, and the sector map behind their scores holds placeholder figures.
          Do not act on any verdict here. Remove them with{" "}
          <code className="rounded bg-rfp-surface px-1.5 py-0.5 text-xs">
            npm run seed:demo -- --purge
          </code>
          .
        </p>
      </div>
    </div>
  );
}

export function DemoTag() {
  return (
    <span className="ml-2 inline-flex shrink-0 items-center rounded bg-rfp-serious/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rfp-serious align-middle">
      Demo
    </span>
  );
}
