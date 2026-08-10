import { ComponentType } from "react";
import Link from "next/link";
import { CountUp } from "./CountUp";

/**
 * One number and what it means.
 *
 * Optionally a link. A stat that names a subset of the queue should get you to
 * that subset - "3 pending triage" is a question, and clicking it ought to be
 * the answer. Cards without an `href` render as plain divs rather than as
 * links that go nowhere, because a pressable surface that does not respond is
 * worse than one that never invited the press.
 *
 * `active` marks the card whose filter is currently applied, so the page always
 * says which subset you are looking at.
 */
export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent,
  href,
  active = false,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
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
      <p className="mt-3 font-display text-3xl font-semibold text-rfp-ink">
        {typeof value === "number" ? <CountUp value={value} /> : <span className="tabular">{value}</span>}
      </p>
      <p className="mt-1.5 text-xs text-rfp-ink-secondary">{subtext}</p>
    </>
  );

  const base = "rounded-xl border bg-rfp-surface p-5";

  if (!href) {
    return <div className={`${base} border-rfp-border`}>{body}</div>;
  }

  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`${base} press press-card lift block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold focus-visible:ring-offset-2 ${
        active
          ? "border-rfp-ink shadow-[0_0_0_1px_var(--rfp-ink)]"
          : "border-rfp-border hover:border-rfp-border-strong"
      }`}
    >
      {body}
    </Link>
  );
}
