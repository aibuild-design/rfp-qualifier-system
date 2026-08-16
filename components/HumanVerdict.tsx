"use client";

import { useState, useTransition } from "react";
import { setHumanVerdict } from "@/app/dashboard/rfps/[id]/actions";
import { VERDICT_META } from "@/lib/rfp";
import type { RfpStatus } from "@/lib/supabase/types";
import { buttonClass, buttonSecondaryClass, fieldClass } from "@/components/ui/form";

const CHOICES: RfpStatus[] = ["go", "maybe", "no_go"];

/**
 * Where a human disagrees with the desk - and, more importantly, says why.
 *
 * Sits on the verdict card because that is where the disagreement happens: you
 * read the reasoning, you think "no, we'd never win that", and the thought is
 * gone thirty seconds later unless there is somewhere to put it.
 *
 * The note is the point. A verdict alone says the desk was wrong; a note says
 * *how*, and "the score is fine, we just have no healthcare references" is a
 * settings change rather than a code change. So the field is offered every
 * time, including when the human agrees - confirmations are evidence too, and a
 * calibration set of only disagreements would be badly skewed.
 */
export function HumanVerdict({
  rfpId,
  computed,
  current,
  currentNote,
  decidedAt,
}: {
  rfpId: string;
  computed: RfpStatus;
  current: RfpStatus | null;
  currentNote: string | null;
  decidedAt: string | null;
}) {
  const [choice, setChoice] = useState<RfpStatus | null>(current);
  const [note, setNote] = useState(currentNote ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(verdict: RfpStatus | null) {
    setError(null);
    start(async () => {
      const res = await setHumanVerdict(rfpId, verdict as "go" | "no_go" | "maybe" | null, note);
      if (!res.ok) setError(res.error ?? "Could not save that - try again.");
    });
  }

  return (
    <div
      className="mt-6 rounded-xl border-2 bg-rfp-surface p-5"
      style={{ borderColor: current ? "var(--rfp-border-strong)" : "var(--rfp-gold)" }}
    >
      {current && (
        <p className="mb-3 text-sm text-rfp-ink">
          <span className="font-semibold">
            Recorded: {VERDICT_META[current].label}
            {decidedAt ? ` on ${new Date(decidedAt).toLocaleDateString()}` : ""}
          </span>
          <span className="text-rfp-ink-muted">
            {current === computed ? " - same as the desk" : ` - the desk said ${VERDICT_META[computed].label}`}
          </span>
        </p>
      )}
      <p className="text-base font-semibold text-rfp-ink">
        {current ? "Change your decision" : "Are you bidding this?"}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
        The desk said <span className="font-medium text-rfp-ink">{VERDICT_META[computed].label}</span>. Your
        answer is kept alongside it, never instead of it - the gap between the two is how we find out
        whether the scoring is set right.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c}
            onClick={() => setChoice(c)}
            aria-pressed={choice === c}
            className={`press inline-flex min-h-11 items-center rounded-lg border px-3.5 text-sm font-semibold ${
              choice === c
                ? "border-rfp-ink bg-rfp-ink text-rfp-surface"
                : "border-rfp-border bg-rfp-surface text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
            }`}
          >
            {VERDICT_META[c].label}
          </button>
        ))}
      </div>

      <label htmlFor="verdict-note" className="mt-4 block text-sm font-medium text-rfp-ink-secondary">
        Why? <span className="font-normal text-rfp-ink-muted">- the most useful part</span>
      </label>
      <textarea
        id="verdict-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Score is about right, but we have no healthcare references so we'd never place"
        className={`${fieldClass} mt-1.5`}
      />

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-rfp-critical">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => save(choice)} disabled={!choice || pending} className={buttonClass}>
          {pending ? "Saving…" : "Record it"}
        </button>
        <button
          onClick={() => {
            setChoice(current);
            setNote(currentNote ?? "");
          }}
          disabled={pending || (choice === current && note === (currentNote ?? ""))}
          className={buttonSecondaryClass}
        >
          Reset
        </button>
        {current && (
          <button onClick={() => save(null)} disabled={pending} className={`${buttonSecondaryClass} ml-auto`}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
