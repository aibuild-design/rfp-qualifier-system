"use server";

import { revalidatePath } from "next/cache";
import { requireUser, safeError, type ActionResult } from "@/lib/auth";

/**
 * Folder management.
 *
 * Server actions rather than API routes, so they run under the caller's own
 * session and stay behind the RLS allowlist. Nothing here uses the service-role
 * client - that is reserved for n8n's machine path, where there is no user to
 * act as.
 */

const MAX_NAME = 80;

function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME) return null;
  return name;
}

export async function createFolder(name: string, parentId: string | null = null): Promise<ActionResult<{ id: string }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const clean = cleanName(name);
  if (!clean) return { error: `Give the folder a name, up to ${MAX_NAME} characters` };

  // Placed last within its parent. Ordering is by sort_order then name, so a
  // new folder appears where it was made rather than jumping into the middle.
  // `is null` and `eq` are different operators in PostgREST, so the top level
  // and a nested level need different queries rather than one with a value
  // swapped in.
  const siblingQuery = supabase.from("rfp_folders").select("sort_order");
  const { data: siblings } = await (parentId === null
    ? siblingQuery.is("parent_id", null)
    : siblingQuery.eq("parent_id", parentId)
  )
    .order("sort_order", { ascending: false })
    .limit(1);
  const next = (siblings?.[0]?.sort_order ?? 0) + 10;

  const { data, error } = await supabase
    .from("rfp_folders")
    .insert({ name: clean, parent_id: parentId, sort_order: next })
    .select("id")
    .single();
  if (error) return safeError("create the folder", error);

  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

export async function renameFolder(id: string, name: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const clean = cleanName(name);
  if (!clean) return { error: `Give the folder a name, up to ${MAX_NAME} characters` };

  const { error } = await supabase
    .from("rfp_folders")
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return safeError("rename the folder", error);

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Deleting a folder never deletes what is in it.
 *
 * `folder_id` is ON DELETE SET NULL, so the solicitations return to the unfiled
 * queue with their verdicts intact. Subfolders do go, which is what deleting a
 * folder means everywhere else.
 *
 * The typed confirmation is enforced here, not only in the dialog. A control
 * that is only guarded in the browser is not guarded - this action is callable
 * by anything holding a session.
 */
export async function deleteFolder(id: string, typed: string): Promise<ActionResult<{ released: number }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  if (typed.trim().toLowerCase() !== "delete") {
    return { error: 'Type "delete" to confirm' };
  }

  // Enforced here, not only in the interface. Hiding a button stops the click;
  // it does not stop the request, and this one unfiles every solicitation in
  // the folder with no undo.
  const { data: folder } = await supabase
    .from("rfp_folders")
    .select("is_system,name")
    .eq("id", id)
    .maybeSingle();
  if (folder?.is_system) {
    return { error: `${folder.name} is a stage of the pipeline, so it cannot be deleted. You can rename it.` };
  }

  // Counted before the delete so the confirmation can say what happened to the
  // contents rather than leaving someone to wonder.
  const { count } = await supabase
    .from("rfps")
    .select("*", { count: "exact", head: true })
    .eq("folder_id", id);

  const { error } = await supabase.from("rfp_folders").delete().eq("id", id);
  if (error) return safeError("delete the folder", error);

  revalidatePath("/dashboard");
  return { ok: true, released: count ?? 0 };
}

/** Move one solicitation. Null files it back under nothing. */
export async function moveToFolder(rfpId: string, folderId: string | null): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const { error } = await supabase.from("rfps").update({ folder_id: folderId }).eq("id", rfpId);
  if (error) return safeError("move the solicitation", error);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}
