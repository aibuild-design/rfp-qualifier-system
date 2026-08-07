"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Module 11. The SOW's standard: "a system making go and no-go calls on real
// money never retunes itself without you." Every rule change proposed by the
// digest is inert until it is approved here.

export async function resolveEdgeCase(id: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rfp_edge_cases")
    .update({ status: decision, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/review");
  return { ok: true };
}

export async function addPortalRule(portalName: string, ruleText: string) {
  if (!portalName.trim() || !ruleText.trim()) return { error: "Both fields are required" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("portal_rules")
    .insert({ portal_name: portalName.trim(), rule_text: ruleText.trim() });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/review");
  return { ok: true };
}

export async function removePortalRule(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("portal_rules").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/review");
  return { ok: true };
}
