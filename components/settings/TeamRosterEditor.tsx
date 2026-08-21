"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSavedForm } from "@/components/settings/useSavedForm";
import { SaveBar } from "@/components/settings/SaveBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { TeamMemberRow } from "@/lib/supabase/types";

// The private roster module 9's team match recommends against - Khaled
// confirms every assignment, nothing here auto-assigns.
export function TeamRosterEditor({ initial }: { initial: TeamMemberRow[] }) {
  // Edits to a row are held until Save. Adding and removing stay immediate:
  // those are already explicit button presses, and a Save button for "I pressed
  // Add" would be a second confirmation of something already confirmed.
  const { value: rows, setValue: setRows, dirty, saving, error: saveError, justSaved, commit, discard } =
    useSavedForm(initial, async (next) => {
      const before = new Map(initial.map((r) => [r.id, r]));
      const supabase = createClient();
      for (const r of next) {
        const was = before.get(r.id);
        if (was && JSON.stringify(was) === JSON.stringify(r)) continue;
        const { error: failure } = await supabase
          .from("team_members")
          .update({ name: r.name, role: r.role, rate: r.rate, bandwidth: r.bandwidth, active: r.active })
          .eq("id", r.id);
        if (failure) return { message: failure.message };
      }
      return null;
    });
  const [newName, setNewName] = useState("");
  // Removal used to happen on the click. Every other field here saves as you
  // type, which is right for an edit you can see and undo by typing again - but
  // a deleted consultant leaves nothing on screen to correct, and the row is
  // gone from every future team match. Asking first is the difference between
  // an edit and an accident.
  const [pendingRemove, setPendingRemove] = useState<TeamMemberRow | null>(null);

  async function addMember() {
    if (!newName.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase.from("team_members").insert({ name: newName.trim() }).select().single();
    if (!error && data) {
      setRows([...rows, data]);
      setNewName("");
    }
  }

  function update(id: string, patch: Partial<(typeof rows)[number]>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function remove(member: TeamMemberRow) {
    setPendingRemove(null);
    setRows(rows.filter((r) => r.id !== member.id));
    const supabase = createClient();
    await supabase.from("team_members").delete().eq("id", member.id);
  }

  return (
    <>
      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove from the roster?"
        body={
          <>
            <strong>{pendingRemove?.name}</strong> will no longer be suggested for any
            solicitation. Assignments already confirmed on a bid are not affected.
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
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Role</th>
            <th className="px-4 py-2.5">Rate $/hr</th>
            <th className="px-4 py-2.5">Best suited to</th>
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
                {/* Comma separated, because the useful answer is "board
                    facilitation, not K-12" and no dropdown survives that. */}
                <Cell
                  value={(row.interests ?? []).join(", ")}
                  onChange={(v) =>
                    update(row.id, { interests: v.split(",").map((x) => x.trim()).filter(Boolean) })
                  }
                />
              </td>
              <td className="px-4 py-2">
                <select
                  value={row.bandwidth}
                  onChange={(e) => update(row.id, { bandwidth: e.target.value as TeamMemberRow["bandwidth"] })}
                  className="min-h-11 rounded border border-transparent bg-transparent px-1.5 py-1 text-rfp-ink hover:border-rfp-border focus:border-rfp-gold focus:bg-rfp-surface-sunken focus:outline-none"
                >
                  <option value="open">Open</option>
                  <option value="limited">Limited</option>
                  <option value="full">Full</option>
                </select>
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
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addMember()}
          placeholder="Add a team member"
          className="min-h-11 flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
        />
        <button
          onClick={addMember}
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
