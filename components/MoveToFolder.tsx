"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveToFolder } from "@/app/dashboard/folders/actions";
import type { FolderRow } from "@/lib/supabase/types";

/**
 * Files one solicitation.
 *
 * A native select rather than a custom menu: it is one control, it is keyboard
 * and screen-reader native, and on a phone it opens the system picker, which is
 * a better list than anything worth building here. The label is visually hidden
 * rather than absent, because "Folder" beside every row on a card layout is
 * noise once you have seen it twice.
 */
export function MoveToFolder({
  rfpId,
  folders,
  current,
  className,
}: {
  rfpId: string;
  folders: FolderRow[];
  current: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <span className="sr-only">Folder</span>
      <select
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value || null;
          start(async () => {
            await moveToFolder(rfpId, next);
            router.refresh();
          });
        }}
        // Stops a click on the select from also opening the row it sits in.
        onClick={(e) => e.stopPropagation()}
        className="press min-h-11 max-w-[10rem] truncate rounded-lg border border-rfp-border bg-rfp-surface px-2 text-xs text-rfp-ink-secondary focus:border-rfp-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold disabled:opacity-50 sm:min-h-0 sm:py-1"
      >
        <option value="">Unfiled</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}
