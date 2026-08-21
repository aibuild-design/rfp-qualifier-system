"use client";

import { useState } from "react";
import { useSavedForm } from "@/components/settings/useSavedForm";
import { SaveBar } from "@/components/settings/SaveBar";
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
  const [open, setOpen] = useState<string | null>(null);

  type Field = "role" | "responsibilities" | "bio" | "credentials" | "years_experience";

  // A biography is the longest thing anybody types into this system and it was
  // being written the moment focus left the box. Held as a draft of the whole
  // roster instead, and on Save only the rows that actually changed are sent.
  const { value: rows, setValue: setRows, dirty, saving, error, justSaved, commit, discard, guard } =
    useSavedForm<TeamMemberRow[]>(initial, async (next) => {
      const before = new Map(initial.map((r) => [r.id, r]));
      const supabase = createClient();
      for (const r of next) {
        const was = before.get(r.id);
        if (
          was &&
          was.role === r.role &&
          was.responsibilities === r.responsibilities &&
          was.bio === r.bio &&
          was.credentials === r.credentials &&
          was.years_experience === r.years_experience
        ) {
          continue;
        }
        // Spelled out rather than a computed key: a `{ [field]: value }` object
        // widens to a string index signature, which the generated row type
        // rejects, and widening the payload to satisfy it would lose the check
        // that catches a misspelled column here.
        const { error: failure } = await supabase
          .from("team_members")
          .update({
            role: r.role,
            responsibilities: r.responsibilities,
            bio: r.bio,
            credentials: r.credentials,
            years_experience: r.years_experience,
          })
          .eq("id", r.id);
        if (failure) return { message: failure.message };
      }
      return null;
    });

  function patch(id: string, field: Field, value: string | number | null) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  return (
    <div className="mt-5 space-y-2">
      {rows.map((m) => {
        const isOpen = open === m.id;
        // Responsibilities alone are enough for a staffing table, which is
        // what Caravann's own proposals carry. A biography is a nice addition
        // and not the thing that blocks a submission.
        const ready = Boolean(m.responsibilities);
        const full = Boolean(m.responsibilities && m.bio);
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
                style={{ color: full ? "var(--rfp-good)" : ready ? "var(--rfp-ink-muted)" : "var(--rfp-warning)" }}
              >
                {full ? "complete" : ready ? "no biography yet" : "needs detail"}
              </span>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t border-rfp-border px-5 py-4">
                <label className="block text-sm text-rfp-ink-secondary">
                  Role, as it appears in a proposal
                  <input
                    value={m.role ?? ""}
                    onChange={(e) => patch(m.id, "role", e.target.value.trim() || null)}
                    placeholder="Principal Consultant / Project Lead"
                    className={`${fieldClass} mt-1`}
                  />
                </label>

                <label className="block text-sm text-rfp-ink-secondary">
                  Primary responsibilities on an engagement
                  <textarea
                    value={m.responsibilities ?? ""}
                    onChange={(e) => patch(m.id, "responsibilities", e.target.value.trim() || null)}
                    rows={3}
                    placeholder="Overall project accountability, client management, workplan development, stakeholder coordination, co-facilitation"
                    className={`${fieldClass} mt-1`}
                  />
                </label>

                <label className="block text-sm text-rfp-ink-secondary">
                  Biography
                  <textarea
                    value={m.bio ?? ""}
                    onChange={(e) => patch(m.id, "bio", e.target.value.trim() || null)}
                    rows={4}
                    placeholder="Two or three sentences. What they do, the kind of client they do it for, and what they are known for."
                    className={`${fieldClass} mt-1`}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-rfp-ink-secondary">
                    Credentials
                    <input
                    value={m.credentials ?? ""}
                      onChange={(e) => patch(m.id, "credentials", e.target.value.trim() || null)}
                      placeholder="PhD Organisational Psychology; ICF PCC"
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                  <label className="block text-sm text-rfp-ink-secondary">
                    Years of experience
                    <input
                      type="number"
                      min={0}
                      value={m.years_experience ?? ""}
                      onChange={(e) =>
                        patch(m.id, "years_experience", e.target.value ? Number(e.target.value) : null)
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

      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        justSaved={justSaved}
        onSave={() => void commit()}
        onDiscard={discard}
        guard={guard}
      />
    </div>
  );
}
