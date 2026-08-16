import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/api-auth";
import { isServiceRoleConfigured } from "@/lib/supabase/config";

// Everything n8n's triage prompt needs to judge a solicitation against
// Caravann specifically: the eligibility profile and sector map Khaled
// confirms in Settings (module 3), plus any portal rules taught once
// (module 11). Exposing it here means n8n holds no Supabase credential -
// it only ever talks to this app and OpenRouter.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceRoleConfigured) {
    return NextResponse.json(
      { error: "Supabase not configured - set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  const supabase = createServiceRoleClient();

  const [{ data: orgProfile }, { data: sectors }, { data: portalRules }, { data: bank }] =
    await Promise.all([
      supabase.from("org_profile").select("*").eq("id", true).maybeSingle(),
      supabase.from("sector_experience").select("sector, years_experience, engagement_count, notes").order("sector"),
      supabase.from("portal_rules").select("portal_name, rule_text").order("portal_name"),
      // Capped and ranked by how often Khaled has approved it. The bank is what
      // makes module 7 improve with use, but pasting an unbounded list into
      // every prompt would cost more each week and eventually crowd out the
      // solicitation it is supposed to be helping read.
      supabase
        .from("question_bank")
        .select("lane, question_text, times_approved")
        .order("times_approved", { ascending: false })
        .limit(40),
    ]);

  return NextResponse.json({
    org_profile: orgProfile ?? null,
    sector_experience: sectors ?? [],
    portal_rules: portalRules ?? [],
    question_bank: bank ?? [],
  });
}
