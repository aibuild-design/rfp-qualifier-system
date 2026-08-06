import type { Database } from "@/lib/supabase/types";

export type RfpRow = Database["public"]["Tables"]["rfps"]["Row"];
export type RfpStatus = RfpRow["status"];

// Verdict → color + label. "pending" means triage hasn't run/finished yet —
// distinct from "maybe" (triage ran, result was genuinely ambiguous).
// Hex literals (not CSS vars) so components can append alpha, e.g. `${color}1a`
// for a tinted background — must match the --rfp-* values in globals.css.
export const VERDICT_META: Record<RfpStatus, { label: string; color: string }> = {
  go: { label: "Go", color: "#1b8a5a" },
  maybe: { label: "Maybe", color: "#d9962c" },
  no_go: { label: "No-go", color: "#c23b3b" },
  pending: { label: "Pending triage", color: "#8f8d84" },
};

/** ISO timestamp N days from now. Lives here rather than inline in a page so
 *  the react-hooks/purity rule doesn't flag Date.now() during render — these
 *  are server components, so the clock read is intentional and per-request. */
export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Days until a deadline (negative = already past). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Countdown color per the SOW: yellow inside 7 days, red inside 3. */
export function deadlineColor(days: number | null): string {
  if (days === null) return "var(--rfp-ink-muted)";
  if (days < 0) return "var(--rfp-critical)";
  if (days <= 3) return "var(--rfp-critical)";
  if (days <= 7) return "var(--rfp-warning)";
  return "var(--rfp-ink-secondary)";
}

export function formatBudget(row: Pick<RfpRow, "budget_amount" | "budget_source">): string {
  if (row.budget_source === "none_listed" || row.budget_amount === null) {
    return "No budget listed in RFP";
  }
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(row.budget_amount);
  return row.budget_source === "qa_document" ? `${amount} (from Q&A)` : amount;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
