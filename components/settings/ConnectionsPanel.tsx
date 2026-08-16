/**
 * Whether the desk's outside connections are actually working.
 *
 * Every line is evidence of something having happened - the last email that
 * arrived, the last file that reached Drive, the last verdict returned. None of
 * it reads configuration and reports it as health, because a credential can be
 * present and revoked, present and out of quota, or present and pointed at the
 * wrong account, and in all three cases a tick derived from "the setting exists"
 * is a lie. The overview page already refuses to draw hardcoded ticks for the
 * same reason; this is that rule applied to the things outside the app.
 *
 * The honest cost of that choice: a connection that is fine but has had nothing
 * to do shows as "no evidence yet" rather than green. That is the correct
 * reading - nobody has proven it works - and it resolves itself the first time
 * a solicitation goes through.
 *
 * Google is deliberately not connected from here. n8n keeps its own credential
 * store and cannot use a token this app obtains, and the Gmail trigger is a
 * poller that has to live in n8n, so a "Connect Google" button here would add a
 * second place Google is connected rather than replace the first. Until the
 * whole Drive and mail path moves into the app, the honest thing is to show the
 * state and link to where it is actually managed.
 */

import { TOP_UP_URL, type Credit } from "@/lib/openrouter-credit";

type Line = {
  label: string;
  /** When this last demonstrably worked. null = it never has, here. */
  at: string | null;
  /** What the reader should do if it is not working. */
  hint: string;
  /** Set when the thing cannot work at all yet, whatever the evidence says. */
  blocked?: string;
  /** Which account this ran as. Taken from the work itself - the address a
   *  message arrived at, the folder a bid was filed into - so it cannot name an
   *  account the desk is not really using. */
  account?: { prefix: string; text: string; href?: string } | null;
};

export function ConnectionsPanel({
  lastEmailAt,
  lastMailbox,
  lastFiledAt,
  lastFolderUrl,
  lastVerdictAt,
  triageConfigured,
  profileConfirmed,
  n8nUrl,
  credit,
}: {
  lastEmailAt: string | null;
  lastMailbox: string | null;
  lastFiledAt: string | null;
  lastFolderUrl: string | null;
  lastVerdictAt: string | null;
  triageConfigured: boolean;
  profileConfirmed: boolean;
  /** Where Google is actually managed. null when n8n's address is unset. */
  n8nUrl: string | null;
  /** OpenRouter balance, or null when it could not be read. */
  credit: Credit | null;
}) {
  const lines: Line[] = [
    {
      label: "Gmail: solicitations arriving",
      at: lastEmailAt,
      hint: "Send anything with “RFP” in the subject to the watched mailbox. The trigger polls every minute.",
      account: lastMailbox ? { prefix: "Connected as", text: lastMailbox } : null,
    },
    {
      label: "Triage: verdicts coming back",
      at: lastVerdictAt,
      hint: "Runs in n8n against OpenRouter.",
      blocked: triageConfigured
        ? undefined
        : "N8N_BASE_URL or RFP_INTAKE_API_KEY is not set, so nothing can be submitted for triage.",
    },
    {
      label: "Drive: bids being filed",
      at: lastFiledAt,
      hint: "A folder per bid, the proposal filed into it as a Google Doc.",
      // Drive cannot name the account without an extra API call, so it answers
      // the same question with the folder a bid genuinely landed in - opening it
      // shows whose Drive it is.
      account: lastFolderUrl ? { prefix: "Last filed into", text: "this Drive folder", href: lastFolderUrl } : null,
    },
  ];

  return (
    <section className="mt-8">
      <h2 className="font-display text-sm font-semibold text-rfp-ink">Connections</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
        Each line is the last time that connection actually did something, not whether a setting
        exists. A credential can be present and revoked, and a tick that reads the setting would
        call that healthy. Recorded when the work happens and kept separately from the queue, so
        clearing solicitations does not erase it.
      </p>

      <ul className="mt-3 divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
        {lines.map((line) => {
          const live = !line.blocked && Boolean(line.at);
          return (
            <li key={line.label} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3.5">
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: line.blocked
                    ? "var(--rfp-critical)"
                    : live
                      ? "var(--rfp-good)"
                      : "var(--rfp-warning)",
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-rfp-ink">{line.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
                  {line.blocked ?? (line.at ? `Last worked ${ago(line.at)}.` : `No evidence yet. ${line.hint}`)}
                </p>
                {line.account && (
                  <p className="mt-1 text-xs text-rfp-ink-secondary">
                    {line.account.prefix}{" "}
                    {line.account.href ? (
                      <a
                        href={line.account.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="press inline-flex min-h-11 items-center font-medium text-rfp-gold hover:underline"
                      >
                        {line.account.text} →
                      </a>
                    ) : (
                      <span className="font-medium text-rfp-ink">{line.account.text}</span>
                    )}
                  </p>
                )}
              </div>
              <span className="text-xs font-medium" style={{ color: line.blocked ? "var(--rfp-critical)" : live ? "var(--rfp-good)" : "var(--rfp-ink-muted)" }}>
                {line.blocked ? "Not set up" : live ? "Working" : "Unproven"}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Running out of credit does not announce itself: triage starts failing
          and solicitations keep arriving without verdicts, which looks like a
          quiet week rather than an outage. Stated in solicitations as well as
          dollars, because "about 80 more" is a number someone can act on. */}
      {credit && (
        <div
          className="mt-3 rounded-lg border px-4 py-3 text-xs leading-relaxed"
          style={{
            borderColor:
              credit.level === "ok"
                ? "var(--rfp-border)"
                : credit.level === "empty"
                  ? "var(--rfp-critical)"
                  : "var(--rfp-warning)",
            background:
              credit.level === "critical" || credit.level === "empty"
                ? "color-mix(in srgb, var(--rfp-critical) 8%, transparent)"
                : "transparent",
          }}
        >
          <span className="font-medium text-rfp-ink">
            ${credit.remaining.toFixed(2)} left on OpenRouter
          </span>
          <span className="text-rfp-ink-secondary">
            {" "}of ${credit.total.toFixed(2)}, roughly {credit.solicitationsLeft} more solicitations.
          </span>
          {credit.level !== "ok" && (
            <>
              <span
                className="mt-1 block font-medium"
                style={{ color: credit.level === "empty" ? "var(--rfp-critical)" : "var(--rfp-warning)" }}
              >
                {credit.level === "empty"
                  ? "Out of credit. The next solicitation will arrive with no verdict."
                  : credit.level === "critical"
                    ? "Nearly out. When it runs dry, triage stops and solicitations arrive with no verdict."
                    : "Getting low. Top up before it stops returning verdicts."}
              </span>
              {/* The warning and the fix in the same place. Being told the tank
                  is empty and then having to go and find the pump is how a
                  warning gets read and not acted on. */}
              <a
                href={TOP_UP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="press mt-1.5 inline-flex min-h-11 items-center font-semibold text-rfp-gold hover:underline"
              >
                Add credit on OpenRouter &rarr;
              </a>
            </>
          )}
        </div>
      )}

      {!profileConfirmed && (
        <p className="mt-3 rounded-lg border border-dashed border-rfp-border-strong px-4 py-3 text-xs leading-relaxed text-rfp-ink-secondary">
          Every verdict is stamped <strong>provisional</strong> until the eligibility profile is
          confirmed above. That is deliberately a person&rsquo;s decision, so the desk will not tick
          it for itself.
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-rfp-ink-muted">
        Google is authorised in n8n rather than here. n8n keeps its own credentials and cannot use
        a token this dashboard obtains, and the mail trigger runs there.{" "}
        {n8nUrl ? (
          <a
            href={`${n8nUrl}/home/credentials`}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex min-h-11 items-center font-medium text-rfp-gold hover:underline"
          >
            Manage Google access in n8n →
          </a>
        ) : (
          <span>Set N8N_BASE_URL to link straight to it.</span>
        )}
      </p>
    </section>
  );
}

/** "4 minutes ago", "yesterday". Coarse on purpose - the question this answers
 *  is "recently, or has this been dead a while", not the exact minute. */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "at an unreadable time";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
