import { NextRequest } from "next/server";

/** Shared-secret gate for the machine-to-machine routes n8n calls.
 *  Deliberately not the Supabase service-role key — n8n never holds a
 *  credential broader than "read triage context, post RFP data."
 *  Fails closed when RFP_INTAKE_API_KEY was never configured. */
export function isAuthorized(req: NextRequest): boolean {
  const key = process.env.RFP_INTAKE_API_KEY;
  if (!key) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${key}`;
}
