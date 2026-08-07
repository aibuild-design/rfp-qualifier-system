#!/usr/bin/env node
// Manage who can use the dashboard.
//
//   node scripts/manage-access.mjs list
//   node scripts/manage-access.mjs add khaled@caravann.co "Caravann — principal"
//   node scripts/manage-access.mjs remove someone@example.com
//
// The allowlist is what actually enforces access: every table's RLS policy
// checks membership, so an account that isn't listed here sees nothing even
// if it signs up and confirms its email successfully.
//
// Adding an email here does NOT create a login. The person still signs up (or
// is invited) through Supabase Auth; this is the second half they need.
// Deliberately service-role only — if the browser could write app_users, any
// allowlisted user could silently grant access to anyone.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  const raw = await readFile(join(HERE, "..", ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

async function main() {
  await loadEnv();
  const [cmd, email, note] = process.argv.slice(2);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  if (cmd === "list" || !cmd) {
    const { data, error } = await supabase.from("app_users").select("*").order("added_at");
    if (error) throw new Error(error.message);

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const accounts = new Map((authUsers?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

    console.log(`${data.length} allowlisted:\n`);
    for (const row of data) {
      const acct = accounts.get(row.email.toLowerCase());
      const state = !acct
        ? "no account yet — they still need to sign up"
        : acct.email_confirmed_at
          ? "active"
          : "account created, email not confirmed";
      console.log(`  ${row.email}`);
      console.log(`    ${state}${row.note ? ` · ${row.note}` : ""}`);
    }

    // An account that exists but isn't allowlisted can log in and see nothing.
    // Worth surfacing: it's either a stale invite or someone who self-registered.
    const stray = (authUsers?.users ?? []).filter(
      (u) => !data.some((r) => r.email.toLowerCase() === u.email?.toLowerCase())
    );
    if (stray.length) {
      console.log(`\n${stray.length} account(s) NOT on the allowlist (they can sign in but see nothing):`);
      stray.forEach((u) => console.log(`  ${u.email}`));
    }
    return;
  }

  if (!email) {
    console.error("usage: manage-access.mjs <list|add|remove> [email] [note]");
    process.exit(1);
  }

  if (cmd === "add") {
    const { error } = await supabase
      .from("app_users")
      .upsert({ email: email.toLowerCase(), note: note ?? null }, { onConflict: "email" });
    if (error) throw new Error(error.message);
    console.log(`✓ ${email} allowlisted.`);
    console.log("  They still need a Supabase Auth account — invite them from");
    console.log("  Authentication > Users, or have them use the password-reset flow.");
    return;
  }

  if (cmd === "remove") {
    const { error } = await supabase.from("app_users").delete().eq("email", email.toLowerCase());
    if (error) throw new Error(error.message);
    console.log(`✓ ${email} removed — they now see nothing, effective immediately.`);
    console.log("  Their login still exists. Delete it in Authentication > Users to");
    console.log("  revoke the account itself.");
    return;
  }

  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
