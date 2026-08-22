import { openRouterChat } from "@/lib/openrouter";
import type { IntakeEmail } from "@/lib/intake-filter";

/**
 * Read the email and decide whether it is an opportunity to bid.
 *
 * Word matching can only find what somebody remembered to type into a list, and
 * the case it can never reach is the one that arrives most often once a firm has
 * relationships: a colleague forwards a solicitation with the subject "Re:
 * Thursday" and nothing in the subject line, the attachment name or the term
 * list says anything at all. Every word in the body says it. A keyword filter
 * reads that as a note about Thursday and the bid is never seen, which looks
 * exactly like a quiet week.
 *
 * So the terms stay as the fast path and this is what happens to everything they
 * did not recognise. Anything the list already accepts skips the model entirely,
 * which on a dedicated intake address is most of the traffic and most of the
 * cost.
 *
 * Deliberately narrow. The question is "is somebody inviting a proposal", not
 * "should Caravann bid this": fit is what triage is for, and a classifier that
 * starts judging suitability will quietly reject work the firm would have won.
 */

/** Cheap and fast. This reads a few hundred words and answers yes or no; the
 *  reasoning model is for the solicitation itself. Overridable so the account
 *  running it can move without a deploy. */
const CLASSIFIER_MODEL = process.env.INTAKE_CLASSIFIER_MODEL || "anthropic/claude-haiku-4.5";

/** Enough of the body to tell a forwarded RFP from a note about lunch, and no
 *  more. A forwarded solicitation announces itself in its first paragraph. */
const BODY_CHARS = 1500;

/** One request for the whole poll. Beyond this the batch is split, because a
 *  hundred emails in one prompt is a prompt the model reads carelessly. */
const BATCH = 20;

export type ClassifierVerdict = {
  index: number;
  qualifies: boolean;
  reason: string;
};

function describe(email: IntakeEmail, index: number): string {
  const names = (email.attachments ?? [])
    .map((n) => String(n ?? "").trim())
    .filter(Boolean);
  const body = String(email.body ?? "").replace(/\s+/g, " ").trim();
  return [
    `--- EMAIL ${index} ---`,
    `Subject: ${String(email.subject ?? "").trim() || "(none)"}`,
    `Attachments: ${names.length ? names.join(", ") : "(none)"}`,
    `Body: ${body.slice(0, BODY_CHARS) || "(empty)"}${body.length > BODY_CHARS ? " [...]" : ""}`,
  ].join("\n");
}

const SYSTEM = `You screen a bid desk's intake mailbox for Caravann Consulting, a firm that responds to public sector solicitations.

For each email, answer one question: is somebody inviting a proposal, quote, qualification or bid, or telling this firm about an opportunity to submit one?

Say YES to:
- A solicitation, RFP, RFQ, RFI, ITB, IFB, invitation to bid, sources sought, call for proposals or statement of qualifications request, whatever it is called
- An email forwarding or attaching one, even when the subject says nothing. A colleague forwarding a document with the subject "Re: Thursday" is a yes if the body or the attachment is a solicitation
- An aggregator or bid board digest listing open opportunities
- An addendum, amendment, question and answer document, deadline change or award notice for a solicitation. These belong to a bid already being tracked and the desk needs to see them
- A direct approach from an agency asking whether the firm would propose on something
- Anything where you are genuinely unsure and a procurement is plausibly involved

Say NO to:
- Ordinary correspondence, scheduling, invoices, receipts and internal chat with no solicitation in it
- Marketing, newsletters, webinars, conferences and training about how to write proposals. Talking about bidding is not an invitation to bid
- Sales approaches to Caravann, including software and services vendors using the words proposal or bid
- Legal or financial boilerplate that happens to contain the word solicitation, such as "this does not constitute a solicitation to buy or sell"
- Job applications and recruitment

The cost of the two mistakes is not equal. A missed solicitation is a contract nobody ever knows was lost. A wrongly admitted email costs a few cents and is dropped at the next stage. When it is close, say yes.

Return only JSON: {"results":[{"index":0,"qualifies":true,"reason":"one short sentence"}]}. One entry per email, in the order given.`;

async function classifyBatch(
  emails: IntakeEmail[],
  offset: number,
  signal?: AbortSignal,
): Promise<ClassifierVerdict[] | null> {
  const call = await openRouterChat(
    {
      model: CLASSIFIER_MODEL,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: emails.map((e, i) => describe(e, offset + i)).join("\n\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "intake_screen",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["results"],
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["index", "qualifies", "reason"],
                  properties: {
                    index: { type: "number" },
                    qualifies: { type: "boolean" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    { signal },
  );

  if (!call.ok) {
    console.warn(
      `[intake-screen] ${call.outOfCredit ? "out of credit" : `OpenRouter ${call.status}`} - falling back to the term list. ${call.detail.slice(0, 160)}`,
    );
    return null;
  }

  try {
    const json = await call.response.json();
    const raw = String(json?.choices?.[0]?.message?.content ?? "");
    const parsed = JSON.parse(raw) as { results?: ClassifierVerdict[] };
    return Array.isArray(parsed.results) ? parsed.results : null;
  } catch (error) {
    console.warn(`[intake-screen] unparseable response, falling back to the term list. ${String(error).slice(0, 160)}`);
    return null;
  }
}

/**
 * Screen the emails the term list did not recognise.
 *
 * Returns a verdict per original index. A null return anywhere means the model
 * could not be reached, and the caller keeps whatever the terms decided rather
 * than dropping the mail: an intake filter that goes silent when an API is down
 * is the one failure nobody would notice until a deadline had passed.
 */
export async function screenUnmatched(
  candidates: { index: number; email: IntakeEmail }[],
  signal?: AbortSignal,
): Promise<Map<number, ClassifierVerdict>> {
  const out = new Map<number, ClassifierVerdict>();
  if (candidates.length === 0) return out;

  for (let start = 0; start < candidates.length; start += BATCH) {
    const slice = candidates.slice(start, start + BATCH);
    const verdicts = await classifyBatch(
      slice.map((c) => c.email),
      start,
      signal,
    );
    if (!verdicts) continue;
    for (const v of verdicts) {
      // The model is asked to echo the position it was given. Trusting it to
      // return them in order would silently attach one email's verdict to
      // another's, which is worse than not screening at all.
      const local = Number(v?.index) - start;
      const target = slice[local];
      if (!target) continue;
      out.set(target.index, {
        index: target.index,
        qualifies: Boolean(v.qualifies),
        reason: String(v.reason ?? "").slice(0, 300),
      });
    }
  }

  return out;
}
