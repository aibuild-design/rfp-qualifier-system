import { createClient } from "@/lib/supabase/server";

/**
 * Session gate for server actions.
 *
 * RLS is the real control and it is verified to hold: an anonymous caller reads
 * nothing and writes nothing. But a server action is a POST endpoint that
 * anyone who knows its id can invoke, and without this the action still runs —
 * issuing queries, doing work, and answering with a domain-shaped message like
 * "RFP not found" that quietly confirms the endpoint exists and is live.
 *
 * Failing closed at the top is cheaper, says nothing, and means authorisation
 * does not rest on a single mechanism.
 */
/**
 * What every server action answers: `error` when something stopped it,
 * otherwise its own fields.
 *
 * Declared rather than left to inference. Inference happened to work while
 * every early return was an inline `{ error: ... }` literal, and quietly broke
 * the moment one came from a named helper — so the contract is written down
 * where a caller can read it and a new early return cannot change it.
 */
export type ActionResult<T = object> = Partial<T> & {
  error?: string;
  ok?: true;
};

export type ActionError = { error: string };

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, user: null, denied: { error: "Not signed in" } as ActionError };
  }
  return { supabase, user, denied: null };
}

/**
 * What a failed write is allowed to tell the browser.
 *
 * Postgres error text names tables, columns and constraints — "new row for
 * relation \"rfps\" violates check constraint \"rfps_score_percent_check\"".
 * That is a free schema map for anyone probing, and it means nothing to the
 * person who just clicked a button. Log the detail server-side, return a
 * sentence.
 */
export function safeError(context: string, error: { message: string; code?: string }): ActionError {
  console.error(`[${context}] ${error.code ?? "error"}: ${error.message}`);
  return { error: `Could not ${context}. The detail is in the server log.` };
}
