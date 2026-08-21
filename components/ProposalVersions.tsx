import Link from "next/link";
import { formatDateTime } from "@/lib/rfp";

export type ProposalVersionRow = {
  id: string;
  version: number;
  created_at: string;
  word_count: number;
  section_count: number;
  written_count: number;
  doc_url: string | null;
};

/**
 * Every earlier build of this proposal, newest first.
 *
 * Rebuilding replaces the draft in place, so before this the previous version
 * existed only as an orphaned Google Doc carrying the same name as the one
 * that replaced it. Two identical titles already sit in one bid folder with
 * nothing to say which is which. A rebuild after a bad edit was simply lost.
 *
 * Each row leads with how many sections were written for the bid rather than
 * stitched from the library, because that is the number that separates a real
 * draft from one that quietly fell back - a build showing "0 written" is the
 * signature of the composer never running, which has happened twice.
 */
export function ProposalVersions({ versions }: { versions: ProposalVersionRow[] }) {
  if (versions.length <= 1) return null;

  const [current, ...earlier] = versions;

  return (
    <section className="mt-8 rounded-xl border border-rfp-border bg-rfp-surface p-6">
      <h2 className="font-display text-base font-semibold text-rfp-ink">Earlier drafts</h2>
      <p className="mt-1 text-sm leading-relaxed text-rfp-ink-muted">
        Every rebuild is kept. Version {current.version} is the one shown above.
      </p>

      <ul className="mt-4 divide-y divide-rfp-border border-t border-rfp-border">
        {earlier.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
            <span className="min-w-16 text-sm font-medium text-rfp-ink">
              Version {v.version}
            </span>
            <span className="text-sm text-rfp-ink-muted">{formatDateTime(v.created_at)}</span>
            <span className="tabular text-sm text-rfp-ink-secondary">
              {v.word_count.toLocaleString()} words
            </span>
            <span
              className="tabular text-sm"
              style={{
                color: v.written_count === 0 ? "var(--rfp-warning)" : "var(--rfp-ink-secondary)",
              }}
              title={
                v.written_count === 0
                  ? "Nothing was written for this solicitation; every section fell back to the library."
                  : undefined
              }
            >
              {v.written_count} of {v.section_count} written for the bid
            </span>

            <span className="ml-auto flex items-center gap-4">
              <Link
                href={`/dashboard/proposals/versions/${v.id}`}
                className="press text-sm font-semibold text-rfp-gold underline decoration-rfp-gold/40 underline-offset-4 hover:decoration-rfp-gold"
              >
                Read
              </Link>
              {v.doc_url && (
                <a
                  href={v.doc_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press text-sm font-medium text-rfp-ink-secondary underline underline-offset-4 hover:text-rfp-ink"
                >
                  Its Doc
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
