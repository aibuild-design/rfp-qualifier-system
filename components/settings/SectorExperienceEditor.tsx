"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSavedForm } from "@/components/settings/useSavedForm";
import { SaveBar } from "@/components/settings/SaveBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { SectorExperienceRow } from "@/lib/supabase/types";

// "It knows your depth, sector by sector" (module 3) - the disqualifier gate
// and scoring both read this table per RFP.
export function SectorExperienceEditor({ initial }: { initial: SectorExperienceRow[] }) {
  // Edits to a row are held until Save. Adding and removing stay immediate:
  // those are already explicit button presses, and a Save button for "I pressed
  // Add" would be a second confirmation of something already confirmed.
  const { value: rows, setValue: setRows, dirty, saving, error: saveError, justSaved, commit, discard, guard } =
    useSavedForm(initial, async (next) => {
      const before = new Map(initial.map((r) => [r.id, r]));
      const supabase = createClient();
      for (const r of next) {
        const was = before.get(r.id);
        if (was && JSON.stringify(was) === JSON.stringify(r)) continue;
        const { error: failure } = await supabase
          .from("sector_experience")
          .update({ sector: r.sector, years_experience: r.years_experience, engagement_count: r.engagement_count, notes: r.notes })
          .eq("id", r.id);
        if (failure) return { message: failure.message };
      }
      return null;
    });
  const [newSector, setNewSector] = useState("");
  // Worse than it looks. The gate and the score both read this table, and a
  // sector that is absent is not the same as a sector recorded at zero: one is
  // "no experience", the other is "never asked". Removing a row silently
  // changes what future verdicts are computed against, so it asks first.
  const [pendingRemove, setPendingRemove] = useState<SectorExperienceRow | null>(null);

  async function addSector() {
    if (!newSector.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("sector_experience")
      .insert({ sector: newSector.trim() })
      .select()
      .single();
    if (!error && data) {
      setRows([...rows, data]);
      setNewSector("");
    }
  }

  function update(id: string, patch: Partial<(typeof rows)[number]>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function remove(row: SectorExperienceRow) {
    setPendingRemove(null);
    setRows(rows.filter((r) => r.id !== row.id));
    const supabase = createClient();
    await supabase.from("sector_experience").delete().eq("id", row.id);
  }

  return (
    <>
      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove this sector?"
        body={
          <>
            <strong>{pendingRemove?.sector}</strong> will stop being considered when a
            solicitation is scored. If the intent is &ldquo;no experience here&rdquo;, set the years
            and engagements to zero instead. An absent sector reads as never asked.
          </>
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => pendingRemove && remove(pendingRemove)}
        onCancel={() => setPendingRemove(null)}
      />
    <div className="overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-base sm:text-sm">
        <thead>
          <tr className="border-b border-rfp-border text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
            <th className="px-4 py-2.5">Sector</th>
            <th className="px-4 py-2.5">Years</th>
            <th className="px-4 py-2.5">Engagements</th>
            <th className="px-4 py-2.5">Notes</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-rfp-border last:border-0">
              <td className="px-4 py-2 font-medium text-rfp-ink">{row.sector}</td>
              <td className="px-4 py-2">
                <Cell
                  value={row.years_experience ?? ""}
                  onChange={(v) => update(row.id, { years_experience: v === "" ? null : Number(v) })}
                  type="number"
                />
              </td>
              <td className="px-4 py-2">
                <Cell
                  value={row.engagement_count ?? ""}
                  onChange={(v) => update(row.id, { engagement_count: v === "" ? null : Number(v) })}
                  type="number"
                />
              </td>
              <td className="px-4 py-2">
                <Cell value={row.notes ?? ""} onChange={(v) => update(row.id, { notes: v || null })} />
              </td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => setPendingRemove(row)} className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-rfp-ink-muted press hover:bg-rfp-critical/10 hover:text-rfp-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-critical">
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      </div>

      <div className="flex items-center gap-2 border-t border-rfp-border p-3">
        <input
          type="text"
          value={newSector}
          onChange={(e) => setNewSector(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSector()}
          placeholder="Add a sector - e.g. K-12, behavioral health, transit"
          className="min-h-11 flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
        />
        <button
          onClick={addSector}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface press hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold"
        >
          Add
        </button>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={saveError}
        justSaved={justSaved}
        onSave={() => void commit()}
        onDiscard={discard}
        guard={guard}
      />
    </div>
    </>
  );
}

function Cell({
  value,
  onChange,
  type = "text",
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number";
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-11 rounded border border-transparent bg-transparent px-1.5 py-1 text-rfp-ink hover:border-rfp-border focus:border-rfp-gold focus:bg-rfp-surface-sunken focus:outline-none"
    />
  );
}
