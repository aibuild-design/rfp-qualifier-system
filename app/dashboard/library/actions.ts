"use server";

import { revalidatePath } from "next/cache";
import { requireUser, safeError, type ActionResult } from "@/lib/auth";

// Module 8's library. Every block here is text Caravann has already used and
// stands behind — that is the whole point, and why nothing writes to this
// table automatically.

export async function addBlock(form: {
  section_type: string;
  title: string;
  body: string;
  source?: string;
  won?: boolean;
  is_boilerplate?: boolean;
}): Promise<ActionResult> {
  if (!form.section_type || !form.title.trim() || !form.body.trim()) {
    return { error: "Section, title and body are all required" };
  }
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase.from("language_blocks").insert({
    section_type: form.section_type,
    title: form.title.trim(),
    body: form.body.trim(),
    source: form.source?.trim() || null,
    won: form.won ?? false,
    is_boilerplate: form.is_boilerplate ?? false,
  });
  if (error) return safeError("add the block", error);
  revalidatePath("/dashboard/library");
  return { ok: true };
}

export async function removeBlock(id: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase.from("language_blocks").delete().eq("id", id);
  if (error) return safeError("remove the block", error);
  revalidatePath("/dashboard/library");
  return { ok: true };
}

export async function toggleWon(id: string, won: boolean): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase.from("language_blocks").update({ won }).eq("id", id);
  if (error) return safeError("update the block", error);
  revalidatePath("/dashboard/library");
  return { ok: true };
}
