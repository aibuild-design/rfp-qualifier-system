/**
 * The files that go out with every submission.
 *
 * Shown on the bid page rather than only in Settings, because the question
 * "what else goes in the envelope" is asked while looking at a bid, not while
 * looking at configuration. Settings is where they are managed; this is where
 * they are remembered.
 *
 * Expiry is the part worth surfacing loudly. An insurance certificate that
 * lapsed in March is worse than not having one, because it gets attached with
 * confidence and makes the submission non-responsive in a way nobody checks
 * for.
 */
export type StandingDoc = {
  id: string;
  label: string;
  file_name: string;
  expires_on: string | null;
};

export function StandingDocuments({ docs }: { docs: StandingDoc[] }) {
  if (docs.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">Attach to every submission</h2>
        <p className="mt-2 rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface px-5 py-4 text-sm leading-relaxed text-rfp-ink-secondary">
          Nothing recorded. Add the insurance certificate, W-9 and signed certifications in{" "}
          <a href="/dashboard/settings" className="font-medium text-rfp-gold hover:underline">
            Settings
          </a>{" "}
          and they will appear on every bid from then on.
        </p>
      </section>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="mt-8">
      <h2 className="font-display text-sm font-semibold text-rfp-ink">Attach to every submission</h2>
      <ul className="mt-3 divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
        {docs.map((doc) => {
          const expired = doc.expires_on !== null && doc.expires_on < today;
          return (
            <li key={doc.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5">
              <span className="text-sm font-medium text-rfp-ink">{doc.label}</span>
              <span className="text-xs text-rfp-ink-muted">{doc.file_name}</span>
              {doc.expires_on && (
                <span
                  className="tabular ml-auto text-xs font-medium"
                  style={{ color: expired ? "var(--rfp-critical)" : "var(--rfp-ink-muted)" }}
                >
                  {expired ? `Expired ${doc.expires_on}` : `Valid to ${doc.expires_on}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
