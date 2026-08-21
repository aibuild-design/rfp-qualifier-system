/**
 * How solicitations actually reach the desk.
 *
 * The schema has recorded this on every bid since the first migration and
 * nothing has ever shown it, which left an open product question with no
 * evidence attached: the desk triages what it is handed and never goes looking,
 * and whether that is a gap depends entirely on where Khaled's work comes from.
 * Guessing at it means either building portal crawlers nobody needs or missing
 * the one thing that would help.
 *
 * Two weeks of real use answers it. Mostly emailed means the inbound design is
 * right and the mailbox simply needs subscribing. Mostly added by hand means he
 * is still doing the finding himself, and by then this panel also names the
 * portals worth watching, because they are the ones he actually used.
 */
export function WhereTheyComeFrom({
  counts,
}: {
  counts: { aggregator: number; email: number; manual: number; portal: number };
}) {
  const rows = [
    { key: "aggregator", label: "Emailed by an aggregator", n: counts.aggregator },
    { key: "email", label: "Emailed directly by an agency", n: counts.email },
    { key: "manual", label: "Added by hand", n: counts.manual },
    { key: "portal", label: "Pulled from a portal", n: counts.portal },
  ];
  const total = rows.reduce((n, r) => n + r.n, 0);

  return (
    <section className="mt-8 rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        How they reach the desk
      </h2>

      {total === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-rfp-ink-muted">
          Nothing has arrived yet. Once real solicitations start coming in, this says whether they
          find their own way here or whether Khaled is still doing the finding.
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3">
                <span className="tabular w-8 text-sm font-semibold text-rfp-ink">{r.n}</span>
                <span
                  aria-hidden
                  className="h-1.5 rounded-full bg-rfp-gold"
                  style={{ width: `${total ? Math.round((r.n / total) * 160) : 0}px`, minWidth: r.n ? "6px" : "0" }}
                />
                <span className="text-sm text-rfp-ink-secondary">{r.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-rfp-ink-muted">
            {counts.manual > total / 2
              ? "Most are being added by hand, which means the finding is still manual. The portals behind those entries are the ones worth watching."
              : "Most are arriving on their own. The inbound path is doing its job."}
          </p>
        </>
      )}
    </section>
  );
}
