"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFolder, renameFolder, deleteFolder } from "@/app/dashboard/folders/actions";
import type { FolderRow } from "@/lib/supabase/types";
import { buttonClass, buttonSecondaryClass, fieldClass } from "@/components/ui/form";

/**
 * Folders, as a row of chips above the queue.
 *
 * A chip row rather than a sidebar because it is the same control at every
 * width: it scrolls sideways on a phone and sits in one line on a desktop, so
 * there is one thing to build, one thing to test, and no breakpoint at which
 * the feature changes shape.
 *
 * The count on each chip is the point of the whole feature. A folder you have
 * to open to find out whether anything is in it is a filing cabinet; a folder
 * that says "Transit 4" is a queue.
 */
export function FolderBar({
  folders,
  counts,
  active,
  resetCount,
  viewActive,
  leading,
}: {
  folders: FolderRow[];
  counts: Record<string, number>;
  active: string | null;
  /** What "All" would show: both filters cleared. */
  resetCount: number;
  /** Whether a verdict is selected, so "All" is not highlighted while one is. */
  viewActive: boolean;
  /** The verdict chips, rendered inside this row instead of a second one. */
  leading?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<FolderRow | null>(null);
  const [deleting, setDeleting] = useState<FolderRow | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (folderId: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (folderId) params.set("folder", folderId);
    else {
      // "All" is the one control that clears everything. There were two of
      // them, one per filter row, sitting directly above each other and
      // looking identical; a single reset is what people expect from a chip
      // labelled All, and it removes the duplicate.
      params.delete("folder");
      params.delete("view");
    }
    // A menu belongs to the folder that opened it.
    setMenuOpen(false);
    router.push(`/dashboard${params.toString() ? `?${params}` : ""}`);
  };

  function submitNew() {
    setError(null);
    start(async () => {
      const res = await createFolder(newName);
      if (!res.ok) return setError(res.error ?? "Could not create that section");
      setNewName("");
      setCreating(false);
      router.refresh();
    });
  }

  function submitRename() {
    if (!renaming) return;
    setError(null);
    start(async () => {
      const res = await renameFolder(renaming.id, renaming.name);
      if (!res.ok) return setError(res.error ?? "Could not rename that section");
      setRenaming(null);
      router.refresh();
    });
  }

  function submitDelete() {
    if (!deleting) return;
    setError(null);
    start(async () => {
      const res = await deleteFolder(deleting.id, typed);
      if (!res.ok) return setError(res.error ?? "Could not delete that section");
      setDeleting(null);
      setTyped("");
      if (active === deleting.id) go(null);
      else router.refresh();
    });
  }

  const chip = (isActive: boolean) =>
    `press press-row inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold ${
      isActive
        ? "border-rfp-ink bg-rfp-ink text-rfp-surface"
        : "border-rfp-border bg-rfp-surface text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
    }`;

  return (
    <div className="mt-6">
      {/* Scrolls sideways rather than wrapping: a folder row that grows to three
          lines pushes the queue off the screen, and the queue is the point. */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <button onClick={() => go(null)} className={chip(active === null && !viewActive)}>
          All
          <span className="tabular text-xs opacity-60">{resetCount}</span>
        </button>

        {/* The verdict chips, in this row rather than a second one below it. */}
        {leading}

        {/* Only sections that contain something.
            
            Three system sections ship empty and stayed empty, so the filter row
            was half full of chips whose only possible result was an empty list:
            "To decide 0", "Waiting on the agency 0", "Archive 0" took more width
            than every verdict filter combined and none of them could do
            anything. A filter that cannot change what you see is furniture.
            
            The selected one always shows, even at zero, or clicking a section
            and landing on an empty list would make the chip you just used
            disappear. */}
        {folders
          .filter((f) => (counts[f.id] ?? 0) > 0 || active === f.id)
          .map((f) => (
            <button key={f.id} onClick={() => go(f.id)} className={chip(active === f.id)}>
              {f.name}
              <span className="tabular text-xs opacity-60">{counts[f.id] ?? 0}</span>
            </button>
          ))}

        {active && (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Manage this section"
            className="press inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-rfp-border text-sm text-rfp-ink-muted hover:bg-rfp-surface-sunken hover:text-rfp-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold"
          >
            &#183;&#183;&#183;
          </button>
        )}

        
      </div>

      {/* Behind a menu, not on the page.

          Rename and Delete sat in their own row the whole time a folder was
          selected: two permanent links, one of them destructive and red, taking
          a line of the screen to offer something used once in the life of a
          folder. Managing a folder is rare; looking at one is constant. */}
      {active && menuOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <button
            onClick={() => { setRenaming(folders.find((f) => f.id === active) ?? null); setMenuOpen(false); }}
            className="press min-h-11 font-medium text-rfp-ink-muted underline underline-offset-2 hover:text-rfp-ink"
          >
            Rename
          </button>
          {/* A stage of the pipeline has no delete. Offering one that always
              fails is worse than not offering it. */}
          {!folders.find((f) => f.id === active)?.is_system && (
            <button
              onClick={() => { setDeleting(folders.find((f) => f.id === active) ?? null); setMenuOpen(false); }}
              className="press min-h-11 font-medium text-rfp-critical underline underline-offset-2 hover:opacity-80"
            >
              Delete folder
            </button>
          )}
        </div>
      )}

      {creating && (
        <Panel title="New section" onCancel={() => { setCreating(false); setError(null); }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
            placeholder="Transit, Q4 pursuits, Waiting on questions…"
            className={fieldClass}
          />
          {error && <p role="alert" className="mt-2 text-xs font-medium text-rfp-critical">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={submitNew} disabled={pending} className={buttonClass}>
              {pending ? "Creating…" : "Create"}
            </button>
            <button onClick={() => { setCreating(false); setError(null); }} className={buttonSecondaryClass}>
              Cancel
            </button>
          </div>
        </Panel>
      )}

      {renaming && (
        <Panel title="Rename section" onCancel={() => { setRenaming(null); setError(null); }}>
          <input
            autoFocus
            value={renaming.name}
            onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            className={fieldClass}
          />
          {error && <p role="alert" className="mt-2 text-xs font-medium text-rfp-critical">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={submitRename} disabled={pending} className={buttonClass}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setRenaming(null); setError(null); }} className={buttonSecondaryClass}>
              Cancel
            </button>
          </div>
        </Panel>
      )}

      {deleting && (
        <Panel title={`Delete "${deleting.name}"?`} onCancel={() => { setDeleting(null); setTyped(""); setError(null); }}>
          {/* Says plainly what survives. The fear when deleting a folder is
              losing what is in it, and the answer here is "nothing" - so it
              should be the first thing read, not a footnote. */}
          <p className="text-sm leading-relaxed text-rfp-ink-secondary">
            The {counts[deleting.id] ?? 0} solicitation{(counts[deleting.id] ?? 0) === 1 ? "" : "s"} inside will{" "}
            <strong className="font-semibold text-rfp-ink">not</strong> be deleted. They return to the
            unfiled queue with their verdicts intact. Any folders grouped under this one do go.
          </p>
          <label htmlFor="confirm-delete" className="mt-3 block text-sm font-medium text-rfp-ink-secondary">
            Type <span className="font-mono font-semibold text-rfp-ink">delete</span> to confirm
          </label>
          <input
            id="confirm-delete"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && typed.trim().toLowerCase() === "delete" && submitDelete()}
            className={`${fieldClass} mt-1.5`}
            autoComplete="off"
          />
          {error && <p role="alert" className="mt-2 text-xs font-medium text-rfp-critical">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={submitDelete}
              disabled={pending || typed.trim().toLowerCase() !== "delete"}
              className={`${buttonClass} !bg-rfp-critical hover:!opacity-90`}
            >
              {pending ? "Deleting…" : "Delete section"}
            </button>
            <button onClick={() => { setDeleting(null); setTyped(""); setError(null); }} className={buttonSecondaryClass}>
              Cancel
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="rise mt-3 rounded-xl border border-rfp-border bg-rfp-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-rfp-ink">{title}</p>
        <button onClick={onCancel} aria-label="Close" className="press text-rfp-ink-muted hover:text-rfp-ink">
          ×
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
