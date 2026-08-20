import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { PageTransition } from "@/components/PageTransition";
import { Tour } from "@/components/Tour";
import { isoDaysFromNow } from "@/lib/rfp";
import type { AttentionCounts, NavCounts } from "@/lib/nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return <SupabaseNotConfigured />;
  }

  const supabase = await createClient();

  // getClaims, not getUser, and it is worth saying why.
  //
  // getUser sends a request to the Auth server on every call. Measured against
  // this project: 211ms, paid on every dashboard page before a single query
  // starts, which was most of the ~490ms floor on a cold load. getClaims
  // verifies the access token's signature locally with WebCrypto against the
  // project's JWKS, which is cached: 1ms.
  //
  // It is not the unsafe shortcut. getSession would be, because it reads the
  // cookie and trusts it. getClaims checks the signature and the expiry
  // cryptographically, which is what this needs to answer: is there a real,
  // unexpired session, or do we send them to the login page.
  //
  // The one thing it cannot see is a user deleted or banned server-side since
  // their token was issued. That matters less than it sounds here: every query
  // on every page still runs under RLS with that same token, so a revoked user
  // reaches an empty database rather than someone else's bids. The write paths
  // in lib/auth.ts keep getUser.
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const userEmail = typeof claims.claims.email === "string" ? claims.claims.email : null;

  // Numbers for the rail: nav badges plus the "needs attention" block. All are
  // `head: true`, so Postgres returns a count and no rows, and they go out
  // together rather than in sequence - this is the layout, so the cost is paid
  // on every single dashboard page.
  // Three of these five asked the same table three questions: everything not
  // ruled out, everything still pending, everything Khaled has accepted. Three
  // round trips for three filters over the same rows, paid on every dashboard
  // page because this is the layout. One narrow projection answers all three.
  const [{ data: statuses }, { count: reviewCount }, { count: dueSoonCount }] = await Promise.all([
    supabase.from("rfps").select("status, human_verdict"),
    supabase
      .from("rfp_edge_cases")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("rfp_compliance_items")
      .select("*", { count: "exact", head: true })
      .eq("is_complete", false)
      .not("due_at", "is", null)
      .lte("due_at", isoDaysFromNow(7)),
  ]);

  const rfpRows = statuses ?? [];
  const counts: NavCounts = {
    queue: rfpRows.reduce((n, r) => (r.status === "no_go" ? n : n + 1), 0),
    review: reviewCount ?? 0,
    // Bids Khaled has accepted. Not the desk's verdict: a proposal exists
    // because a person said to write one.
    proposals: rfpRows.reduce(
      (n, r) => (r.human_verdict && r.human_verdict !== "no_go" ? n + 1 : n),
      0,
    ),
  };
  const attention: AttentionCounts = {
    pendingTriage: rfpRows.reduce((n, r) => (r.status === "pending" ? n + 1 : n), 0),
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
      <Sidebar userEmail={userEmail} counts={counts} attention={attention} />
      {/* min-w-0 is load-bearing: a flex child defaults to min-width:auto and
          refuses to shrink below its content's intrinsic width, which is how a
          wide table makes the whole app scroll sideways on a phone.

          overflow-y-auto makes THIS the scroll container - which is also what
          keeps the Topbar pinned to the top of the content rather than to a page
          sliding underneath it. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar userEmail={userEmail} counts={counts} attention={attention} />
        {/* Capped and centred. Without a ceiling the queue stretched to 2240px on a
            2560 monitor, so a table row ran the full width of the glass and the
            eye had to travel from a title on the far left to a due date on the
            far right. Pages that want to be narrower still set their own
            max-width inside this. */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-5 lg:p-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <Tour />
    </div>
  );
}
