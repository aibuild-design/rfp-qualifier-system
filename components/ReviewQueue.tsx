"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addPortalRule, removePortalRule, resolveEdgeCase } from "@/app/dashboard/review/actions";
import { Paged } from "@/components/ReviewSteps";
import { splitEdgeCase } from "@/lib/edge-case-text";
import type { EdgeCaseRow, PortalRuleRow } from "@/lib/supabase/types";

export function EdgeCaseList({ items }: { items: EdgeCaseRow[] }) {
  const [, start] = useTransition();
  // The row leaves on the click, not when the server answers. Clearing this
  // list is the whole job of the page, and every item was sitting there through
  // a round trip and a full re-render before it moved, which reads as the
  // button not having worked. The server still decides; it just is not what the
  // eye waits for.
  const [cleared, clear] = useOptimistic<string[], string>([], (list, id) => [...list, id]);
  const visible = items.filter((c) => !cleared.includes(c.id));

  const resolve = (id: string, decision: "approved" | "rejected") =>
    start(async () => {
      clear(id);
      await resolveEdgeCase(id, decision);
    });

  if (!visible.length) {
    return (
      <p className="rounded-xl border border-rfp-border bg-rfp-surface px-5 py-4 text-sm text-rfp-ink-muted">
        Nothing waiting. Cases land here when triage is unsure, or you override a verdict.
      </p>
    );
  }

  return (
    <Paged
      items={visible}
      perPage={5}
      noun="cases"
      render={(page) => (
    <ul className="divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
      {page.map((c) => {
        const { lead, items } = splitEdgeCase(c.description);
        return (
        <li key={c.id} className="px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
            What happened
          </p>
          <p className="mt-1 text-sm leading-relaxed text-rfp-ink">{lead}</p>
          {items.length > 0 && (
            <ol className="mt-2 space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-rfp-ink-secondary">
                  <span aria-hidden className="tabular mt-px shrink-0 text-xs text-rfp-ink-muted">
                    {i + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          )}
          {c.proposed_rule_change && (
            <div className="mt-3 rounded-lg bg-rfp-surface-sunken px-3.5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
                What the desk suggests
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-rfp-ink-secondary">
                {c.proposed_rule_change}
              </p>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => resolve(c.id, "approved")}
              className="rounded-lg bg-rfp-ink px-3 py-1.5 text-xs font-semibold text-rfp-surface hover:opacity-90 disabled:opacity-50"
            >
              Approve rule
            </button>
            <button
              onClick={() => resolve(c.id, "rejected")}
              className="rounded-lg border border-rfp-border px-3 py-1.5 text-xs font-semibold text-rfp-ink-secondary hover:bg-rfp-surface-sunken disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </li>
        );
      })}
    </ul>
      )}
    />
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
          Nothing taught yet. Add one and it goes onto the checklist of every future bid on that
          portal, without anyone having to remember it.
        </p>
      ) : (
        <Paged
          items={rules}
          perPage={6}
          noun="rules"
          render={(page) => (
        <ul className="divide-y divide-rfp-border">
          {page.map((r) => (
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
        />
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
          className="rounded-lg bg-rfp-ink px-3.5 py-2 text-sm font-semibold text-rfp-surface hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <p className="px-3 pb-3 text-xs text-rfp-critical">{error}</p>}
    </div>
  );
}
