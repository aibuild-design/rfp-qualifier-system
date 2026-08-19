"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Where verdicts go in Slack.
 *
 * An incoming-webhook URL rather than a Slack app install: one string, taken
 * from the channel it should post into, revocable from that same page without
 * touching anything here.
 *
 * Empty means no Slack, and that is a supported state rather than a broken one.
 * The email notification is sent either way, so a chat integration nobody has
 * set up can never be the reason a verdict reaches nobody.
 */
export function SlackWebhook({ initial }: { initial: string | null }) {
  const [url, setUrl] = useState(initial ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  const looksWrong = url.trim().length > 0 && !url.trim().startsWith("https://hooks.slack.com/");

  async function save() {
    const next = url.trim() || null;
    const { error } = await createClient()
      .from("scoring_settings")
      .update({ slack_webhook_url: next })
      .eq("id", true);
    setSaved(error ? `Not saved. ${error.message}` : next ? "Saved" : "Slack turned off");
    setTimeout(() => setSaved(null), 3000);
  }

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <label htmlFor="slack-url" className="block text-sm font-medium text-rfp-ink">
        Slack webhook URL
      </label>
      <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
        Slack: Apps &rarr; Incoming Webhooks &rarr; Add to Slack, pick the channel, paste the URL.
        Empty means email only.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          id="slack-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => void save()}
          placeholder="https://hooks.slack.com/services/…"
          className="min-h-11 flex-1 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 text-base text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60 sm:text-sm"
        />
        <button
          type="button"
          onClick={() => void save()}
          className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface hover:opacity-90"
        >
          Save
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {looksWrong && (
          <span style={{ color: "var(--rfp-warning)" }}>
            A Slack webhook starts with https://hooks.slack.com/. This will not post.
          </span>
        )}
        {saved && <span className="font-medium text-rfp-good">{saved}</span>}
        {!saved && !looksWrong && (
          <span className="text-rfp-ink-muted">
            {url.trim() ? "Verdicts post to Slack and email." : "Email only."}
          </span>
        )}
      </div>
    </div>
  );
}
