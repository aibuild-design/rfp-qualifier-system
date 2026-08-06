#!/usr/bin/env node
// Push rfp-intake-triage.json to an n8n instance via its public API, so the
// workflow in this repo stays the source of truth rather than something
// hand-edited in the n8n UI and lost on the next import.
//
//   node n8n/deploy.mjs            # create, or update if a workflow of the same name exists
//   node n8n/deploy.mjs --dry-run  # validate the JSON and show what would happen
//
// Needs N8N_BASE_URL and N8N_API_KEY in .env.local.
//
// The workflow JSON stays instance-agnostic: its nodes reference credentials
// by placeholder id (BID_DESK_API_KEY, OPENROUTER_API_KEY), and this script
// swaps in the target instance's real credential ids at deploy time.
//
// n8n's public API has no "list credentials" endpoint, so created ids are
// recorded back into .env.local (N8N_CRED_*_ID) and reused — otherwise every
// deploy would create another duplicate credential.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  try {
    const raw = await readFile(join(HERE, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // fine — env may come from the shell
  }
}

async function api(path, options = {}) {
  const base = process.env.N8N_BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/v1${path}`, {
    ...options,
    headers: {
      "X-N8N-API-KEY": process.env.N8N_API_KEY,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`n8n ${options.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  await loadEnv();
  const dryRun = process.argv.includes("--dry-run");

  const workflow = JSON.parse(await readFile(join(HERE, "rfp-intake-triage.json"), "utf8"));

  // The public API rejects read-only/unknown top-level keys, so send only
  // what it accepts on create/update.
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings ?? {},
  };

  console.log(`Workflow "${payload.name}" — ${payload.nodes.length} nodes`);

  if (dryRun) {
    const names = payload.nodes.map((n) => n.name);
    // Every connection endpoint must resolve to a real node, or n8n imports a
    // silently broken graph.
    for (const [from, conn] of Object.entries(payload.connections)) {
      if (!names.includes(from)) throw new Error(`Connection from unknown node: ${from}`);
      for (const branch of conn.main ?? []) {
        for (const target of branch ?? []) {
          if (!names.includes(target.node)) {
            throw new Error(`Connection to unknown node: ${target.node}`);
          }
        }
      }
    }
    console.log("✓ JSON parses, all connections resolve to real nodes");
    console.log(`  nodes: ${names.join(" → ")}`);
    return;
  }

  if (!process.env.N8N_BASE_URL || !process.env.N8N_API_KEY) {
    console.error("N8N_BASE_URL and N8N_API_KEY must be set in .env.local");
    process.exit(1);
  }

  await resolveCredentials(payload);

  const existing = await api("/workflows?limit=250");
  const match = (existing.data ?? []).find((w) => w.name === payload.name);

  if (match) {
    await api(`/workflows/${match.id}`, { method: "PUT", body: JSON.stringify(payload) });
    console.log(`✓ Updated workflow ${match.id}`);
  } else {
    const created = await api("/workflows", { method: "POST", body: JSON.stringify(payload) });
    console.log(`✓ Created workflow ${created.id}`);
  }

  console.log("\nStill set by hand in the n8n UI: env var BID_DESK_URL → the deployed app's origin.");
}

// Placeholder credential id in the repo JSON → { env var holding the secret,
// the .env.local key where the created id is remembered }.
const CREDENTIALS = {
  BID_DESK_API_KEY: { secretEnv: "RFP_INTAKE_API_KEY", idEnv: "N8N_CRED_BIDDESK_ID" },
  OPENROUTER_API_KEY: { secretEnv: "OPENROUTER_API_KEY", idEnv: "N8N_CRED_OPENROUTER_ID" },
};

async function resolveCredentials(payload) {
  for (const [placeholder, { secretEnv, idEnv }] of Object.entries(CREDENTIALS)) {
    // Nodes carrying this placeholder — skip the API call entirely if unused.
    const nodes = payload.nodes.filter((n) =>
      Object.values(n.credentials ?? {}).some((c) => c.id === placeholder)
    );
    if (!nodes.length) continue;

    let id = process.env[idEnv];

    if (!id) {
      const secret = process.env[secretEnv];
      if (!secret) throw new Error(`${secretEnv} must be set to create the "${placeholder}" credential`);

      const name = nodes[0].credentials.httpHeaderAuth.name;
      const created = await api("/credentials", {
        method: "POST",
        body: JSON.stringify({
          name,
          type: "httpHeaderAuth",
          data: { name: "Authorization", value: `Bearer ${secret}` },
        }),
      });
      id = created.id;
      console.log(`✓ Created credential "${name}" (${id})`);
      await rememberId(idEnv, id);
    }

    for (const node of nodes) {
      for (const cred of Object.values(node.credentials)) {
        if (cred.id === placeholder) cred.id = id;
      }
    }
  }
}

// n8n's public API can't list credentials, so a created id has to be
// remembered locally or the next deploy silently makes a duplicate.
async function rememberId(key, id) {
  const path = join(HERE, "..", ".env.local");
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch {
    // no .env.local — nothing to append to, the id just isn't cached
    return;
  }
  const line = `${key}=${id}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(raw)
    ? raw.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${raw.replace(/\n*$/, "")}\n${line}\n`;
  await writeFile(path, next);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
