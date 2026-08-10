"use client";

import { useTransition } from "react";
import { approveQuestion, markQuestionSent } from "@/app/dashboard/rfps/[id]/actions";
import type { RfpQuestionRow } from "@/lib/supabase/types";
import { daysUntil } from "@/lib/rfp";

export function QuestionMemo({
  rfpId,
  questions,
  questionDeadline,
}: {
  rfpId: string;
  questions: RfpQuestionRow[];
  questionDeadline: string | null;
}) {
  const [pending, start] = useTransition();
  const days = daysUntil(questionDeadline);
  const windowClosed = days !== null && days < 0;

  const lanes = [
    { key: "public_memo" as const, title: "Public memo", blurb: "Strategic questions to the procurement contact, sent before the window closes." },
    { key: "incumbent_request" as const, title: "Records / background request", blurb: "Request for an incumbent or prior winning proposal. You send this one yourself." },
  ];

  return (
    <div className="mt-6">
      <h2 className="font-display text-sm font-semibold text-rfp-ink">Question memo</h2>
      <p className="mt-0.5 text-xs text-rfp-ink-muted">
        {questionDeadline === null
          ? "No question deadline found in the solicitation."
          : windowClosed
            ? `Question window closed ${Math.abs(days!)} day(s) ago - these can no longer be asked.`
            : `Question window closes in ${days} day(s).`}
      </p>

      {lanes.map((lane) => {
        const items = questions.filter((q) => q.lane === lane.key);
        if (!items.length) return null;
        return (
          <div key={lane.key} className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">{lane.title}</p>
            <p className="mt-0.5 text-xs text-rfp-ink-muted">{lane.blurb}</p>
            <ul className="mt-2 divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
              {items.map((q) => (
                <li key={q.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-rfp-ink">{q.question_text}</p>
                    {q.approved_by && (
                      <p className="mt-0.5 text-[11px] text-rfp-ink-muted">Approved by {q.approved_by}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {q.status === "sent" ? (
                      <span className="rounded-full bg-rfp-good/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rfp-good">
                        Sent
                      </span>
                    ) : q.status === "approved" ? (
                      <button
                        onClick={() => start(async () => void (await markQuestionSent(rfpId, q.id)))}
                        disabled={pending}
                        className="rounded-lg border border-rfp-border px-2.5 py-1 text-xs font-semibold text-rfp-ink-secondary hover:bg-rfp-surface-sunken disabled:opacity-50"
                        title="Records that you have sent it - nothing is dispatched from here"
                      >
                        Mark sent
                      </button>
                    ) : (
                      <button
                        onClick={() => start(async () => void (await approveQuestion(rfpId, q.id)))}
                        disabled={pending || windowClosed}
                        className="rounded-lg border border-rfp-border px-2.5 py-1 text-xs font-semibold text-rfp-ink-secondary hover:bg-rfp-surface-sunken disabled:opacity-40"
                        title={windowClosed ? "The question window has closed" : undefined}
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <p className="mt-2 text-[11px] leading-relaxed text-rfp-ink-muted">
        Nothing is emailed from this dashboard. Approving marks a question ready; you send it and
        mark it sent. Automatic delivery needs a mail credential that isn&rsquo;t connected.
      </p>
    </div>
  );
}
