import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { SlackWebhook } from "@/components/settings/SlackWebhook";

export default async function Page() {
  const supabase = await createClient();
  const { data: scoring } = await supabase
    .from("scoring_settings")
    .select("slack_webhook_url")
    .eq("id", true)
    .maybeSingle();

  return (
    <SettingsShell title="Where verdicts are sent" intro="Every verdict posts to Slack. Add a webhook and it goes to the channel you choose; leave it empty and nothing is sent.">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        Used for notification. Does not affect any verdict.
      </p>
      <SlackWebhook initial={scoring?.slack_webhook_url ?? null} />
    </SettingsShell>
  );
}
