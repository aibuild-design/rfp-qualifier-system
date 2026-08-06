"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingsIcon } from "./icons";

export function SignOutButton({ userEmail }: { userEmail: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="flex w-full items-center gap-3 border-t border-white/10 px-5 py-4 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-rfp-gold-bright ring-2 ring-white/15">
        {(userEmail ?? "?").charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold text-white">
          {loading ? "Signing out…" : userEmail ?? "Account"}
        </p>
        <p className="truncate text-[11px] text-white/50">Sign out</p>
      </div>
      <SettingsIcon className="ml-auto h-4 w-4 shrink-0 text-white/40" />
    </button>
  );
}
