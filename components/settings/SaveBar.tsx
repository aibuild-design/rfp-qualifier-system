"use client";

/**
 * The Save control, which appears only when there is something to save.
 *
 * Sticky at the bottom of the form rather than at the top, because the change
 * that needs saving is usually the one just typed, and a button that scrolls
 * out of sight is a button people do not press. It is absent entirely when the
 * form is clean, so its presence means exactly one thing.
 */
export function SaveBar({
  dirty,
  saving,
  error,
  justSaved,
  onSave,
  onDiscard,
  guard,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  justSaved: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** From useSavedForm. Renders the leave dialog when navigation is caught. */
  guard?: { pending: string | null; stay: () => void; leave: () => void };
}) {
  if (!dirty && !justSaved && !error) return null;

  return (
    <>
      {guard?.pending && (
        <LeaveDialog onStay={guard.stay} onLeave={guard.leave} onSave={onSave} saving={saving} />
      )}
    <div
      className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.16)]"
      style={{
        borderColor: error ? "var(--rfp-critical)" : dirty ? "var(--rfp-gold)" : "var(--rfp-border)",
        background: "var(--rfp-surface)",
      }}
    >
      {error ? (
        <p className="text-sm font-medium text-rfp-critical">Not saved. {error}</p>
      ) : dirty ? (
        <p className="text-sm font-medium text-rfp-ink">Unsaved changes.</p>
      ) : (
        <p className="text-sm font-medium text-rfp-good">Saved.</p>
      )}

      {dirty && (
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-4 text-sm font-medium text-rfp-ink-secondary hover:bg-rfp-surface-sunken disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-5 text-sm font-semibold text-rfp-surface hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </span>
      )}
      </div>
    </>
  );
}

/**
 * Asked before losing work, in the app's own voice.
 *
 * This was window.confirm, which is a system alert: it carries the browser's
 * chrome and the browser's wording, and it cannot offer the option that is
 * actually wanted here, which is to save and carry on. Three choices, and the
 * safe one is the default.
 */
function LeaveDialog({
  onStay,
  onLeave,
  onSave,
  saving,
}: {
  onStay: () => void;
  onLeave: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-title"
    >
      <div className="drawer-scrim absolute inset-0 bg-black/60" onClick={onStay} aria-hidden />
      <div className="dialog-panel relative w-full max-w-md rounded-xl border border-rfp-border bg-rfp-surface p-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <h2 id="leave-title" className="font-display text-base font-semibold text-rfp-ink">
          You have unsaved changes
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-rfp-ink-secondary">
          Leaving this page now discards them. Nothing has been written yet.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onLeave}
            className="press inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-rfp-critical hover:opacity-80"
          >
            Leave without saving
          </button>
          <button
            type="button"
            onClick={onStay}
            className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-4 text-sm font-medium text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
          >
            Stay
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              onSave();
              onLeave();
            }}
            className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-5 text-sm font-semibold text-rfp-surface hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save and leave"}
          </button>
        </div>
      </div>
    </div>
  );
}
