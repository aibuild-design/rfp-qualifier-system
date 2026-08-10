"use client";

import { useState, useTransition } from "react";
import { approveSection, buildDraft } from "@/app/dashboard/rfps/[id]/actions";
import type { ProposalSectionRow } from "@/lib/supabase/types";

export function ProposalDraft({
  rfpId,
  sections,
  fileName,
  libraryCount,
}: {
  rfpId: string;
  sections: ProposalSectionRow[];
  fileName: string;
  libraryCount: number;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  function rebuild() {
    start(async () => {
      const r = await buildDraft(rfpId);
      setMessage(
        r.error
          ? r.error
          : `${r.drafted} section(s) drafted, ${r.needsInput} need writing by hand` +
            (r.preserved ? `, ${r.preserved} approved section(s) left untouched` : "")
      );
    });
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-rfp-ink">Proposal draft</h2>
          <p className="mt-0.5 text-xs text-rfp-ink-muted">
            Stitched from the approved-language library - never a blank page, never invented text.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sections.length > 0 && (
            <a
              href={`/api/rfps/${rfpId}/docx`}
              className="rounded-lg border border-rfp-border px-3.5 py-2 text-sm font-semibold text-rfp-ink-secondary press hover:bg-rfp-surface-sunken"
            >
              Download .docx
            </a>
          )}
          <button
            onClick={rebuild}
            disabled={pending}
            className="rounded-lg bg-rfp-black px-3.5 py-2 text-sm font-semibold text-white press hover:bg-rfp-black-2 disabled:opacity-50"
          >
            {pending ? "Building…" : sections.length ? "Rebuild draft" : "Build draft"}
          </button>
        </div>
      </div>

      {message && <p className="mt-2 text-xs font-medium text-rfp-ink-secondary">{message}</p>}

      {libraryCount === 0 && (
        <p className="mt-3 rounded-lg border border-rfp-serious/40 bg-rfp-serious/10 p-3 text-xs leading-relaxed text-rfp-ink-secondary">
          The approved-language library is empty, so every section will come back as
          &ldquo;needs writing by hand&rdquo;. Load it from Caravann&rsquo;s past proposals and
          winning submissions - that library is what makes a draft sound like Caravann rather
          than like a language model.
        </p>
      )}

      {sections.length > 0 && (
        <>
          <p className="mt-3 text-xs text-rfp-ink-muted">
            Will export as{" "}
            <code className="rounded bg-rfp-surface-sunken px-1.5 py-0.5">{fileName}.docx</code>
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
            {sections.map((s) => {
              const isOpen = open === s.id;
              return (
                <div key={s.id} className="border-b border-rfp-border last:border-0">
                  <button
                    onClick={() => setOpen(isOpen ? null : s.id)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-rfp-surface-sunken/60"
                  >
                    <SectionStatusDot status={s.status} />
                    <span className="flex-1 text-sm font-medium text-rfp-ink">{s.heading}</span>
                    <span className="text-xs text-rfp-ink-muted">{s.notes}</span>
                    <span className="text-rfp-ink-muted">{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-rfp-border bg-rfp-surface-sunken/40 px-5 py-4">
                      {s.body ? (
                        <p className="whitespace-pre-line text-sm leading-relaxed text-rfp-ink-secondary">
                          {s.body}
                        </p>
                      ) : (
                        <p className="text-sm italic text-rfp-ink-muted">
                          Nothing on file for this section. Write it by hand, then add the text to
                          the library so the next bid starts from it.
                        </p>
                      )}
                      {s.status !== "approved" && s.body && (
                        <button
                          onClick={() => start(async () => void (await approveSection(rfpId, s.id)))}
                          disabled={pending}
                          className="mt-3 rounded-lg border border-rfp-border px-3 py-1.5 text-xs font-semibold text-rfp-ink-secondary hover:bg-rfp-surface disabled:opacity-50"
                        >
                          Mark approved
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SectionStatusDot({ status }: { status: ProposalSectionRow["status"] }) {
  const color =
    status === "approved"
      ? "var(--rfp-good)"
      : status === "needs_input"
        ? "var(--rfp-serious)"
        : "var(--rfp-ink-muted)";
  const label = status === "approved" ? "Approved" : status === "needs_input" ? "Needs input" : "Draft";
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
