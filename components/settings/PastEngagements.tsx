"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fieldClass, buttonClass } from "@/components/ui/form";

export type Engagement = {
  id: string;
  client: string;
  client_type: string | null;
  sector: string | null;
  title: string;
  started_on: string | null;
  ended_on: string | null;
  situation: string | null;
  what_we_did: string | null;
  outcome: string | null;
  reference_name: string | null;
  reference_title: string | null;
  reference_email: string | null;
  reference_phone: string | null;
  reference_contactable: boolean;
  won: boolean;
};

/**
 * Work Caravann can cite, as records rather than a paragraph.
 *
 * Past performance is usually where a public-agency bid is won or lost, and it
 * was a single language block: one paragraph about UCSF, reused whatever the
 * solicitation asked for. As records the desk can choose, putting the transit
 * work in front of a transit agency and the education work in front of a
 * university, and adding one is answering fields rather than writing a
 * paragraph in the right voice.
 *
 * The reference fields matter more than they look. Agencies routinely ask for
 * three contactable references and score them; an engagement with nobody to
 * telephone is worth a fraction of one with a name.
 */
export function PastEngagements({ initial }: { initial: Engagement[] }) {
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  function flash(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2500);
  }

  async function add(form: FormData) {
    const row = {
      client: String(form.get("client") ?? "").trim(),
      title: String(form.get("title") ?? "").trim(),
      client_type: String(form.get("client_type") ?? "").trim() || null,
      sector: String(form.get("sector") ?? "").trim() || null,
      started_on: String(form.get("started_on") ?? "") || null,
      ended_on: String(form.get("ended_on") ?? "") || null,
      situation: String(form.get("situation") ?? "").trim() || null,
      what_we_did: String(form.get("what_we_did") ?? "").trim() || null,
      outcome: String(form.get("outcome") ?? "").trim() || null,
      reference_name: String(form.get("reference_name") ?? "").trim() || null,
      reference_title: String(form.get("reference_title") ?? "").trim() || null,
      reference_email: String(form.get("reference_email") ?? "").trim() || null,
      reference_phone: String(form.get("reference_phone") ?? "").trim() || null,
      won: form.get("won") === "on",
    };
    if (!row.client || !row.title) return flash("A client and an engagement title are the minimum.");

    const { data, error } = await createClient().from("past_engagements").insert(row).select().single();
    if (error) return flash(`Not saved. ${error.message}`);
    setRows([...rows, data as Engagement]);
    setAdding(false);
    flash("Added");
  }

  async function remove(id: string) {
    const { error } = await createClient().from("past_engagements").delete().eq("id", id);
    if (error) return flash(`Not removed. ${error.message}`);
    setRows(rows.filter((r) => r.id !== id));
    flash("Removed");
  }

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-rfp-border bg-rfp-surface-sunken px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-rfp-ink">{r.client}</span>
              {r.won ? (
                <span className="rounded-full bg-rfp-good/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-rfp-good">
                  Won
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
                  Proposed
                </span>
              )}
              {r.sector && <span className="text-xs text-rfp-ink-muted">{r.sector}</span>}
              <button
                type="button"
                onClick={() => void remove(r.id)}
                className="press ml-auto text-xs font-medium text-rfp-ink-muted hover:text-rfp-critical"
              >
                Remove
              </button>
            </div>
            <p className="mt-0.5 text-sm text-rfp-ink-secondary">{r.title}</p>
            <p className="mt-1 text-xs text-rfp-ink-muted">
              {r.reference_name ? (
                <>Reference: {r.reference_name}{r.reference_title ? `, ${r.reference_title}` : ""}</>
              ) : (
                <span style={{ color: "var(--rfp-warning)" }}>
                  No reference recorded. Agencies usually ask for three they can telephone.
                </span>
              )}
            </p>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-rfp-ink-muted">
            Nothing on file. Past performance is where most public-agency bids are scored, and with
            no engagements recorded that section has nothing to draw on.
          </li>
        )}
      </ul>

      {adding ? (
        <form action={add} className="mt-4 space-y-3 border-t border-rfp-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-rfp-ink-secondary">
              Client
              <input name="client" required className={`${fieldClass} mt-1`} placeholder="San Mateo County Transit District" />
            </label>
            <label className="text-sm text-rfp-ink-secondary">
              Kind of organisation
              <input name="client_type" className={`${fieldClass} mt-1`} placeholder="Public transit agency" />
            </label>
            <label className="text-sm text-rfp-ink-secondary">
              Engagement
              <input name="title" required className={`${fieldClass} mt-1`} placeholder="Facilitator services" />
            </label>
            <label className="text-sm text-rfp-ink-secondary">
              Sector
              <input name="sector" className={`${fieldClass} mt-1`} placeholder="Public transit" />
            </label>
            <label className="text-sm text-rfp-ink-secondary">
              Started
              <input name="started_on" type="date" className={`${fieldClass} mt-1`} />
            </label>
            <label className="text-sm text-rfp-ink-secondary">
              Ended
              <input name="ended_on" type="date" className={`${fieldClass} mt-1`} />
            </label>
          </div>

          {[
            ["situation", "What they were facing", "An institute of seven centres facing internal fragmentation."],
            ["what_we_did", "What Caravann did", "Designed and facilitated a needs assessment, then strategic planning sessions."],
            ["outcome", "What they were left with", "A four-to-five-year strategic plan and team structure recommendations."],
          ].map(([name, label, placeholder]) => (
            <label key={name} className="block text-sm text-rfp-ink-secondary">
              {label}
              <textarea name={name} rows={2} className={`${fieldClass} mt-1`} placeholder={placeholder} />
            </label>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-rfp-ink-secondary">
              Reference name
              <input name="reference_name" className={`${fieldClass} mt-1`} />
            </label>
            <label className="text-sm text-rfp-ink-secondary">
              Their title
              <input name="reference_title" className={`${fieldClass} mt-1`} />
            </label>
            <label className="text-sm text-rfp-ink-secondary">
              Email
              <input name="reference_email" type="email" className={`${fieldClass} mt-1`} />
            </label>
            <label className="text-sm text-rfp-ink-secondary">
              Telephone
              <input name="reference_phone" className={`${fieldClass} mt-1`} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-rfp-ink-secondary">
            <input name="won" type="checkbox" defaultChecked className="h-4 w-4 accent-rfp-gold" />
            Caravann won and delivered this
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass}>Add engagement</button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="press inline-flex min-h-12 items-center rounded-lg border border-rfp-border px-4 text-sm font-medium text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${buttonClass} mt-4`}>
          Add an engagement
        </button>
      )}

      {saved && <p className="mt-2 text-xs font-medium text-rfp-good">{saved}</p>}
    </div>
  );
}
