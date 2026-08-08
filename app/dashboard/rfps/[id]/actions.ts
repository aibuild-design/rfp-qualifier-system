"use server";

import { revalidatePath } from "next/cache";
import { requireUser, safeError, type ActionResult } from "@/lib/auth";
import { assembleDraft, DEFAULT_SECTIONS } from "@/lib/proposal";
import { recommendTeam } from "@/lib/team-match";

// Server actions rather than API routes: these are user-initiated from the
// dashboard, so they run under the caller's own session and stay subject to
// the RLS allowlist. The service-role client is reserved for n8n's machine
// path, where there is no user to act as.

export async function buildDraft(rfpId: string): Promise<ActionResult<{ drafted: number; needsInput: number; preserved: number }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const [{ data: rfp }, { data: blocks }] = await Promise.all([
    supabase.from("rfps").select("*").eq("id", rfpId).maybeSingle(),
    supabase.from("language_blocks").select("*"),
  ]);

  if (!rfp) return { error: "RFP not found" };

  const sections = assembleDraft(rfp, blocks ?? [], DEFAULT_SECTIONS);

  // Replace wholesale so a rebuild after adding library material doesn't
  // leave stale sections behind. Approved sections are preserved — losing a
  // human's edits to an automated rebuild would be unforgivable.
  const { data: existing } = await supabase
    .from("rfp_proposal_sections")
    .select("section_type,status,body")
    .eq("rfp_id", rfpId);

  const approved = new Map(
    (existing ?? []).filter((s) => s.status === "approved").map((s) => [s.section_type, s])
  );

  await supabase
    .from("rfp_proposal_sections")
    .delete()
    .eq("rfp_id", rfpId)
    .neq("status", "approved");

  const rows = sections
    .filter((s) => !approved.has(s.section_type))
    .map((s) => ({ ...s, rfp_id: rfpId }));

  if (rows.length) {
    const { error } = await supabase.from("rfp_proposal_sections").insert(rows);
    if (error) return safeError("build the draft", error);
  }

  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return {
    ok: true,
    drafted: rows.filter((r) => r.status === "draft").length,
    needsInput: rows.filter((r) => r.status === "needs_input").length,
    preserved: approved.size,
  };
}

export async function approveSection(rfpId: string, sectionId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_proposal_sections")
    .update({ status: "approved" })
    .eq("id", sectionId);
  if (error) return safeError("approve the section", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

export async function matchTeam(rfpId: string): Promise<ActionResult<{ recommended: number }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const [{ data: members }, { data: checks }] = await Promise.all([
    supabase.from("team_members").select("*"),
    supabase.from("rfp_disqualifier_checks").select("requirement_text,is_required").eq("rfp_id", rfpId),
  ]);

  const picks = recommendTeam(members ?? [], checks ?? []);
  if (!picks.length) return { error: "No active team members to recommend" };

  // Only clear recommendations — a confirmed assignment is Khaled's decision
  // and re-running the matcher must not silently undo it.
  await supabase
    .from("rfp_team_assignments")
    .delete()
    .eq("rfp_id", rfpId)
    .eq("status", "recommended");

  const { data: confirmed } = await supabase
    .from("rfp_team_assignments")
    .select("team_member_id")
    .eq("rfp_id", rfpId);
  const already = new Set((confirmed ?? []).map((c) => c.team_member_id));

  const rows = picks
    .filter((p) => !already.has(p.team_member_id))
    .map((p) => ({
      rfp_id: rfpId,
      team_member_id: p.team_member_id,
      status: "recommended" as const,
      match_reason: p.match_reason,
      match_score: p.match_score,
    }));

  if (rows.length) {
    const { error } = await supabase.from("rfp_team_assignments").insert(rows);
    if (error) return safeError("save the recommendations", error);
  }

  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true, recommended: rows.length };
}

export async function confirmAssignment(rfpId: string, assignmentId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_team_assignments")
    .update({ status: "confirmed" })
    .eq("id", assignmentId);
  if (error) return safeError("confirm the assignment", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/** Approving a question is a human act and is recorded as one. Sending is
 *  separate and not wired: the SOW requires Khaled to send the records-request
 *  lane himself, and there is no mail credential in this build. */
export async function approveQuestion(rfpId: string, questionId: string): Promise<ActionResult> {
  const { supabase, user, denied } = await requireUser();
  if (denied) return denied;

  const { error } = await supabase
    .from("rfp_questions")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user?.email ?? null,
    })
    .eq("id", questionId);
  if (error) return safeError("approve the question", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/** Records that an approved question was sent by hand. No mail is dispatched
 *  from here — this marks what a human already did, so the memo doesn't get
 *  sent twice. */
export async function markQuestionSent(rfpId: string, questionId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_questions")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", questionId);
  if (error) return safeError("mark the question sent", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}
