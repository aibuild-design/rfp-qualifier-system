"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fieldClass } from "@/components/ui/form";
import type { TeamMemberRow } from "@/lib/supabase/types";

/**
 * One consultant at a time, expanded.
 *
 * A list that opens rather than a table, because the fields that matter here
 * are paragraphs. Everything saves on blur like the rest of Settings, so there
 * is no save button to forget.
 */
export function TeamDepthEditor({ initial }: { initial: TeamMemberRow[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  type Field = "role" | "responsibilities" | "bio" | "credentials" | "years_experience";

  // Spelled out rather than a computed key. A `{ [field]: value }` object
  // widens to a string index signature, which the generated row type rejects,
  // and widening the payload to satisfy it would lose the check that catches a
  // misspelled column here.
  async function patch(id: string, field: Field, value: string | number | null) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const update =
      field === "role" ? { role: value as string | null }
      : field === "responsibilities" ? { responsibilities: value as string | null }
      : field === "bio" ? { bio: value as string | null }
      : field === "credentials" ? { credentials: value as string | null }
      : { years_experience: value as number | null };

    const { error } = await createClient().from("team_members").update(update).eq("id", id);
    setSaved(error ? `Not saved. ${error.message}` : "Saved");
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="mt-5 space-y-2">
      {rows.map((m) => {
        const isOpen = open === m.id;
        const ready = Boolean(m.responsibilities && m.bio);
        return (
          <div key={m.id} className="overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : m.id)}
              className="press flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5 text-left hover:bg-rfp-surface-sunken/60"
            >
              <span className="text-sm font-semibold text-rfp-ink">{m.name}</span>
              <span className="text-xs text-rfp-ink-muted">{m.role ?? "no role recorded"}</span>
              {m.rate ? <span className="tabular-nums text-xs text-rfp-ink-muted">${m.rate}/hr</span> : null}
              <span
                className="ml-auto text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: ready ? "var(--rfp-good)" : "var(--rfp-warning)" }}
              >
                {ready ? "ready for a proposal" : "needs detail"}
              </span>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t border-rfp-border px-5 py-4">
                <label className="block text-sm text-rfp-ink-secondary">
                  Role, as it appears in a proposal
                  <input
                    defaultValue={m.role ?? ""}
                    onBlur={(e) => void patch(m.id, "role", e.target.value.trim() || null)}
                    placeholder="Principal Consultant / Project Lead"
                    className={`${fieldClass} mt-1`}
                  />
                </label>

                <label className="block text-sm text-rfp-ink-secondary">
                  Primary responsibilities on an engagement
                  <textarea
                    defaultValue={m.responsibilities ?? ""}
                    onBlur={(e) => void patch(m.id, "responsibilities", e.target.value.trim() || null)}
                    rows={3}
                    placeholder="Overall project accountability, client management, workplan development, stakeholder coordination, co-facilitation"
                    className={`${fieldClass} mt-1`}
                  />
                </label>

                <label className="block text-sm text-rfp-ink-secondary">
                  Biography
                  <textarea
                    defaultValue={m.bio ?? ""}
                    onBlur={(e) => void patch(m.id, "bio", e.target.value.trim() || null)}
                    rows={4}
                    placeholder="Two or three sentences. What they do, the kind of client they do it for, and what they are known for."
                    className={`${fieldClass} mt-1`}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-rfp-ink-secondary">
                    Credentials
                    <input
                      defaultValue={m.credentials ?? ""}
                      onBlur={(e) => void patch(m.id, "credentials", e.target.value.trim() || null)}
                      placeholder="PhD Organisational Psychology; ICF PCC"
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                  <label className="block text-sm text-rfp-ink-secondary">
                    Years of experience
                    <input
                      type="number"
                      min={0}
                      defaultValue={m.years_experience ?? ""}
                      onBlur={(e) =>
                        void patch(m.id, "years_experience", e.target.value ? Number(e.target.value) : null)
                      }
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {saved && <p className="text-xs font-medium text-rfp-good">{saved}</p>}
    </div>
  );
}
