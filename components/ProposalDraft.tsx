"use client";

import { useState, useTransition } from "react";
import { checkVoice, voiceSummary } from "@/lib/voice";
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
  // Only a rebuild asks. The first build has nothing to overwrite, so
  // confirming it is friction with no risk behind it - and it cost exactly
  // what friction with no purpose costs: the button was pressed, a panel
  // appeared below it, and the draft was reported as not working.
  //
  // A rebuild genuinely replaces every unapproved section, so that one still
  // asks.
  const [confirming, setConfirming] = useState(false);

  function rebuild() {
    setConfirming(false);
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
            Stitched from the approved-language library, never invented.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Once a draft exists, downloading is the thing you came for and
              rebuilding is the rare one. Before it exists there is only one
              button, so there is nothing to choose between. */}
          {sections.length > 0 ? (
            <>
              <a
                href={`/api/rfps/${rfpId}/docx`}
                className="press rounded-lg bg-rfp-ink px-4 py-2.5 text-sm font-semibold text-rfp-surface hover:opacity-90"
              >
                Download .docx
              </a>
              <button
                onClick={() => setConfirming(true)}
                disabled={pending}
                className="press rounded-lg px-3 py-2 text-sm font-medium text-rfp-ink-muted hover:text-rfp-ink disabled:opacity-50"
              >
                {pending ? "Building…" : "Rebuild"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-rfp-gold bg-rfp-surface p-4">
          <p className="text-sm font-medium text-rfp-ink">Rebuild this draft?</p>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-rfp-ink-secondary">
            Every section you have not approved is replaced with a fresh stitch from the library.
            Approved sections are left exactly as they are.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={rebuild}
              disabled={pending}
              className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface hover:opacity-90 disabled:opacity-50"
            >
              Yes, rebuild it
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-4 text-sm font-medium text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
            >
              Not yet
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="mt-2 text-xs font-medium" style={{ color: "var(--rfp-good)" }}>
          {message}
        </p>
      )}

      {/* The only action here when no draft exists, so it is the full width of
          the panel rather than a small dark rectangle in the top corner. That
          is where it was, and it was pressed and reported as doing nothing. */}
      {sections.length === 0 && (
        <button
          onClick={rebuild}
          disabled={pending}
          className="press mt-4 flex min-h-14 w-full items-center justify-center rounded-xl bg-rfp-ink text-base font-semibold text-rfp-surface hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Building…" : "Build the draft"}
        </button>
      )}

      {libraryCount === 0 && (
        <p className="mt-3 rounded-lg border border-rfp-serious/40 bg-rfp-serious/10 p-3 text-xs leading-relaxed text-rfp-ink-secondary">
          The library is empty, so every section comes back as &ldquo;needs writing by
          hand&rdquo;. Load it from Caravann&rsquo;s past proposals.
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
                          Nothing on file. Write it by hand, then add it to the library.
                        </p>
                      )}
                      {/* Flagged, never rewritten. The body is Caravann's own
                          approved language, and silently editing it would
                          defeat the point of having a library. This says "a
                          procurement officer will read this as generated, here
                          it is" and leaves the call to a person. */}
                      {(() => {
                        const note = voiceSummary(checkVoice(s.body));
                        return note ? (
                          <p className="mt-3 rounded-lg border border-rfp-warning/30 bg-rfp-warning/5 px-3 py-2 text-[12px] leading-relaxed text-rfp-ink-secondary">
                            <span className="font-semibold text-rfp-ink">Reads as machine-written.</span>{" "}
                            {note}.
                          </p>
                        ) : null;
                      })()}

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
