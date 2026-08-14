"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SUBJECT_TERMS } from "@/lib/intake-filter";

/**
 * Which subject lines reach the desk.
 *
 * This rule used to live inside the n8n Gmail trigger's search query, where it
 * was neither visible nor editable here - and its failure mode is the quiet
 * one: an email that does not match is never fetched, so a missed opportunity
 * looks exactly like a slow week.
 *
 * Chips rather than a comma-separated string. A term like "request for
 * proposal" contains spaces, so a free-text field makes the user think about a
 * separator, and a stray comma silently creates a term that matches nothing.
 */
export function SubjectTermsEditor({ initial }: { initial: string[] }) {
  const [terms, setTerms] = useState<string[]>(initial.length ? initial : [...DEFAULT_SUBJECT_TERMS]);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  async function persist(next: string[]) {
    setTerms(next);
    const supabase = createClient();
    const { error } = await supabase
      .from("scoring_settings")
      .update({ email_subject_terms: next })
      .eq("id", true);
    setSaved(error ? `Not saved — ${error.message}` : "Saved");
    setTimeout(() => setSaved(null), 2500);
  }

  const add = () => {
    const t = draft.trim();
    if (!t || terms.some((x) => x.toLowerCase() === t.toLowerCase())) return setDraft("");
    void persist([...terms, t]);
    setDraft("");
  };

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <div className="flex flex-wrap gap-2">
        {terms.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 rounded-full bg-rfp-surface-sunken px-3 py-1.5 text-sm text-rfp-ink"
          >
            {t}
            <button
              type="button"
              onClick={() => void persist(terms.filter((x) => x !== t))}
              aria-label={`Remove ${t}`}
              className="press -mr-1 rounded-full px-1 text-rfp-ink-muted hover:text-rfp-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-critical"
            >
              ×
            </button>
          </span>
        ))}
        {terms.length === 0 && (
          <span className="text-sm text-rfp-warning">Empty — every email will be triaged.</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="bid opportunity"
          className="min-h-11 flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 text-base text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60 sm:text-sm"
        />
        <button
          type="button"
          onClick={add}
          className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-black px-4 text-sm font-semibold text-white hover:bg-rfp-black-2"
        >
          Add
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-rfp-ink-muted">
        <span>Matched anywhere in the subject, ignoring case.</span>
        {terms.join("|") !== DEFAULT_SUBJECT_TERMS.join("|") && (
          <button
            type="button"
            onClick={() => void persist([...DEFAULT_SUBJECT_TERMS])}
            className="press font-medium text-rfp-ink-secondary underline hover:text-rfp-ink"
          >
            Reset to defaults
          </button>
        )}
        {saved && <span className="font-medium text-rfp-good">{saved}</span>}
      </div>
    </div>
  );
}
