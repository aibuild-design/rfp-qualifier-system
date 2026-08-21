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
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  justSaved: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty && !justSaved && !error) return null;

  return (
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
  );
}
