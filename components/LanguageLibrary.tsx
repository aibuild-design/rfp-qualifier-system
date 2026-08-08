"use client";

import { useState, useTransition } from "react";
import { addBlock, removeBlock, toggleWon } from "@/app/dashboard/library/actions";
import { DEFAULT_SECTIONS } from "@/lib/proposal";
import type { LanguageBlockRow } from "@/lib/supabase/types";

export function LanguageLibrary({ blocks }: { blocks: LanguageBlockRow[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    section_type: DEFAULT_SECTIONS[0].section_type as string,
    title: "",
    body: "",
    source: "",
    won: false,
    is_boilerplate: false,
  });

  function submit() {
    start(async () => {
      const r = await addBlock(form);
      if (r.error) return setError(r.error);
      setForm({ ...form, title: "", body: "", source: "", won: false, is_boilerplate: false });
      setAdding(false);
      setError(null);
    });
  }

  const grouped = DEFAULT_SECTIONS.map((s) => ({
    ...s,
    items: blocks.filter((b) => b.section_type === s.section_type),
  }));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg bg-rfp-black px-3.5 py-2 text-sm font-semibold text-white hover:bg-rfp-black-2"
        >
          {adding ? "Cancel" : "Add language block"}
        </button>
      </div>

      {adding && (
        <div className="mb-6 space-y-3 rounded-xl border border-rfp-border bg-rfp-surface p-5">
          <div className="flex flex-wrap gap-3">
            <select
              value={form.section_type}
              onChange={(e) => setForm({ ...form, section_type: e.target.value })}
              className="rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-base sm:text-sm text-rfp-ink focus:border-rfp-gold focus:outline-none"
            >
              {DEFAULT_SECTIONS.map((s) => (
                <option key={s.section_type} value={s.section_type}>
                  {s.heading}
                </option>
              ))}
            </select>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Short title"
              className="min-w-0 flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none"
            />
          </div>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={6}
            placeholder="The approved text. Use {{CLIENT}}, {{ENGAGEMENT}}, {{PROJECT_TYPE}} and {{DUE_DATE}} where the wording should change per bid."
            className="w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-sm leading-relaxed text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-4">
            <input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="Which proposal it came from"
              className="min-w-0 flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none"
            />
            <label className="flex items-center gap-2 text-sm text-rfp-ink-secondary">
              <input
                type="checkbox"
                checked={form.won}
                onChange={(e) => setForm({ ...form, won: e.target.checked })}
                className="h-4 w-4 accent-rfp-black"
              />
              From a win
            </label>
            <label className="flex items-center gap-2 text-sm text-rfp-ink-secondary" title="Copied verbatim, never rewritten">
              <input
                type="checkbox"
                checked={form.is_boilerplate}
                onChange={(e) => setForm({ ...form, is_boilerplate: e.target.checked })}
                className="h-4 w-4 accent-rfp-black"
              />
              Locked boilerplate
            </label>
            <button
              onClick={submit}
              disabled={pending}
              className="rounded-lg bg-rfp-black px-3.5 py-2 text-sm font-semibold text-white hover:bg-rfp-black-2 disabled:opacity-50"
            >
              Save
            </button>
          </div>
          {error && <p className="text-xs text-rfp-critical">{error}</p>}
        </div>
      )}

      <div className="space-y-5">
        {grouped.map((g) => (
          <div key={g.section_type}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-sm font-semibold text-rfp-ink">{g.heading}</h2>
              <span className="text-xs text-rfp-ink-muted">
                {g.items.length === 0 ? "nothing on file" : `${g.items.length} block(s)`}
              </span>
            </div>
            <div className="mt-2 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
              {g.items.length === 0 ? (
                <p className="px-5 py-3 text-sm text-rfp-ink-muted">
                  A draft will mark this section &ldquo;needs writing by hand&rdquo;.
                </p>
              ) : (
                <ul className="divide-y divide-rfp-border">
                  {g.items.map((b) => (
                    <li key={b.id}>
                      <div className="flex items-start justify-between gap-3 px-5 py-3">
                        <button onClick={() => setOpen(open === b.id ? null : b.id)} className="min-w-0 flex-1 text-left">
                          <p className="text-sm font-medium text-rfp-ink">
                            {b.title}
                            {b.won && (
                              <span className="ml-2 rounded bg-rfp-good/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rfp-good">
                                Win
                              </span>
                            )}
                            {b.is_boilerplate && (
                              <span className="ml-2 rounded bg-rfp-surface-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rfp-ink-muted">
                                Locked
                              </span>
                            )}
                          </p>
                          {b.source && <p className="mt-0.5 text-xs text-rfp-ink-muted">{b.source}</p>}
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => start(async () => void (await toggleWon(b.id, !b.won)))}
                            disabled={pending}
                            className="text-xs text-rfp-ink-muted hover:text-rfp-ink disabled:opacity-50"
                          >
                            {b.won ? "Unmark win" : "Mark win"}
                          </button>
                          <button
                            onClick={() => start(async () => void (await removeBlock(b.id)))}
                            disabled={pending}
                            className="text-xs text-rfp-ink-muted hover:text-rfp-critical disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {open === b.id && (
                        <p className="whitespace-pre-line border-t border-rfp-border bg-rfp-surface-sunken/40 px-5 py-3 text-sm leading-relaxed text-rfp-ink-secondary">
                          {b.body}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
