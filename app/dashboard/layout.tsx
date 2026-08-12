import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { PageTransition } from "@/components/PageTransition";
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
  // together rather than in sequence - this is the layout, so the cost is paid
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
    /* The app is exactly one viewport tall and never scrolls itself. Only the
       content column does.

       It was min-h-screen, which lets the OUTER container grow with whatever is
       inside it - so a long page (Settings, or a full queue) scrolled the entire
       layout and carried the sidebar off the top of the screen with it.
       Navigation should not be something you scroll back up to reach.

       h-dvh rather than h-screen: on a phone 100vh is the tallest the viewport
       ever gets, so a fixed-height layout using it hides its last rows behind
       the browser's address bar. dvh tracks the real height. */
    <div className="flex h-dvh w-full overflow-hidden bg-rfp-page">
      <Sidebar userEmail={user.email ?? null} counts={counts} attention={attention} />
      {/* min-w-0 is load-bearing: a flex child defaults to min-width:auto and
          refuses to shrink below its content's intrinsic width, which is how a
          wide table makes the whole app scroll sideways on a phone.

          overflow-y-auto makes THIS the scroll container - which is also what
          keeps the Topbar pinned to the top of the content rather than to a page
          sliding underneath it. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar userEmail={user.email ?? null} counts={counts} attention={attention} />
        <main className="flex-1 p-5 lg:p-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
