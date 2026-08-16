"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
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
      {/* Left - form */}
      <div className="relative flex items-center justify-center bg-rfp-surface px-8 py-12">
        <div className="w-full max-w-[360px]">
          <div className="mb-10">
            {/* Two variants, swapped by theme. The form panel sits on
                --rfp-surface, which inverts with the theme, so the black artwork
                was rendering as a near-invisible smudge on a near-black panel -
                on the first screen anyone sees. */}
            <Image
              src="/brand/caravann-black.png"
              alt="Caravann"
              width={1494}
              height={205}
              priority
              className="brand-any-light h-[26px] w-auto object-contain object-left"
            />
            <Image
              src="/brand/caravann-yellow.png"
              alt=""
              aria-hidden
              width={1500}
              height={277}
              priority
              className="brand-any-dark h-[26px] w-auto object-contain object-left"
            />
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-rfp-ink-muted">
              RFP Bid Desk
            </p>
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
                className="w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
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
                  className="-mr-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-rfp-ink-muted press hover:text-rfp-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold disabled:opacity-50"
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
                className="w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
              />
            </div>

            {error && <p className="text-xs font-medium text-rfp-critical">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface press hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-rfp-ink-muted">
            Invite-only - reach out to your admin for access.
          </p>
        </div>
      </div>

      {/* Right - what the tool does */}
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-rfp-border bg-rfp-ink px-16 lg:flex">
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
            Screen, score and track solicitations in one place.
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
