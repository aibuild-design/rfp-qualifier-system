"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_IGNORE_TERMS, DEFAULT_SUBJECT_TERMS } from "@/lib/intake-filter";

/**
 * Which emails reach the desk.
 *
 * This rule used to live inside the n8n Gmail trigger's search query, where it
 * was neither visible nor editable here - and its failure mode is the quiet
 * one: an email that does not match is never fetched, so a missed opportunity
 * looks exactly like a slow week.
 *
 * Three controls rather than one, because they are one decision. Reading the
 * body catches the forward whose subject says "thought of you"; the ignore list
 * is the brake for anything noisy that follows, so it sits beside the switch
 * rather than in some other section.
 *
 * The ignore list ships empty. Broad terms are tempting and wrong here: this
 * mailbox mostly receives aggregator alerts, which carry "unsubscribe from" in
 * the footer and often call themselves newsletters, and the list is checked
 * against the body. A term added before seeing the mail drops the mail.
 */
export function IntakeFilterEditor({
  initialTerms,
  initialIgnore,
}: {
  initialTerms: string[];
  initialIgnore: string[];
}) {
  const [saved, setSaved] = useState<string | null>(null);

  function flash(error: { message: string } | null) {
    setSaved(error ? `Not saved. ${error.message}` : "Saved");
    setTimeout(() => setSaved(null), 2500);
  }

  return (
    <div className="flex flex-col gap-3">
      <ChipList
        label="Counts as a solicitation"
        hint="Matched against the subject, the attachment file names and the message body. Case is ignored, and a term matches where a word starts with it, so RFP catches RFPs."
        emptyWarning="Empty. Every email will be triaged."
        placeholder="bid opportunity"
        column="email_subject_terms"
        initial={initialTerms}
        defaults={[...DEFAULT_SUBJECT_TERMS]}
        onSaved={flash}
      />

      <ChipList
        label="Never triage"
        hint="Checked first, against the same text, so it overrules a match. Keep terms narrow and specific: this reads the body, so one broad word silently drops real solicitations."
        emptyWarning="Empty. Nothing is excluded, which is the safe default."
        placeholder="webinar"
        column="email_ignore_terms"
        initial={initialIgnore}
        defaults={[...DEFAULT_IGNORE_TERMS]}
        onSaved={flash}
      />

      {saved && <p className="text-xs font-medium text-rfp-good">{saved}</p>}
    </div>
  );
}

/**
 * Chips rather than a comma-separated string. A term like "request for
 * proposal" contains spaces, so a free-text field makes the user think about a
 * separator, and a stray comma silently creates a term that matches nothing.
 */
function ChipList({
  label,
  hint,
  emptyWarning,
  placeholder,
  column,
  initial,
  defaults,
  onSaved,
}: {
  label: string;
  hint: string;
  emptyWarning: string;
  placeholder: string;
  column: "email_subject_terms" | "email_ignore_terms";
  initial: string[];
  defaults: string[];
  onSaved: (error: { message: string } | null) => void;
}) {
  const [terms, setTerms] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  async function persist(next: string[]) {
    setTerms(next);
    // Spelled out rather than a computed key: a `{ [column]: next }` object
    // widens to a string index signature, which the generated row type rejects,
    // and widening the update payload to satisfy it would remove the check that
    // catches a misspelled column name here.
    const patch =
      column === "email_subject_terms" ? { email_subject_terms: next } : { email_ignore_terms: next };
    const { error } = await createClient().from("scoring_settings").update(patch).eq("id", true);
    onSaved(error);
  }

  const add = () => {
    const t = draft.trim();
    if (!t || terms.some((x) => x.toLowerCase() === t.toLowerCase())) return setDraft("");
    void persist([...terms, t]);
    setDraft("");
  };

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        {label}
      </p>

      <div className="flex flex-wrap gap-2">
        {terms.map((t) => (
          <span
            key={t}
            className="inline-flex min-h-11 items-center gap-0.5 rounded-full bg-rfp-surface-sunken py-0 pl-4 pr-0.5 text-sm text-rfp-ink"
          >
            {t}
            <button
              type="button"
              onClick={() => void persist(terms.filter((x) => x !== t))}
              aria-label={`Remove ${t}`}
              className="press inline-flex h-11 w-11 items-center justify-center rounded-full text-base leading-none text-rfp-ink-muted hover:bg-rfp-surface hover:text-rfp-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-critical"
            >
              ×
            </button>
          </span>
        ))}
        {terms.length === 0 && <span className="text-sm text-rfp-warning">{emptyWarning}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          aria-label={`Add to ${label}`}
          className="min-h-11 flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 text-base text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60 sm:text-sm"
        />
        <button
          type="button"
          onClick={add}
          className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface hover:opacity-90"
        >
          Add
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-rfp-ink-muted">
        <span>{hint}</span>
        {terms.join("|") !== defaults.join("|") && (
          <button
            type="button"
            onClick={() => void persist([...defaults])}
            className="press inline-flex min-h-11 items-center font-medium text-rfp-ink-secondary underline hover:text-rfp-ink"
          >
            Reset to defaults
          </button>
        )}
      </div>
    </div>
  );
}
