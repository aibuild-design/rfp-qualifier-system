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

/**
 * Every deadline is rendered in this zone, never the viewer's or the server's.
 *
 * These dates are rendered on the server, so an unpinned toLocaleDateString
 * uses whatever timezone the host runs in — UTC on Vercel. A 7pm Pacific
 * deadline stored as 02:00Z then displays as the FOLLOWING day, which on a bid
 * desk means showing a deadline later than the real one. That is the one
 * direction this must never fail in.
 *
 * Caravann is Oakland-based and most of what they bid on is Californian, so
 * Pacific is the default. Agencies in other zones (Omaha is Central) still
 * render correctly as an instant in time; the label just names the zone it is
 * shown in, so there is no ambiguity about which clock is meant.
 */
export const DISPLAY_TIME_ZONE = process.env.NEXT_PUBLIC_DISPLAY_TZ || "America/Los_Angeles";

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** Deadlines carry a time of day that materially changes the answer — "due the
 *  14th" reads very differently from "due 2:00 PM on the 14th". Shown with the
 *  zone abbreviation so it can't be misread. */
export function formatDeadline(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: DISPLAY_TIME_ZONE,
  });
}
