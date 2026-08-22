"use client";

import { useState, useTransition } from "react";
import { refileProposal } from "@/app/dashboard/rfps/[id]/actions";

/**
 * File the document again, without touching a word of the draft.
 *
 * A template fix improves every proposal that has not been rebuilt, and none of
 * them see it: the sections are in the database but the .docx in Drive was
 * assembled by whatever the code was on the day it was built. Rebuilding picks
 * the fix up and also recomposes five sections through OpenRouter, at roughly
 * fifty cents, rewriting prose that was already right.
 *
 * Sits beside "Open in Google Docs" rather than next to Rebuild, because the
 * two do different things and putting them together invites the expensive one
 * to be pressed by mistake.
 */
export function RefileButton({ rfpId }: { rfpId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await refileProposal(rfpId);
            setNote("error" in result && result.error ? result.error : "Filed again. The draft is unchanged.");
            setTimeout(() => setNote(null), 6000);
          })
        }
        className="press inline-flex min-h-11 items-center text-sm font-medium text-rfp-ink-secondary underline decoration-rfp-border underline-offset-4 hover:text-rfp-ink disabled:opacity-50"
        title="Rebuilds the document from the sections already written. Costs nothing and changes no text."
      >
        {pending ? "Filing…" : "File it again"}
      </button>
      {note && <span className="text-xs font-medium text-rfp-ink-muted">{note}</span>}
    </span>
  );
}
