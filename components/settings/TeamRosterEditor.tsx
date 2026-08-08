"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TeamMemberRow } from "@/lib/supabase/types";

// The private roster module 9's team match recommends against — Khaled
// confirms every assignment, nothing here auto-assigns.
export function TeamRosterEditor({ initial }: { initial: TeamMemberRow[] }) {
  const [rows, setRows] = useState(initial);
  const [newName, setNewName] = useState("");

  async function addMember() {
    if (!newName.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase.from("team_members").insert({ name: newName.trim() }).select().single();
    if (!error && data) {
      setRows([...rows, data]);
      setNewName("");
    }
  }

  async function update(id: string, patch: Partial<TeamMemberRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const supabase = createClient();
    await supabase.from("team_members").update(patch).eq("id", id);
  }

  async function remove(id: string) {
    setRows(rows.filter((r) => r.id !== id));
    const supabase = createClient();
    await supabase.from("team_members").delete().eq("id", id);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-rfp-border text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Role</th>
            <th className="px-4 py-2.5">Rate</th>
            <th className="px-4 py-2.5">Bandwidth</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-rfp-border last:border-0">
              <td className="px-4 py-2 font-medium text-rfp-ink">{row.name}</td>
              <td className="px-4 py-2">
                <Cell value={row.role ?? ""} onChange={(v) => update(row.id, { role: v || null })} />
              </td>
              <td className="px-4 py-2">
                <Cell
                  value={row.rate ?? ""}
                  type="number"
                  onChange={(v) => update(row.id, { rate: v === "" ? null : Number(v) })}
                />
              </td>
              <td className="px-4 py-2">
                <select
                  value={row.bandwidth}
                  onChange={(e) => update(row.id, { bandwidth: e.target.value as TeamMemberRow["bandwidth"] })}
                  className="rounded border border-transparent bg-transparent px-1.5 py-1 text-rfp-ink hover:border-rfp-border focus:border-rfp-gold focus:bg-rfp-surface-sunken focus:outline-none"
                >
                  <option value="open">Open</option>
                  <option value="limited">Limited</option>
                  <option value="full">Full</option>
                </select>
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
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addMember()}
          placeholder="Add a team member"
          className="flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/20"
        />
        <button
          onClick={addMember}
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
