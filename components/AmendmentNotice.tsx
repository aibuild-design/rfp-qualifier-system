"use client";

import { useTransition } from "react";
import { markAmendmentReviewed } from "@/app/dashboard/rfps/[id]/actions";

export type RelatedDocument = {
  id: string;
  kind: "addendum" | "clarifying_questions" | "notice";
  sequence: number | null;
  title: string | null;
  body: string | null;
  received_at: string;
};

const KIND_LABEL: Record<RelatedDocument["kind"], string> = {
  addendum: "Addendum",
  clarifying_questions: "Answers to bidders' questions",
  notice: "Posting notice",
};

/**
 * Amendments and answer sets that arrived after the bid was triaged.
 *
 * Loud on purpose, and above everything else on the page. An addendum can move
 * a deadline, delete scoring weight or reverse a page limit, and the verdict
 * above it was computed before any of that existed. Khaled's own example moves
 * a deadline by a month and deletes fifteen points.
 *
 * The desk deliberately does not re-triage or recompute. What a moved deadline
 * means for a bid already accepted is a judgement, and quietly rescoring
 * underneath a decision somebody made is exactly the kind of thing that gets
 * believed without being noticed. It shows the text and gets out of the way.
 */
export function AmendmentNotice({
  rfpId,
  unreviewed,
  documents,
}: {
  rfpId: string;
  unreviewed: boolean;
  documents: RelatedDocument[];
}) {
  const [pending, start] = useTransition();
  if (documents.length === 0) return null;

  return (
    <section
      className="mt-6 rounded-xl border-2 p-5"
      style={{
        borderColor: unreviewed ? "var(--rfp-warning)" : "var(--rfp-border)",
        background: unreviewed
          ? "color-mix(in srgb, var(--rfp-warning) 7%, var(--rfp-surface))"
          : "var(--rfp-surface)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="font-display text-base font-semibold text-rfp-ink">
          {unreviewed ? "The agency changed something" : "Amendments on file"}
        </h2>
        {unreviewed && (
          <button
            type="button"
            onClick={() => start(async () => void (await markAmendmentReviewed(rfpId)))}
            disabled={pending}
            className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "I have read these"}
          </button>
        )}
      </div>

      <p className="mt-1 text-xs leading-relaxed text-rfp-ink-muted">
        {unreviewed
          ? "The verdict above was reached before these arrived. Nothing has been rescored, because what an amendment means for a bid is your call, not arithmetic. Re-run triage if it changes the picture."
          : "Read and acknowledged. Kept with the bid as the record of what changed."}
      </p>

      <ul className="mt-3 space-y-2">
        {documents
          .slice()
          .sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))
          .map((doc) => (
            <li key={doc.id} className="overflow-hidden rounded-lg border border-rfp-border bg-rfp-surface">
              <details>
                <summary className="press flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                  <span className="text-sm font-semibold text-rfp-ink">
                    {KIND_LABEL[doc.kind]}
                    {doc.sequence === null ? "" : ` ${doc.sequence}`}
                  </span>
                  <span className="text-xs text-rfp-ink-muted">
                    arrived {new Date(doc.received_at).toLocaleDateString()}
                  </span>
                  <span className="ml-auto text-xs font-medium text-rfp-gold">Read it</span>
                </summary>
                <p className="whitespace-pre-line border-t border-rfp-border px-4 py-3 text-sm leading-relaxed text-rfp-ink-secondary">
                  {doc.body ?? "No text was captured."}
                </p>
              </details>
            </li>
          ))}
      </ul>
    </section>
  );
}
