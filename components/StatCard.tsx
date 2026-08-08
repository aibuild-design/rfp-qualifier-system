import { ComponentType } from "react";

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
          {label}
        </p>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="tabular mt-3 font-display text-3xl font-semibold text-rfp-ink">{value}</p>
      <p className="mt-1.5 text-xs text-rfp-ink-secondary">{subtext}</p>
    </div>
  );
}
