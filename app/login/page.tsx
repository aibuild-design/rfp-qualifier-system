"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";
import { DocumentIcon } from "@/components/icons";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() =>
    params.get("error") === "auth" ? "Your session expired. Please sign in again." : ""
  );
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  if (!isSupabaseConfigured) {
    return <SupabaseNotConfigured />;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    setResetLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setResetLoading(false);
    setResetSent(true);
  }

  return (
    <div className="grid min-h-screen overflow-hidden bg-rfp-page lg:grid-cols-2">
      {/* Left — form */}
      <div className="relative flex items-center justify-center bg-rfp-surface px-8 py-12">
        <div className="w-full max-w-[360px]">
          <div className="mb-10 flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-rfp-black text-sm font-bold text-rfp-gold-bright">
              R
            </span>
            <div className="leading-tight">
              <p className="font-display text-[13px] font-semibold tracking-wide text-rfp-ink">
                RFP QUALIFIER
              </p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-rfp-ink-muted">
                Dashboard
              </p>
            </div>
          </div>

          <h1 className="font-display text-2xl font-semibold text-rfp-ink">Welcome back</h1>
          <p className="mb-8 mt-1 text-sm text-rfp-ink-secondary">
            Sign in to your RFP Qualifier dashboard.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-rfp-ink-secondary">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="w-full rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/20"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-rfp-ink-secondary">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="text-xs font-medium text-rfp-ink-muted transition-colors hover:text-rfp-gold disabled:opacity-50"
                >
                  {resetLoading ? "Sending…" : resetSent ? "Email sent ✓" : "Forgot password?"}
                </button>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/20"
              />
            </div>

            {error && <p className="text-xs font-medium text-rfp-critical">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-rfp-black py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rfp-black-2 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-rfp-ink-muted">
            Invite-only — reach out to your admin for access.
          </p>
        </div>
      </div>

      {/* Right — what the tool does */}
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-rfp-border bg-rfp-black px-16 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="pointer-events-none absolute -top-32 -right-32 h-[480px] w-[480px] rounded-full opacity-[0.14] blur-[100px]"
          style={{ background: "radial-gradient(circle, #f2c94c 0%, transparent 60%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-24 h-[360px] w-[360px] rounded-full opacity-[0.10] blur-[90px]"
          style={{ background: "radial-gradient(circle, #c9a227 0%, transparent 60%)" }}
        />

        <div className="relative flex w-full max-w-sm flex-col gap-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
            <DocumentIcon className="h-5 w-5" />
          </span>
          <h2 className="font-display text-xl font-semibold leading-snug text-white">
            Qualify incoming RFPs before you spend a single hour on the response.
          </h2>
          <p className="text-sm leading-relaxed text-white/60">
            One place to screen, score, and track requests for proposal —
            so time only goes into the ones worth pursuing.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
