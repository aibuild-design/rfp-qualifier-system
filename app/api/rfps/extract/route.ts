import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api-auth";
import { extractText } from "@/lib/extract";
import { checkDocumentUrl, isBlockedHost } from "@/lib/url-guard";
import { lookup } from "node:dns/promises";

// Downloads a solicitation and returns its plain text, whatever format it is
// in — the SOW's "PDF and Word text extraction" (module 01).
//
// This replaced n8n's Download + Extract From File pair. That node has no
// .docx path, and agencies post .docx constantly; doing it here also means one
// place decides what a readable document is, with tests around it.
//
// Machine route: same shared secret as the other n8n-facing endpoints.

/** A solicitation is a document, not a disk image. Caps the download so a
 *  mistyped link to something enormous cannot exhaust the function. */
const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { document_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.document_url) {
    return NextResponse.json({ error: "document_url is required" }, { status: 400 });
  }

  // The same guard the dashboard form uses. This route is reachable by anything
  // holding the intake key, so it re-checks rather than assuming the caller did.
  const checked = checkDocumentUrl(body.document_url);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  try {
    const addresses = await lookup(new URL(checked.url).hostname, { all: true });
    if (addresses.some((a) => isBlockedHost(a.address))) {
      return NextResponse.json({ error: "That link resolves to a private address" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "That link's host could not be found" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(checked.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Some agency portals refuse an obviously scripted client outright.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CaravannBidDesk/1.0)" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not download the document: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `The document link returned HTTP ${res.status}` },
      { status: 502 }
    );
  }

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `The document is ${Math.round(buffer.byteLength / 1e6)}MB, over the ${MAX_BYTES / 1e6}MB limit` },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(buffer);
  let extraction;
  try {
    extraction = await extractText(bytes, res.headers.get("content-type") ?? "");
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read the document: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 422 }
    );
  }

  // No text means there is nothing to triage. Failing here is the honest
  // outcome — the alternative is a confident verdict about a document that was
  // never actually read.
  if (!extraction.text) {
    return NextResponse.json(
      { error: extraction.warning ?? "No text could be extracted", format: extraction.format },
      { status: 422 }
    );
  }

  return NextResponse.json({
    text: extraction.text,
    format: extraction.format,
    chars: extraction.chars,
    bytes: buffer.byteLength,
    // Passed through rather than thrown: short-but-present text is still worth
    // triaging, as long as the caller knows it was thin.
    ...(extraction.warning ? { warning: extraction.warning } : {}),
  });
}
