import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractText } from "@/lib/extract";

/**
 * Learn from a proposal Caravann has already written.
 *
 * The library is the ceiling on draft quality, and filling it by hand means
 * somebody reading an old proposal, deciding which paragraphs are reusable,
 * choosing a section for each, and retyping them. Nobody does that twice, which
 * is why it held twelve blocks and one win.
 *
 * A past proposal already contains everything the desk needs: the firm's own
 * language, section by section, and the engagements it can cite. Reading it out
 * is a better use of a model than writing new prose, because nothing here is
 * invented. It is transcription with judgement about where each piece belongs.
 *
 * Nothing is saved from this route. It returns candidates and Khaled accepts
 * them, because a library that fills itself from a document nobody checked is
 * how a stray paragraph from someone else's template ends up in a submission.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENROUTER_API_KEY is not set." }, { status: 503 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a proposal file." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  try {
    const out = await extractText(bytes, file.type);
    text = out.text;
  } catch {
    return NextResponse.json({ error: "Could not read that file." }, { status: 400 });
  }
  if (text.trim().length < 500) {
    return NextResponse.json({ error: "That file has almost no text in it." }, { status: 400 });
  }

  // Capped on the way in, and the cap is about the answer rather than the
  // question. Transcribing a 12,000 word proposal produces more JSON than a
  // single response can hold, so the useful limit is how much material can come
  // back, not how much can go in.
  const capped = text.slice(0, 60_000);

  const system = [
    "You are reading a consulting proposal a firm has already submitted, to pull out material it can reuse.",
    "",
    "Return two things.",
    "",
    "1. BLOCKS: passages that would be reusable on a future bid, each assigned to one section. Use only these section names: introduction, background, scope, technical_description, past_performance, price, terms, representations, amendments, acceptance_period, product_samples.",
    "   A block must be worth reusing: firm boilerplate, a statement of approach, a description of method, terms. Skip anything specific to that one client unless it is the past-performance description of the work itself.",
    "   Transcribe the firm's wording. Do not improve it, shorten it, or make it more general. Where a client name or engagement title appears in otherwise reusable text, replace it with {{CLIENT}} or {{ENGAGEMENT}}.",
    "",
    "2. ENGAGEMENTS: work the proposal describes the firm as having done, as records. Only real prior work, never the engagement being bid for.",
    "",
    "Take nothing that is not in the document. If the proposal does not describe prior work, return an empty engagements list.",
    "",
    "Never use an em dash or an en dash.",
  ].join("\n");

  let payload: unknown;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-5",
        temperature: 0,
        // Transcription is output-heavy: every block returned is the firm's own
        // paragraph copied out in full. At 8,000 this stopped mid-JSON on a
        // real proposal, the parse failed, and the catch below returned empty
        // arrays, so a truncated answer looked exactly like a document with
        // nothing reusable in it.
        max_tokens: 16000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "library_ingest",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["blocks", "engagements"],
              properties: {
                blocks: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["section_type", "title", "body"],
                    properties: {
                      section_type: { type: "string" },
                      title: { type: "string" },
                      body: { type: "string" },
                    },
                  },
                },
                engagements: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["client", "title", "situation", "what_we_did", "outcome"],
                    properties: {
                      client: { type: "string" },
                      title: { type: "string" },
                      situation: { type: "string" },
                      what_we_did: { type: "string" },
                      outcome: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: capped },
        ],
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `The model refused the request (${res.status}).` }, { status: 502 });
    }
    const json = await res.json();
    const finish = json?.choices?.[0]?.finish_reason;
    const content = String(json?.choices?.[0]?.message?.content ?? "");

    if (finish === "length") {
      // Said plainly rather than returning what fits. A partial library from a
      // silently truncated read is worse than none, because nobody knows which
      // half is missing.
      return NextResponse.json(
        {
          error:
            "That proposal has more reusable material than one pass can return. Split it and upload the halves separately, or upload the sections you most want captured.",
        },
        { status: 413 },
      );
    }

    try {
      payload = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "The model's answer was not readable. Nothing has been added." },
        { status: 502 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Could not finish reading that proposal." }, { status: 504 });
  }

  const parsed = payload as {
    blocks?: { section_type: string; title: string; body: string }[];
    engagements?: { client: string; title: string; situation: string; what_we_did: string; outcome: string }[];
  };

  // What the library already holds, so the same paragraph is not offered twice
  // across several uploads of overlapping proposals.
  const { data: existing } = await supabase.from("language_blocks").select("body");
  const seen = new Set((existing ?? []).map((b) => normalise(b.body)));

  const blocks = (parsed.blocks ?? [])
    .filter((b) => b.body?.trim().length > 80)
    .filter((b) => !seen.has(normalise(b.body)));

  // Keep the document, not only what was taken from it. Everything not selected
  // in this one pass would otherwise be gone, and improving the extraction
  // later would mean asking for the file again. It is never sent to the model
  // at draft time; the library is the working extract and this is the archive.
  const { data: stored } = await supabase
    .from("source_documents")
    .insert({
      name: file.name,
      kind: "proposal",
      body: text,
      characters: text.length,
      blocks_taken: blocks.length,
    })
    .select("id")
    .maybeSingle();

  return NextResponse.json({
    document_id: stored?.id ?? null,
    source: file.name,
    characters: text.length,
    truncated: text.length > capped.length,
    blocks,
    engagements: parsed.engagements ?? [],
    alreadyHeld: (parsed.blocks ?? []).length - blocks.length,
  });
}

/** Loose enough that reformatting does not make a paragraph look new. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 400);
}
