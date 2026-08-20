import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { ScoringSettingsForm } from "@/components/settings/ScoringSettingsForm";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: scoring }, { data: scored }] = await Promise.all([
    supabase.from("scoring_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("rfps").select("score_percent").not("score_percent", "is", null),
  ]);
  const scoreSample = (scored ?? []).map((r) => r.score_percent as number);

  return (
    <SettingsShell title="How the desk decides" intro="Where the go and no-go lines sit, what each scoring dimension is worth, and the subjects marked as outright dealbreakers. Changes apply to the next solicitation with no deploy.">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        Used for analysis. These numbers turn a score into a verdict.
      </p>
      {scoring && <ScoringSettingsForm initial={scoring} scoreSample={scoreSample} />}
    </SettingsShell>
  );
}
