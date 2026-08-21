"use client";


import { createClient } from "@/lib/supabase/client";
import { useSavedForm } from "@/components/settings/useSavedForm";
import { SaveBar } from "@/components/settings/SaveBar";
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
  // An EIN is not a thing to discover is wrong after submitting, which is also
  // the reason it is not written the moment focus leaves the field.
  const { value: row, setValue: setRow, dirty, saving, error, justSaved, commit, discard } =
    useSavedForm<OrgProfileRow>(initial, async (next) => {
      const patch: Record<string, string | null> = {};
      for (const f of FIELDS) patch[f.key] = (next[f.key] as string | null) || null;
      const { error: failure } = await createClient()
        .from("org_profile")
        // The generated row type rejects a computed key, and every field here
        // is a nullable string, so one narrow cast beats ten branches.
        .update(patch as Partial<OrgProfileRow>)
        .eq("id", true);
      return failure ? { message: failure.message } : null;
    });

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
              value={(row[f.key] as string | null) ?? ""}
              onChange={(e) => setRow({ ...row, [f.key]: e.target.value })}
              className={`${fieldClass} mt-1`}
            />
          </label>
        ))}
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        justSaved={justSaved}
        onSave={() => void commit()}
        onDiscard={discard}
      />
    </div>
  );
}
