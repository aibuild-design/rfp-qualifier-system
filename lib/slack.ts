/**
 * The verdict, as a Slack message.
 *
 * Built here rather than in n8n for the same reason the verdict itself is:
 * the wording of a decision belongs with the code that made it. n8n carries the
 * message to Slack and never composes one, so there is no second place where
 * "go" could come out phrased differently.
 *
 * Written to be readable in a notification preview, which is where most of
 * these are actually read: the first line has to carry the verdict, the agency
 * and the deadline, because that is all anybody sees on a lock screen.
 */

import { DISPLAY_TIME_ZONE } from "@/lib/rfp";

export type SlackVerdict = {
  id: string;
  title: string;
  agency: string | null;
  verdict: "go" | "maybe" | "no_go" | "pending";
  score: number | null;
  budget: number | null;
  dueAt: string | null;
  questionDeadlineAt: string | null;
  why: string | null;
  whyNot: string | null;
  provisional: boolean;
  deskUrl: string;
  driveFolderUrl?: string | null;
  documentUrl?: string | null;
};

const LABEL: Record<SlackVerdict["verdict"], string> = {
  go: "Go",
  maybe: "Maybe",
  no_go: "No-go",
  pending: "Pending",
};

/** Slack renders no colour of its own, so the verdict has to be legible from
 *  the emoji alone in a notification list. */
const MARK: Record<SlackVerdict["verdict"], string> = {
  go: ":large_green_circle:",
  maybe: ":large_yellow_circle:",
  no_go: ":red_circle:",
  pending: ":white_circle:",
};

function money(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "not stated";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * A deadline, in the zone the dashboard shows deadlines in.
 *
 * Without the explicit zone this renders in whatever zone the machine composing
 * the message happens to be in, which for a deadline at 22:00 UTC is a
 * different calendar day either side of the Atlantic. A test caught it saying
 * "due Oct 7" for a deadline of Oct 6, and a notification that moves a deadline
 * a day is worse than one that never arrives: the wrong date gets believed.
 */
function day(iso: string | null): string {
  if (!iso) return "none stated";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unreadable";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** Reasons arrive one per line. Slack has no nested lists worth the trouble, so
 *  they become bulleted lines, capped: a notification that needs scrolling has
 *  stopped being a notification. */
function bullets(text: string | null, limit = 3): string {
  if (!text) return "";
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((l) => `• ${l}`)
    .join("\n");
}

export function verdictMessage(v: SlackVerdict): Record<string, unknown> {
  const headline = `${MARK[v.verdict]} ${LABEL[v.verdict]}${v.score === null ? "" : ` ${v.score}%`} · ${v.agency ?? "unknown agency"}`;

  const facts = [
    `*Due*  ${day(v.dueAt)}`,
    `*Questions by*  ${day(v.questionDeadlineAt)}`,
    `*Budget*  ${money(v.budget)}`,
  ].join("\n");

  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: headline.slice(0, 150), emoji: true } },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*<${v.deskUrl}|${v.title}>*` },
    },
    { type: "section", text: { type: "mrkdwn", text: facts } },
  ];

  const why = bullets(v.why);
  const whyNot = bullets(v.whyNot);
  if (why || whyNot) {
    blocks.push({
      type: "section",
      fields: [
        ...(why ? [{ type: "mrkdwn", text: `*Why*\n${why}` }] : []),
        ...(whyNot ? [{ type: "mrkdwn", text: `*Why not*\n${whyNot}` }] : []),
      ],
    });
  }

  const links = [
    `<${v.deskUrl}|Open the bid>`,
    v.documentUrl ? `<${v.documentUrl}|The document>` : null,
    v.driveFolderUrl ? `<${v.driveFolderUrl}|Drive folder>` : null,
  ].filter(Boolean);

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: [
          links.join("  ·  "),
          v.provisional ? ":warning: provisional, the eligibility profile is unconfirmed" : null,
        ]
          .filter(Boolean)
          .join("   "),
      },
    ],
  });

  return {
    // Falls back to this wherever blocks are not rendered: notification
    // previews, screen readers, and the mobile lock screen.
    text: `${LABEL[v.verdict]}${v.score === null ? "" : ` ${v.score}%`}: ${v.title} (${v.agency ?? "unknown agency"}), due ${day(v.dueAt)}`,
    blocks,
  };
}
