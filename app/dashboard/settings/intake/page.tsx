import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { IntakeFilterEditor } from "@/components/settings/SubjectTermsEditor";

export default async function Page() {
  const supabase = await createClient();
  const { data: scoring } = await supabase
    .from("scoring_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  return (
    <SettingsShell title="Which emails get triaged" intro="The words that decide whether an email is opened at all. An email matching none of them is never fetched, so a missed opportunity looks exactly like a quiet week.">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        Used for intake. Nothing downstream runs without this.
      </p>
      <IntakeFilterEditor
        initialTerms={scoring?.email_subject_terms ?? []}
        initialIgnore={scoring?.email_ignore_terms ?? []}
      />
    </SettingsShell>
  );
}
