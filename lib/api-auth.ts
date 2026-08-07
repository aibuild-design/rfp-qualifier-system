import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

/** Shared-secret gate for the machine-to-machine routes n8n calls.
 *  Deliberately not the Supabase service-role key — n8n never holds a
 *  credential broader than "read triage context, post RFP data."
 *  Fails closed when RFP_INTAKE_API_KEY was never configured. */
export function isAuthorized(req: NextRequest): boolean {
  const key = process.env.RFP_INTAKE_API_KEY;
  if (!key) return false;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${key}`);
}

/** Constant-time compare. A plain `===` returns as soon as two bytes differ,
 *  so response latency leaks how much of the secret a guess got right — given
 *  enough samples the key can be rebuilt a byte at a time. Comparing SHA-256
 *  digests keeps the work fixed-width, which also sidesteps timingSafeEqual's
 *  refusal to compare buffers of different lengths (itself a length oracle). */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}
