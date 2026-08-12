import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Caravann's cover logo, for the proposal's first page.
 *
 * Extracted from `word/media/image1.png` inside their own blank template rather
 * than re-drawn or fetched, so the mark on a generated proposal is byte-identical
 * to the one on every proposal they have filed by hand.
 *
 * Read once and held. It is 258KB and the file never changes between requests,
 * so re-reading it per proposal is pure waste on a serverless function that may
 * build several in a row.
 *
 * Returns null rather than throwing if the file is missing. A proposal without
 * the logo is worth having; a request that 500s because an image did not load
 * is not.
 */
let cached: Buffer | null | undefined;

export async function caravannLogo(): Promise<Buffer | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await readFile(join(process.cwd(), "public/brand/caravann-cover.png"));
  } catch {
    cached = null;
  }
  return cached;
}
