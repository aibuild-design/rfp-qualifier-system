"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/components/ui/form";

type Block = { section_type: string; title: string; body: string };
type Engagement = {
  client: string;
  title: string;
  situation: string;
  what_we_did: string;
  outcome: string;
};

/**
 * Fill the library from a proposal Caravann has already written.
 *
 * The library is the ceiling on draft quality and filling it by hand means
 * reading an old proposal, deciding which paragraphs are reusable, choosing a
 * section for each, and retyping them. Nobody does that twice, which is why it
 * held twelve blocks.
 *
 * Reading one of his own submissions produced twenty-one candidates in a single
 * pass, all of them his own words.
 *
 * Nothing saves until it is ticked. A library that fills itself from a document
 * nobody checked is how a stray paragraph from somebody else's template ends up
 * in a submission, and everything drafted afterwards inherits it.
 */
export function LearnFromProposal() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [source, setSource] = useState<string | null>(null);
  const [held, setHeld] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);

  async function read(file: File) {
    setBusy(true);
    setError(null);
    setBlocks([]);
    setEngagements([]);
    setSaved(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/library/ingest", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not read that file.");
        return;
      }
      setBlocks(json.blocks ?? []);
      setEngagements(json.engagements ?? []);
      setChosen(new Set((json.blocks ?? []).map((_: Block, i: number) => i)));
      setSource(json.source ?? file.name);
      setHeld(json.alreadyHeld ?? 0);
    } catch {
      setError("Could not reach the reader.");
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    const supabase = createClient();
    const picked = blocks.filter((_, i) => chosen.has(i));
    if (picked.length) {
      const { error: err } = await supabase.from("language_blocks").insert(
        picked.map((b) => ({
          section_type: b.section_type,
          title: b.title,
          body: b.body,
          // Marked as a win only when Khaled says so. Whether this proposal was
          // won is not something the document itself reliably states.
          won: false,
          weight: 1,
          source: source ?? "Uploaded proposal",
        })),
      );
      if (err) return setError(`Not saved. ${err.message}`);
    }
    if (engagements.length) {
      await supabase.from("past_engagements").insert(
        engagements.map((e) => ({
          client: e.client,
          title: e.title,
          situation: e.situation,
          what_we_did: e.what_we_did,
          outcome: e.outcome,
          won: false,
        })),
      );
    }
    setSaved(`Added ${picked.length} block${picked.length === 1 ? "" : "s"}${engagements.length ? ` and ${engagements.length} engagement${engagements.length === 1 ? "" : "s"}` : ""}.`);
    setBlocks([]);
    setEngagements([]);
  }

  const grouped = blocks.reduce<Record<string, number[]>>((acc, b, i) => {
    (acc[b.section_type] ??= []).push(i);
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <p className="text-sm text-rfp-ink-secondary">
        Upload a proposal Caravann has already submitted. The desk reads out the passages worth
        reusing and any prior work it describes, in Caravann&rsquo;s own words. Nothing is saved
        until you tick it.
      </p>

      <label className="mt-3 inline-flex">
        <input
          type="file"
          accept=".docx,.pdf,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f);
            e.target.value = "";
          }}
        />
        <span className={`${buttonClass} cursor-pointer`}>
          {busy ? "Reading it…" : "Choose a proposal"}
        </span>
      </label>

      {busy && (
        <p className="mt-2 text-xs text-rfp-ink-muted">
          A long proposal takes a minute or two. It is being transcribed, not summarised.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, var(--rfp-critical) 8%, transparent)", color: "var(--rfp-critical)" }}>
          {error}
        </p>
      )}

      {saved && <p className="mt-3 text-sm font-medium text-rfp-good">{saved}</p>}

      {blocks.length > 0 && (
        <div className="mt-4 border-t border-rfp-border pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-rfp-ink">
              {blocks.length} passages from {source}
            </p>
            <button
              type="button"
              onClick={() => setChosen(chosen.size === blocks.length ? new Set() : new Set(blocks.map((_, i) => i)))}
              className="press text-xs font-medium text-rfp-ink-muted hover:text-rfp-ink"
            >
              {chosen.size === blocks.length ? "Untick all" : "Tick all"}
            </button>
          </div>
          {held > 0 && (
            <p className="mt-0.5 text-xs text-rfp-ink-muted">
              {held} skipped as already in the library.
            </p>
          )}

          <div className="mt-3 space-y-4">
            {Object.entries(grouped).map(([section, idxs]) => (
              <div key={section}>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
                  {section.replace(/_/g, " ")} · {idxs.length}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {idxs.map((i) => (
                    <li key={i} className="rounded-lg border border-rfp-border bg-rfp-surface-sunken px-4 py-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={chosen.has(i)}
                          onChange={() => {
                            const next = new Set(chosen);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            setChosen(next);
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-rfp-gold"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-rfp-ink">{blocks[i].title}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-rfp-ink-muted">
                            {blocks[i].body.slice(0, 220)}
                            {blocks[i].body.length > 220 ? "…" : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {engagements.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
                Prior work described · {engagements.length}
              </p>
              <ul className="mt-1.5 space-y-1">
                {engagements.map((e, i) => (
                  <li key={i} className="text-sm text-rfp-ink-secondary">
                    {e.client}: {e.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" onClick={() => void keep()} className={`${buttonClass} mt-4`}>
            Keep {chosen.size} of {blocks.length}
          </button>
        </div>
      )}
    </div>
  );
}
