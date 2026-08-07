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

**SSRF via `document_url`.** n8n fetches whatever URL it's handed. Now that the
webhook requires authentication this is reachable only by a credential holder,
but the fetch itself is still unrestricted. Add private-range blocking before
opening intake to any less-trusted source.

**Verdict variance.** The same solicitation can score differently across runs
even at temperature 0 — observed go/90 and maybe/78 on identical input. This is
a correctness caveat rather than a security one, but it matters for the same
reason: treat a verdict as advice, not as an answer.
