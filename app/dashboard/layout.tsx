import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { isoDaysFromNow } from "@/lib/rfp";
import type { AttentionCounts, NavCounts } from "@/lib/nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return <SupabaseNotConfigured />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Numbers for the rail: nav badges plus the "needs attention" block. All are
  // `head: true`, so Postgres returns a count and no rows, and they go out
  // together rather than in sequence — this is the layout, so the cost is paid
  // on every single dashboard page.
  const [
    { count: queueCount },
    { count: reviewCount },
    { count: pendingCount },
    { count: dueSoonCount },
  ] = await Promise.all([
    supabase.from("rfps").select("*", { count: "exact", head: true }).neq("status", "no_go"),
    supabase
      .from("rfp_edge_cases")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("rfp_compliance_items")
      .select("*", { count: "exact", head: true })
      .eq("is_complete", false)
      .not("due_at", "is", null)
      .lte("due_at", isoDaysFromNow(7)),
  ]);

  const counts: NavCounts = { queue: queueCount ?? 0, review: reviewCount ?? 0 };
  const attention: AttentionCounts = {
    pendingTriage: pendingCount ?? 0,
    dueSoon: dueSoonCount ?? 0,
    review: reviewCount ?? 0,
  };

  return (
    <div className="flex min-h-screen w-full bg-rfp-page">
      <Sidebar userEmail={user.email ?? null} counts={counts} attention={attention} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar counts={counts} />
        <main className="flex-1 p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
