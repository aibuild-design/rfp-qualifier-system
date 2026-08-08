"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SectorExperienceRow } from "@/lib/supabase/types";

// "It knows your depth, sector by sector" (module 3) — the disqualifier gate
// and scoring both read this table per RFP.
export function SectorExperienceEditor({ initial }: { initial: SectorExperienceRow[] }) {
  const [rows, setRows] = useState(initial);
  const [newSector, setNewSector] = useState("");

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

  async function update(id: string, patch: Partial<SectorExperienceRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const supabase = createClient();
    await supabase.from("sector_experience").update(patch).eq("id", id);
  }

  async function remove(id: string) {
    setRows(rows.filter((r) => r.id !== id));
    const supabase = createClient();
    await supabase.from("sector_experience").delete().eq("id", id);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
      <table className="w-full text-left text-sm">
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
                <button onClick={() => remove(row.id)} className="text-xs text-rfp-ink-muted hover:text-rfp-critical">
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-2 border-t border-rfp-border p-3">
        <input
          type="text"
          value={newSector}
          onChange={(e) => setNewSector(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSector()}
          placeholder="Add a sector — e.g. K-12, behavioral health, transit"
          className="flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/20"
        />
        <button
          onClick={addSector}
          className="rounded-lg bg-rfp-black px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-rfp-black-2"
        >
          Add
        </button>
      </div>
    </div>
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
      defaultValue={value}
      onBlur={(e) => onChange(e.target.value)}
      className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-rfp-ink hover:border-rfp-border focus:border-rfp-gold focus:bg-rfp-surface-sunken focus:outline-none"
    />
  );
}
