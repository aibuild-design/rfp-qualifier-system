"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!isSupabaseConfigured) {
    return <SupabaseNotConfigured />;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-rfp-page px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-8">
          <Image
            src="/brand/caravann-black.png"
            alt="Caravann"
            width={1494}
            height={205}
            priority
            className="h-[26px] w-auto object-contain object-left"
          />
          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-rfp-ink-muted">
            RFP Bid Desk
          </p>
        </div>

        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Set a new password</h1>
        <p className="mb-8 mt-1 text-sm text-rfp-ink-secondary">
          Choose a new password for your account.
        </p>

        {done ? (
          <p className="text-sm font-medium text-rfp-good">Password updated - redirecting…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-rfp-ink-secondary">
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
              />
            </div>

            {error && <p className="text-xs font-medium text-rfp-critical">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-rfp-black text-sm font-semibold text-white press hover:bg-rfp-black-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
