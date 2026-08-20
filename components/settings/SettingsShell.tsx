import Link from "next/link";

/**
 * The frame every settings page sits in.
 *
 * A back link and a heading, so a sub-page always says where it came from.
 * Shared rather than repeated because seven pages drifting apart in their
 * headers is how a settings area stops feeling like one thing.
 */
export function SettingsShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/settings"
        className="press text-sm font-medium text-rfp-ink-muted hover:text-rfp-gold"
      >
        &larr; Settings
      </Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-rfp-ink">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-rfp-ink-secondary">{intro}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}
