import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Settings</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">Account details.</p>
      </div>

      <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">Email</p>
        <p className="mt-1.5 text-sm text-rfp-ink">{user?.email}</p>
      </div>
    </div>
  );
}
