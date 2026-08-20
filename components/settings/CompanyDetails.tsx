"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fieldClass } from "@/components/ui/form";
import type { OrgProfileRow } from "@/lib/supabase/types";

type Field =
  | "legal_name" | "address" | "point_of_contact" | "telephone" | "email"
  | "website" | "cage_code" | "uei" | "duns" | "tax_ein";

const FIELDS: { key: Field; label: string; hint?: string }[] = [
  { key: "legal_name", label: "Legal name" },
  { key: "address", label: "Address" },
  { key: "point_of_contact", label: "Point of contact" },
  { key: "telephone", label: "Telephone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "cage_code", label: "CAGE code", hint: "Federal contractor identifier" },
  { key: "uei", label: "UEI", hint: "Replaced DUNS in April 2022" },
  { key: "duns", label: "DUNS", hint: "Only if an agency still asks" },
  { key: "tax_ein", label: "Tax EIN" },
];

/**
 * What goes on the front of every submission.
 *
 * These were constants in the template filler. They appear on the cover page of
 * every proposal, so a change of office meant editing code and deploying, and
 * nobody outside the repository could check what was being sent out under
 * Caravann's name. An EIN is not a thing to discover is wrong after submitting.
 */
export function CompanyDetails({ initial }: { initial: OrgProfileRow }) {
  const [row, setRow] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(key: Field, value: string) {
    const next = value.trim() || null;
    setRow({ ...row, [key]: next });
    const patch: Record<string, string | null> = {};
    patch[key] = next;
    const { error } = await createClient()
      .from("org_profile")
      // The generated row type rejects a computed key, and every field here is
      // a nullable string, so one narrow cast beats ten branches.
      .update(patch as Partial<OrgProfileRow>)
      .eq("id", true);
    setSaved(error ? `Not saved. ${error.message}` : "Saved");
    setTimeout(() => setSaved(null), 2000);
  }

  const missing = FIELDS.filter((f) => !row[f.key]).length;

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      {missing > 0 && (
        <p className="mb-4 text-xs" style={{ color: "var(--rfp-warning)" }}>
          {missing} field{missing === 1 ? "" : "s"} empty. Anything blank prints on the cover page
          as a bracketed placeholder.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-sm text-rfp-ink-secondary">
            {f.label}
            {f.hint && <span className="ml-2 text-xs text-rfp-ink-muted">{f.hint}</span>}
            <input
              defaultValue={row[f.key] ?? ""}
              onBlur={(e) => void save(f.key, e.target.value)}
              className={`${fieldClass} mt-1`}
            />
          </label>
        ))}
      </div>

      {saved && <p className="mt-3 text-xs font-medium text-rfp-good">{saved}</p>}
    </div>
  );
}
