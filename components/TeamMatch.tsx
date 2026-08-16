"use client";

import { useOptimistic, useState, useTransition } from "react";
import { assignMember, confirmAssignment, matchTeam, unconfirmAssignment } from "@/app/dashboard/rfps/[id]/actions";

export type AssignmentView = {
  id: string;
  status: "recommended" | "confirmed";
  match_reason: string | null;
  match_score: number | null;
  member_name: string;
  member_role: string | null;
  member_rate: number | null;
};

export function TeamMatch({
  rfpId,
  assignments,
  roster,
}: {
  rfpId: string;
  assignments: AssignmentView[];
  /** The whole active roster, so someone the matcher missed can still be put on
   *  the bid. Ranking by word overlap is a prompt, not a verdict. */
  roster: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  // Confirming flips the badge on the click. It is the user's own decision
  // and the server is not being asked whether it is allowed, only to record
  // it, so there is nothing to wait for before showing it.
  const [justConfirmed, markConfirmed] = useOptimistic<string[], string>([], (l, id) => [...l, id]);

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
          className="rounded-lg border border-rfp-border px-3.5 py-2 text-sm font-semibold text-rfp-ink-secondary press hover:bg-rfp-surface-sunken disabled:opacity-50"
        >
          {pending ? "Matching…" : assignments.length ? "Re-run match" : "Suggest team"}
        </button>
      </div>

      {message && <p className="mt-2 text-xs font-medium text-rfp-ink-secondary">{message}</p>}

      <div className="mt-3 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
        {assignments.length === 0 ? (
          <p className="px-5 py-4 text-sm leading-relaxed text-rfp-ink-muted">
            No recommendations. Usually the document could not be read, so there is nothing to
            match against.
          </p>
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
                  {a.status === "confirmed" || justConfirmed.includes(a.id) ? (
                    <>
                      <span className="rounded-full bg-rfp-good/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rfp-good">
                        Confirmed
                      </span>
                      {/* Confirming was one-way, so a person put on a bid by
                          mistake stayed on it. They go back to being a
                          suggestion rather than being deleted: the match reason
                          and score that explained the pick are worth keeping. */}
                      <button
                        onClick={() => start(async () => void (await unconfirmAssignment(rfpId, a.id)))}
                        disabled={pending}
                        className="press px-1 text-xs font-medium text-rfp-ink-muted hover:text-rfp-critical disabled:opacity-40"
                        title="Take them off this bid"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() =>
                        start(async () => {
                          markConfirmed(a.id);
                          await confirmAssignment(rfpId, a.id);
                        })
                      }
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
      {roster.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="min-h-11 flex-1 rounded-lg border border-rfp-border bg-rfp-surface px-3 text-sm text-rfp-ink focus:border-rfp-gold focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
          >
            <option value="">Add someone else…</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pick || pending}
            onClick={() =>
              start(async () => {
                const r = await assignMember(rfpId, pick);
                setMessage(r.error ?? "Added");
                setPick("");
              })
            }
            className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-4 text-sm font-medium text-rfp-ink hover:bg-rfp-surface-sunken disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
