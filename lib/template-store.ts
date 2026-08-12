import { createClient } from "@supabase/supabase-js";

/**
 * Caravann's blank RFP template, fetched from private storage.
 *
 * Deliberately not committed to the repository. It carries their Tax EIN
 * alongside the CAGE code and UEI, and this repository is public - the CAGE and
 * UEI sit in public federal registries and are fine, an EIN in a public git
 * history is not. It lives in the `client-documents` bucket, which is private
 * and was checked: an anonymous fetch of a stored file returns 400.
 *
 * Held in memory after the first read. It is 455KB and never changes between
 * requests, so re-fetching it per proposal would add a round trip and a
 * download to every triage for no gain. A serverless instance that builds
 * several proposals in a row pays for it once.
 *
 * Returns null rather than throwing. A caller that cannot get the template can
 * fall back to building the document from `lib/docx-template.ts`, which is
 * worse but not nothing; a triage that 500s because storage was briefly
 * unreachable would lose the verdict too.
 */

const BUCKET = "client-documents";
const OBJECT = "caravann-rfp-template.docx";

let cached: Buffer | null | undefined;
let inFlight: Promise<Buffer | null> | null = null;

export async function caravannTemplate(): Promise<Buffer | null> {
  if (cached !== undefined) return cached;

  // Two proposals arriving together would otherwise both start a download.
  // Sharing the promise means the second waits for the first rather than
  // duplicating a 455KB fetch.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Built here from env rather than through the app's Supabase helper,
      // which pulls in Next request context. This module is imported by the
      // verification script too, where there is no request to read.
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
      const { data, error } = await supabase.storage.from(BUCKET).download(OBJECT);
      if (error || !data) {
        console.warn(`[template] could not fetch ${OBJECT}: ${error?.message ?? "no data"}`);
        cached = null;
        return null;
      }
      cached = Buffer.from(await data.arrayBuffer());
      return cached;
    } catch (err) {
      console.warn(`[template] could not fetch ${OBJECT}: ${(err as Error).message}`);
      cached = null;
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Drops the cached copy, so a re-uploaded template is picked up without a
 *  redeploy. */
export function forgetTemplate(): void {
  cached = undefined;
}
