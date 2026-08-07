"use client";

import { useState, useTransition } from "react";
import { confirmAssignment, matchTeam } from "@/app/dashboard/rfps/[id]/actions";

export type AssignmentView = {
  id: string;
  status: "recommended" | "confirmed";
  match_reason: string | null;
  match_score: number | null;
  member_name: string;
  member_role: string | null;
  member_rate: number | null;
};

export function TeamMatch({ rfpId, assignments }: { rfpId: string; assignments: AssignmentView[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-rfp-ink">Team match</h2>
          <p className="mt-0.5 text-xs text-rfp-ink-muted">
            Recommended against the roster. Nothing is assigned until you confirm it.
          </p>
        </div>
        <button
          onClick={() =>
            start(async () => {
              const r = await matchTeam(rfpId);
              setMessage(r.error ?? `${r.recommended} recommendation(s)`);
            })
          }
          disabled={pending}
          className="rounded-lg border border-rfp-border px-3.5 py-2 text-sm font-semibold text-rfp-ink-secondary transition-colors hover:bg-rfp-surface-sunken disabled:opacity-50"
        >
          {pending ? "Matching…" : assignments.length ? "Re-run match" : "Suggest team"}
        </button>
      </div>

      {message && <p className="mt-2 text-xs font-medium text-rfp-ink-secondary">{message}</p>}

      <div className="mt-3 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
        {assignments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-rfp-ink-muted">No recommendations yet.</p>
        ) : (
          <ul className="divide-y divide-rfp-border">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-rfp-ink">
                    {a.member_name}
                    {a.member_role ? (
                      <span className="font-normal text-rfp-ink-muted"> · {a.member_role}</span>
                    ) : null}
                    {a.member_rate ? (
                      <span className="tabular font-normal text-rfp-ink-muted"> · ${a.member_rate}/hr</span>
                    ) : null}
                  </p>
                  {a.match_reason && (
                    <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-secondary">{a.match_reason}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {a.match_score !== null && (
                    <span className="tabular text-xs font-semibold text-rfp-ink-muted">{a.match_score}</span>
                  )}
                  {a.status === "confirmed" ? (
                    <span className="rounded-full bg-rfp-good/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rfp-good">
                      Confirmed
                    </span>
                  ) : (
                    <button
                      onClick={() => start(async () => void (await confirmAssignment(rfpId, a.id)))}
                      disabled={pending}
                      className="rounded-lg border border-rfp-border px-2.5 py-1 text-xs font-semibold text-rfp-ink-secondary hover:bg-rfp-surface-sunken disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
