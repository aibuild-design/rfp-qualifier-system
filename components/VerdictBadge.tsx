import { RfpStatus, VERDICT_META } from "@/lib/rfp";

export function VerdictBadge({ status }: { status: RfpStatus }) {
  const meta = VERDICT_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: `${meta.color}1a`, color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}
