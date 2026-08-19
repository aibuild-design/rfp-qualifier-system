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
 *
 * The reasoning is deliberately not here. A first version carried the full why
 * and why-not lists, which ran to a screen and a half in Slack and made the
 * channel something to scroll past rather than glance at. The reasons have not
 * gone anywhere: they are on the bid page, one click away, where there is room
 * to read them properly. A notification's job is to say a decision is waiting,
 * not to argue it.
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
export function verdictMessage(v: SlackVerdict): Record<string, unknown> {
  const headline = `${MARK[v.verdict]} ${LABEL[v.verdict]}${v.score === null ? "" : ` ${v.score}%`} · ${v.agency ?? "unknown agency"}`;

  const facts = [
    { type: "mrkdwn", text: `*Due*\n${day(v.dueAt)}` },
    { type: "mrkdwn", text: `*Questions by*\n${day(v.questionDeadlineAt)}` },
    { type: "mrkdwn", text: `*Budget*\n${money(v.budget)}` },
  ];

  // One sentence, taken from the first reason the desk gave. The first is
  // almost always the one that decided it, and a notification's job is to say a
  // decision is waiting rather than to argue it. The full reasoning is on the
  // bid page, one click away, where there is room to read it.
  const summary = firstLine(v.why) || firstLine(v.whyNot);

  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: headline.slice(0, 150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*<${v.deskUrl}|${v.title}>*` } },
    ...(summary
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: summary }] }]
      : []),
    { type: "section", fields: facts },
  ];

  // The bid page only. Drive belongs on the proposal, which is where somebody
  // goes when they are working on the submission rather than deciding whether
  // to make one, and three links in a notification is a menu.
  const links = [`<${v.deskUrl}|Open the bid>`];

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

/** The first reason, trimmed to something that reads as one line in Slack. */
function firstLine(text: string | null): string {
  if (!text) return "";
  const first = text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*\u2022]\s*/, "").trim())
    .find(Boolean);
  if (!first) return "";
  return first.length > 170 ? first.slice(0, 170).replace(/[ ,;:]+\S*$/, "") + "…" : first;
}
