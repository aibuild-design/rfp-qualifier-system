import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/api-auth";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { DEFAULT_SUBJECT_TERMS } from "@/lib/intake-filter";

/**
 * Which subject lines n8n should treat as a solicitation.
 *
 * Asked once per email, before anything expensive happens. The alternative was
 * a hardcoded search query inside the Gmail trigger, which meant the rule
 * deciding what the desk even sees lived somewhere Khaled could not read, and
 * changing it meant editing a workflow.
 *
 * Deliberately its own endpoint rather than part of /api/rfps/context: context
 * is fetched once a solicitation is already being triaged, which is far too
 * late to decide whether it should be.
 *
 * Fails open. If this route is unreachable n8n keeps its built-in defaults
 * rather than filtering everything out - a settings lookup failing should not
 * silently stop the desk receiving work.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceRoleConfigured) {
    return NextResponse.json({ subject_terms: DEFAULT_SUBJECT_TERMS, source: "default" });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("scoring_settings")
    .select("email_subject_terms")
    .eq("id", true)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ subject_terms: DEFAULT_SUBJECT_TERMS, source: "default" });
  }

  const terms = (data.email_subject_terms ?? []).map((t) => t.trim()).filter(Boolean);

  // An empty list is a real choice - "show me everything" - and is passed
  // through as such rather than being replaced by the defaults, which would
  // make the setting impossible to clear.
  return NextResponse.json({ subject_terms: terms, source: "settings" });
}
