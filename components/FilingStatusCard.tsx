import type { RfpRow } from "@/lib/supabase/types";
import { proposalFileName } from "@/lib/proposal";
import { formatDate } from "@/lib/rfp";

const STATUS_COPY: Record<RfpRow["filing_status"], { label: string; color: string; detail: string }> = {
  not_filed: {
    label: "Not filed",
    color: "var(--rfp-ink-muted)",
    detail: "Nothing has been filed to Drive for this solicitation yet.",
  },
  pending: {
    label: "Queued",
    color: "var(--rfp-warning)",
    detail: "Queued for filing. The Drive step runs once a Google account is connected.",
  },
  filed: {
    label: "Filed",
    color: "var(--rfp-good)",
    detail: "Filed to Drive with the RFP, its addenda, and the draft.",
  },
  failed: {
    label: "Failed",
    color: "var(--rfp-critical)",
    detail: "Filing was attempted and did not complete.",
  },
};

/** Module 10. The folder structure and naming are settled; the Drive API call
 *  is not wired because it needs Google OAuth. Showing the intended
 *  destination is more honest than hiding the module until it works — it makes
 *  clear what is and isn't happening. */
export function FilingStatusCard({ rfp }: { rfp: RfpRow }) {
  const meta = STATUS_COPY[rfp.filing_status];
  const folder = rfp.status === "pending" ? "(awaiting verdict)" : `/${rfp.status.replace("_", "-")}/`;

  return (
    <div className="mt-6">
      <h2 className="font-display text-sm font-semibold text-rfp-ink">Drive filing</h2>
      <p className="mt-0.5 text-xs text-rfp-ink-muted">
        Verdict folder, a subfolder per bid, everything renamed to your format.
      </p>

      <div className="mt-3 rounded-xl border border-rfp-border bg-rfp-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </span>
          {rfp.filed_at && (
            <span className="text-xs text-rfp-ink-muted">
              {formatDate(rfp.filed_at)}
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-rfp-ink-secondary">{meta.detail}</p>
        {rfp.filing_error && <p className="mt-1 text-xs text-rfp-critical">{rfp.filing_error}</p>}

        <dl className="mt-4 space-y-1.5 text-xs">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-rfp-ink-muted">Destination</dt>
            <dd className="text-rfp-ink-secondary">
              <code className="rounded bg-rfp-surface-sunken px-1.5 py-0.5">{folder}</code>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-rfp-ink-muted">Naming</dt>
            <dd className="text-rfp-ink-secondary">
              <code className="rounded bg-rfp-surface-sunken px-1.5 py-0.5">{proposalFileName(rfp)}</code>
            </dd>
          </div>
          {rfp.drive_folder_url && (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-rfp-ink-muted">Folder</dt>
              <dd>
                <a href={rfp.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-rfp-gold hover:underline">
                  Open in Drive
                </a>
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-4 border-t border-rfp-border pt-3 text-[11px] leading-relaxed text-rfp-ink-muted">
          Not yet connected. Filing needs a Google account authorised in n8n — the same one-time
          consent the email trigger needs. Until then this records intent only; no files move.
        </p>
      </div>
    </div>
  );
}
