#!/usr/bin/env node
// Applies supabase/migrations/*.sql in filename order against the project's
// Postgres, tracking what's been applied in a schema_migrations table so
// re-running is a no-op.
//
//   node scripts/migrate.mjs            # apply pending migrations
//   node scripts/migrate.mjs --status   # list applied vs pending, change nothing
//
// Exists because this project has no Supabase CLI in the loop. If the CLI is
// adopted later, `supabase db push` is the canonical replacement - but the
// applied-migration bookkeeping differs, so pick one and stay on it.
//
// Needs SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD + SUPABASE_DB_HOST +
// NEXT_PUBLIC_SUPABASE_URL (project ref is parsed from the latter).
// Supabase's direct db.<ref>.supabase.co host is IPv6-only on newer projects;
// the session pooler (aws-N-<region>.pooler.supabase.com:5432, user
// postgres.<ref>) is the reliable IPv4 path.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "supabase", "migrations");

async function loadEnv() {
  try {
    const raw = await readFile(join(HERE, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // fine - env may come from the shell
  }
}

function connectionConfig() {
  if (process.env.SUPABASE_DB_URL) {
    return { connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const host = process.env.SUPABASE_DB_HOST;

  if (!url || !password || !host) {
    throw new Error(
      "Set SUPABASE_DB_URL, or all of NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD + SUPABASE_DB_HOST"
    );
  }

  const ref = new URL(url).hostname.split(".")[0];
  return {
    host,
    port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  };
}

async function main() {
  await loadEnv();
  const statusOnly = process.argv.includes("--status");

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (!files.length) {
    console.log("No migrations found.");
    return;
  }

  const client = new pg.Client(connectionConfig());
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        name        text primary key,
        applied_at  timestamptz not null default now()
      )
    `);
    // RLS with no policy: this table is bookkeeping, so nothing but the
    // service role should see it. Without this it sits in the public schema
    // readable by any authenticated user, and Supabase's linter flags it.
    await client.query("alter table schema_migrations enable row level security");

    const { rows } = await client.query("select name from schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const pending = files.filter((f) => !applied.has(f));

    if (statusOnly) {
      for (const f of files) console.log(`  ${applied.has(f) ? "✓ applied" : "· pending"}  ${f}`);
      return;
    }

    if (!pending.length) {
      console.log(`Up to date - ${files.length} migration(s) already applied.`);
      return;
    }

    for (const file of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`▸ ${file} … `);
      // Each migration runs in its own transaction: a failure rolls that file
      // back whole rather than leaving the schema half-migrated.
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log("applied");
      } catch (err) {
        await client.query("rollback");
        console.log("FAILED");
        throw new Error(`${file}: ${err.message}`);
      }
    }

    console.log(`\n✓ ${pending.length} migration(s) applied.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
