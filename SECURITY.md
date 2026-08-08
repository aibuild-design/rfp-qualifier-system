# Security

This app holds Caravann's live bid pipeline — which solicitations they're
chasing, how each scores, where they're weak, and what they might price. That
is competitively sensitive, so the posture is "invite-only internal tool", not
"public web app".

## Findings from the 2026-08-07 review, and what was done

All four were verified against the live project, not inferred from reading code.

### 1. Anyone could register and read everything — **fixed**

Supabase's signup endpoint is open by default and the anon key is public by
design (it ships in the browser bundle). The original RLS policies granted full
read/write to anyone holding the `authenticated` role. Chained together: any
person with any email address could self-register, confirm, sign in, and read
the entire pipeline.

Confirmed by creating a working account using nothing but the public anon key.
That account was deleted immediately.

**Fix:** every table's policy now checks membership of an `app_users` allowlist
keyed on the JWT email claim. Re-verified with a fully confirmed intruder
account holding a valid session — every table returned empty, every write was
rejected, and it could not add itself to the allowlist. The legitimate account
was checked in the same pass and retains full access.

Turning signup off in the dashboard (below) is still worth doing, but access no
longer depends on it.

### 2. The n8n webhook accepted anonymous requests — **fixed**

`POST /webhook/rfp-intake` had no authentication. Anyone who learned or guessed
the URL could inject fabricated solicitations into the queue Khaled makes real
decisions from, spend OpenRouter credit one 1M-context call at a time, and use
the `document_url` field to make n8n fetch arbitrary hosts.

Not theoretical: a probe row reached the database during testing.

**Fix:** the webhook now requires the same `Authorization: Bearer` header the
app's own machine routes use. Unauthenticated and wrong-key requests both get
403; the authenticated path was re-tested end to end.

Note that n8n only re-registers a webhook on activation — a config change alone
leaves the old behaviour live. Deactivate and reactivate after touching it.

### 3. Mass assignment on the intake route — **fixed**

The route spread the request body straight into the upsert, so a caller could
set any column: `is_demo` (laundering a fabricated solicitation into the real
queue, or hiding a real one from it), `id`, `created_at`. This client uses the
service-role key and bypasses RLS, so the route's own validation is the only
control in the path.

**Fix:** an explicit field allowlist. Anything not named is dropped.

### 4. Timing-sensitive key comparison — **fixed**

The shared secret was compared with `===`, which returns as soon as two bytes
differ. **Fix:** constant-time comparison over SHA-256 digests, which also
avoids leaking length.

## Findings from the 2026-08-08 pass, and what was done

The first review predates the manual-submission form, the CSV export and the
Word export. This pass covered those and re-tested everything above.

Re-verified adversarially, not read: 44 checks run as an outsider holding only
the public anon key — every table returns nothing, every write is rejected, the
allowlist cannot be self-granted, and every route answers 401 or redirects.

### 5. SSRF through `document_url` — **closed at the app boundary**

Previously listed below as a known limitation. It stopped being theoretical
when the dashboard form began accepting a link from a person and handing it to
n8n to fetch: `http://169.254.169.254/…` would have had n8n retrieve the cloud
metadata service, which on AWS, GCP and Azure serves the instance's own
credentials.

**Fix:** `lib/url-guard.ts` rejects non-http(s) schemes, embedded credentials,
loopback, link-local, unique-local, CGNAT, multicast and every private IPv4
range, `.local`/`.internal`/`.localhost` names, and IPv4-mapped IPv6. The
hostname is then resolved and each returned address re-checked, so a public
name pointing at a private address is caught too.

Verified twice: 23 blocked targets and 6 legitimate links in the unit suite,
plus five real attempts driven through the live form, including the metadata
address and the obfuscated `http://2130706433/` spelling of 127.0.0.1.

**Residual:** the name is resolved here and fetched by n8n a moment later, so
DNS rebinding is still possible. Closing that needs the fetcher to pin the
address it resolved, which is n8n's side of the wire. The bar is raised, not
sealed.

### 6. Server actions ran before checking for a session — **fixed**

RLS meant an anonymous caller read nothing and wrote nothing, and that was
verified. But a server action is a POST endpoint anyone who knows its id can
invoke, and each one still ran: issuing queries and answering with a
domain-shaped message like "RFP not found" that confirms the endpoint is live.

**Fix:** every action now opens with `requireUser()` and returns before doing
work. Authorisation no longer rests on RLS alone.

### 7. Postgres error text was returned to the browser — **fixed**

Failed writes answered with the raw driver message, which names tables, columns
and constraints — a free schema map, and meaningless to whoever clicked the
button. **Fix:** `safeError()` logs the detail server-side and returns a
sentence.

### 8. Intake silently discarded child rows — **fixed** (see git history)

Not an access-control bug but a trust one: a compliance item whose `due_at` the
model phrased as prose failed its cast, and the route answered `200 ok` with
the whole compliance checklist missing. Errors are now surfaced and dates
coerced. This is the finding most likely to have caused a real bad decision.

## Still open — needs the Supabase dashboard

**Turn off public signup.** Authentication → Providers → Email → disable
"Enable sign ups". Then add people via Authentication → Users → Invite.

Defence in depth: the allowlist already means a new account sees nothing, but
there's no reason to let strangers create accounts at all.

## Managing access

```bash
npm run access list                                    # who has access, and who has a stray account
npm run access add khaled@caravann.co "Caravann — principal"
npm run access remove someone@example.com              # effective immediately
```

Allowlisting an email does not create a login — the person still needs a
Supabase Auth account. `list` flags accounts that exist but aren't allowlisted.

The allowlist is service-role only on purpose: if the browser could write it,
any user could grant access to anyone.

## How credentials are split

Each holder gets the narrowest credential that does its job.

| Where | Holds | Not |
|---|---|---|
| Browser | anon key (public by design; useless without an allowlisted account) | service role |
| Vercel | anon + service role + intake key | OpenRouter key, DB password, n8n token |
| n8n | intake key, OpenRouter key | anything Supabase |
| Your laptop | everything, for migrations and deploys | — |

The app never calls OpenRouter, so the model billing key is not on the public
web app. n8n never touches Supabase directly, so it holds no database
credential.

## Rotate before handover

Every key was pasted into a chat session. Nothing reached git — each diff was
scanned — but treat them all as exposed:

- Supabase → Settings → API (anon, service role) and Database (password)
- n8n → Settings → n8n API
- OpenRouter → openrouter.ai/keys

After rotating, update `.env.local`, update the Vercel environment variables,
and run `npm run n8n:deploy` so n8n picks up the new secrets.

## Known limitations

**Prompt injection.** Solicitations are untrusted text fed to a model. A
document containing instructions aimed at the model could try to steer its
verdict. The mitigations are that nothing auto-submits, every verdict is
advisory, and the reasoning is shown so a manipulated conclusion is visible
rather than silent. Worth revisiting if the system ever acts without review.

**DNS rebinding on `document_url`.** The private-range blocking described in
finding 5 runs when the link is submitted; n8n fetches moments later. A record
that changes in between still gets through. Pinning the resolved address is
n8n's side of the wire.

**Verdict variance.** The same solicitation can score differently across runs
even at temperature 0 — observed go/90 and maybe/78 on identical input. This is
a correctness caveat rather than a security one, but it matters for the same
reason: treat a verdict as advice, not as an answer.
