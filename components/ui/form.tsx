/**
 * Shared form primitives.
 *
 * These exist so the mobile and accessibility rules live in one place instead
 * of being re-decided per field. Two of them are not cosmetic:
 *
 * - `text-base` below `sm`. iOS Safari zooms the whole page when a focused
 *   input's text is under 16px, and it does not zoom back out. Every input in
 *   this app was 14px, so tapping any field on a phone left the layout stranded
 *   mid-zoom. 16px on mobile, 14px from `sm` up where there is no such rule.
 * - `min-h-11` (44px). The platform minimum for a touch target; the old fields
 *   and buttons came in around 34px, which is a miss-tap on a phone.
 *
 * The focus ring is also deliberately visible - the previous `ring-gold/20` was
 * nearly invisible on white, which fails keyboard users silently.
 */

import type { InputHTMLAttributes, ReactNode } from "react";

export const fieldClass =
  "w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 " +
  "text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted press " +
  "focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-rfp-gold/60 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Primary action. 44px tall, real focus ring, honest disabled state. */
/**
 * A primary button, visible in both themes.
 *
 * It used to be `bg-rfp-ink` with white text, which is a strong button on a
 * light page and nearly invisible on a dark one: rfp-black is within a few
 * percent of the dark page colour, so the most important action on a screen
 * read as a faint rectangle. `bg-rfp-ink` inverts with the theme instead -
 * dark button on light, light button on dark - so it is the loudest thing in
 * the room either way.
 */
export const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-rfp-ink px-5 " +
  "text-[15px] font-semibold text-rfp-surface press hover:opacity-90 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold " +
  "focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Secondary action - same geometry, lower emphasis. */
export const buttonSecondaryClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rfp-border " +
  "bg-rfp-surface px-4 text-sm font-semibold text-rfp-ink-secondary press " +
  "hover:bg-rfp-surface-sunken focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-rfp-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-rfp-ink-secondary">
        {label}
      </label>
      {children}
      {/* Error sits with the field, not in a summary at the top, and announces
          itself rather than relying on the red alone. */}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-rfp-critical">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-rfp-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** A number input that brings up the numeric keypad on a phone. */
export function NumberField({
  id,
  label,
  hint,
  error,
  suffix,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  suffix?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          aria-invalid={error ? true : undefined}
          className={`${fieldClass} tabular ${suffix ? "pr-12" : ""} ${error ? "border-rfp-critical" : ""}`}
          {...props}
        />
        {suffix && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-rfp-ink-muted"
          >
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

/**
 * A switch with its explanation attached. Whole row is the target, so it clears
 * 44px without a large control, and the description is wired up via
 * aria-describedby rather than sitting nearby and hoping.
 */
export function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
  tone = "neutral",
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** `caution` marks a setting that can rule out winnable work. */
  tone?: "neutral" | "caution";
}) {
  return (
    <label
      htmlFor={id}
      className={`press press-row flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${
        checked && tone === "caution"
          ? "border-rfp-serious/50 bg-rfp-serious/5"
          : "border-rfp-border hover:bg-rfp-surface-sunken/60"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-description`}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-rfp-border-strong accent-rfp-black focus-visible:ring-2 focus-visible:ring-rfp-gold"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-rfp-ink">{label}</span>
        <span id={`${id}-description`} className="mt-0.5 block text-xs leading-relaxed text-rfp-ink-muted">
          {description}
        </span>
      </span>
    </label>
  );
}

/** Save state, announced politely so it isn't visual-only. */
export function SaveState({ saving, savedAt, error }: { saving: boolean; savedAt: number | null; error?: string | null }) {
  return (
    <p
      aria-live="polite"
      className={`text-xs font-medium ${error ? "text-rfp-critical" : saving ? "text-rfp-ink-secondary" : "text-rfp-ink-muted"}`}
    >
      {error ? error : saving ? "Saving…" : savedAt ? "Saved" : "Autosaves on change"}
    </p>
  );
}
