"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDialog } from "./ConfirmDialog";
import { ThemeToggle } from "./ThemeToggle";
import { LogOutIcon } from "./icons";

/**
 * Who is signed in, how the app looks, and how to leave.
 *
 * This used to be ONE button: an avatar, the email address, and a settings-gear
 * icon on the right — and clicking anywhere on it signed you out immediately.
 * Nothing said so. A card that looks like a profile and is captioned with a
 * gear reads as "account settings", so the only way to discover what it did was
 * to lose your session doing it.
 *
 * Now the identity is plain text, and signing out is its own labelled control
 * that asks first. Sign-out is not destructive in the data sense, but it is
 * disruptive and completely invisible in advance, which from the user's side is
 * the same problem.
 */
export function SignOutButton({ userEmail }: { userEmail: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSignOut() {
    setConfirming(false);
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="border-t border-white/10 px-4 py-3">
      <ConfirmDialog
        open={confirming}
        title="Sign out of the bid desk?"
        confirmLabel="Yes, sign out"
        cancelLabel="Stay signed in"
        onConfirm={handleSignOut}
        onCancel={() => setConfirming(false)}
        body={
          <>
            <p>
              Signing out of{" "}
              <strong className="font-semibold text-rfp-ink">{userEmail ?? "this account"}</strong>.
            </p>
            <p className="mt-2">
              Nothing is lost — every verdict, note and draft is saved, and any solicitation being
              triaged carries on without you.
            </p>
          </>
        }
      />

      <p className="truncate px-1 pb-2 text-[11px] text-white/40" title={userEmail ?? undefined}>
        {userEmail ?? "Signed in"}
      </p>

      <ThemeToggle />

      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={loading}
        className="press press-row mt-2 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-white/60 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-60"
      >
        <LogOutIcon className="h-4 w-4 shrink-0" />
        {loading ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
