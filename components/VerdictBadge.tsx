import { RfpStatus, VERDICT_META } from "@/lib/rfp";

export function VerdictBadge({ status }: { status: RfpStatus }) {
  const meta = VERDICT_META[status];
  return (
    // `whitespace-nowrap` because "Pending triage" is two words and the verdict
    // column is narrow: without it the pill wraps mid-label and stretches the
    // whole row taller than its neighbours. `shrink-0` on the dot stops it
    // squashing into an oval when space runs out.
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        color: meta.color,
      }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}
