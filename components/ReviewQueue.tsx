"use client";

import { useState, useTransition } from "react";
import { addPortalRule, removePortalRule, resolveEdgeCase } from "@/app/dashboard/review/actions";
import type { EdgeCaseRow, PortalRuleRow } from "@/lib/supabase/types";

export function EdgeCaseList({ items }: { items: EdgeCaseRow[] }) {
  const [pending, start] = useTransition();

  if (!items.length) {
    return (
      <p className="rounded-xl border border-rfp-border bg-rfp-surface px-5 py-4 text-sm text-rfp-ink-muted">
        Nothing waiting. Cases land here when triage is unsure about something, or when you
        override a verdict.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
      {items.map((c) => (
        <li key={c.id} className="px-5 py-4">
          <p className="text-sm text-rfp-ink">{c.description}</p>
          {c.proposed_rule_change && (
            <p className="mt-2 rounded-lg bg-rfp-surface-sunken px-3 py-2 text-xs leading-relaxed text-rfp-ink-secondary">
              <span className="font-semibold text-rfp-ink">Proposed rule: </span>
              {c.proposed_rule_change}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => start(async () => void (await resolveEdgeCase(c.id, "approved")))}
              disabled={pending}
              className="rounded-lg bg-rfp-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-rfp-black-2 disabled:opacity-50"
            >
              Approve rule
            </button>
            <button
              onClick={() => start(async () => void (await resolveEdgeCase(c.id, "rejected")))}
              disabled={pending}
              className="rounded-lg border border-rfp-border px-3 py-1.5 text-xs font-semibold text-rfp-ink-secondary hover:bg-rfp-surface-sunken disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PortalRules({ rules }: { rules: PortalRuleRow[] }) {
  const [pending, start] = useTransition();
  const [portal, setPortal] = useState("");
  const [rule, setRule] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    start(async () => {
      const r = await addPortalRule(portal, rule);
      if (r.error) return setError(r.error);
      setPortal("");
      setRule("");
      setError(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
      {rules.length === 0 ? (
        <p className="px-5 py-4 text-sm text-rfp-ink-muted">
          No rules recorded. Teach it one once - &ldquo;this agency wants references merged into a
          single PDF&rdquo; - and it appears on that portal&rsquo;s compliance checklist from then on.
        </p>
      ) : (
        <ul className="divide-y divide-rfp-border">
          {rules.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
                  {r.portal_name}
                </p>
                <p className="mt-0.5 text-sm text-rfp-ink-secondary">{r.rule_text}</p>
              </div>
              <button
                onClick={() => start(async () => void (await removePortalRule(r.id)))}
                disabled={pending}
                className="shrink-0 text-xs text-rfp-ink-muted hover:text-rfp-critical disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t border-rfp-border p-3">
        <input
          value={portal}
          onChange={(e) => setPortal(e.target.value)}
          placeholder="Portal or agency"
          className="w-44 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
        />
        <input
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="The rule to remember"
          className="min-w-0 flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
        />
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-rfp-black px-3.5 py-2 text-sm font-semibold text-white hover:bg-rfp-black-2 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <p className="px-3 pb-3 text-xs text-rfp-critical">{error}</p>}
    </div>
  );
}
