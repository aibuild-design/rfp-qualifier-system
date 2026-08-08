"use server";

import { revalidatePath } from "next/cache";
import { requireUser, safeError, type ActionResult } from "@/lib/auth";

// Module 11. The SOW's standard: "a system making go and no-go calls on real
// money never retunes itself without you." Every rule change proposed by the
// digest is inert until it is approved here.

export async function resolveEdgeCase(id: string, decision: "approved" | "rejected"): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_edge_cases")
    .update({ status: decision, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return safeError("record that decision", error);
  revalidatePath("/dashboard/review");
  return { ok: true };
}

export async function addPortalRule(portalName: string, ruleText: string): Promise<ActionResult> {
  if (!portalName.trim() || !ruleText.trim()) return { error: "Both fields are required" };
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("portal_rules")
    .insert({ portal_name: portalName.trim(), rule_text: ruleText.trim() });
  if (error) return safeError("add the rule", error);
  revalidatePath("/dashboard/review");
  return { ok: true };
}

export async function removePortalRule(id: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase.from("portal_rules").delete().eq("id", id);
  if (error) return safeError("remove the rule", error);
  revalidatePath("/dashboard/review");
  return { ok: true };
}
