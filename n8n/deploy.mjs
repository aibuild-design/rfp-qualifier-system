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
// recorded back into .env.local (N8N_CRED_*_ID) and reused - otherwise every
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
    // fine - env may come from the shell
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

  console.log(`Workflow "${payload.name}" - ${payload.nodes.length} nodes`);

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

  // n8n Cloud doesn't allow custom instance env vars, so the app's origin is
  // baked in here rather than read via $env at runtime - which would silently
  // resolve to undefined and fall back to localhost, leaving the workflow
  // green while every verdict went nowhere.
  const bidDeskUrl = process.env.BID_DESK_URL;
  if (!bidDeskUrl) {
    console.error("BID_DESK_URL must be set in .env.local (the deployed app's origin)");
    process.exit(1);
  }
  // Broad by design: better to triage a few irrelevant emails than to miss a
  // solicitation because the filter was too clever. Narrow it to the
  // aggregator's sender address once that's confirmed.
  const gmailQuery =
    process.env.GMAIL_SEARCH_QUERY ||
    'subject:(RFP OR RFQ OR solicitation OR "request for proposal" OR "request for qualifications")';

  const before = JSON.stringify(payload.nodes);
  let after = before.replaceAll("__BID_DESK_URL__", bidDeskUrl.replace(/\/$/, ""));
  if (before === after) {
    console.error("No __BID_DESK_URL__ placeholder found - the Config node may have been edited.");
    process.exit(1);
  }
  // JSON.stringify escaping keeps the embedded quotes valid inside the string literal.
  after = after.replaceAll("__GMAIL_QUERY__", JSON.stringify(gmailQuery).slice(1, -1));
  // Optional. Unset means bid folders are created at the root of whichever
  // Drive the credential belongs to, which is usable but messy - so say so
  // rather than letting it be discovered later.
  const driveRoot = (process.env.DRIVE_ROOT_FOLDER_ID || "").trim();
  after = after.replaceAll("__DRIVE_ROOT_FOLDER_ID__", driveRoot);
  payload.nodes = JSON.parse(after);
  console.log(`  bid desk → ${bidDeskUrl.replace(/\/$/, "")}`);
  console.log(`  gmail q  → ${gmailQuery}`);
  console.log(
    driveRoot
      ? `  drive    → bid folders under ${driveRoot}`
      : "  drive    → DRIVE_ROOT_FOLDER_ID unset, bid folders land at the Drive root"
  );

  await resolveCredentials(payload);

  const existing = await api("/workflows?limit=250");
  const match = (existing.data ?? []).find((w) => w.name === payload.name);

  if (match) await preserveLiveCredentials(payload, match.id);

  let id;
  if (match) {
    await api(`/workflows/${match.id}`, { method: "PUT", body: JSON.stringify(payload) });
    id = match.id;
    console.log(`✓ Updated workflow ${id}`);
  } else {
    const created = await api("/workflows", { method: "POST", body: JSON.stringify(payload) });
    id = created.id;
    console.log(`✓ Created workflow ${id}`);
  }

  // Activation is opt-in: a deploy shouldn't silently start accepting live
  // solicitations, and an update to an already-active workflow leaves it active.
  if (process.argv.includes("--activate")) {
    const state = await api(`/workflows/${id}/activate`, { method: "POST" });
    console.log(`✓ Activated - webhook live at ${process.env.N8N_BASE_URL.replace(/\/$/, "")}/webhook/rfp-intake`);
    return state;
  }

  console.log("\nWorkflow, credentials, and bid desk URL are all set.");
  console.log("Re-run with --activate when you want it accepting live solicitations.");
}

// Placeholder credential id in the repo JSON → { env var holding the secret,
// the .env.local key where the created id is remembered }.
const CREDENTIALS = {
  BID_DESK_API_KEY: { secretEnv: "RFP_INTAKE_API_KEY", idEnv: "N8N_CRED_BIDDESK_ID" },
  OPENROUTER_API_KEY: { secretEnv: "OPENROUTER_API_KEY", idEnv: "N8N_CRED_OPENROUTER_ID" },
};

async function resolveCredentials(payload) {
  for (const [placeholder, { secretEnv, idEnv }] of Object.entries(CREDENTIALS)) {
    // Nodes carrying this placeholder - skip the API call entirely if unused.
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

/**
 * Carry across any credential the live workflow already has.
 *
 * Gmail and Google Drive are OAuth: they can only be connected by a human
 * clicking through a consent screen in the n8n UI, so their credentials exist
 * on the instance and never in this repo. Without this, every deploy would push
 * nodes with no credential attached and undo that consent - n8n now refuses the
 * publish outright, which is how this was caught, but the older failure mode was
 * a silently disconnected trigger.
 *
 * Repo wins where it specifies a credential; live fills in the rest.
 */
async function preserveLiveCredentials(payload, workflowId) {
  const live = await api(`/workflows/${workflowId}`);

  // Read the PUBLISHED version, not the working copy. n8n keeps a draft
  // alongside the active version, and a deploy that failed to publish leaves a
  // credential-less draft sitting in `nodes` - reading that would carry nothing
  // across and quietly confirm the loss. `activeVersion` is what is actually
  // running, so it is the source of truth for what a human has connected.
  const source = live.activeVersion?.nodes?.length ? live.activeVersion.nodes : live.nodes;
  const liveByName = new Map((source ?? []).map((n) => [n.name, n]));

  const carried = [];
  for (const node of payload.nodes) {
    const existing = liveByName.get(node.name);
    if (!existing?.credentials) continue;
    for (const [type, cred] of Object.entries(existing.credentials)) {
      if (node.credentials?.[type]) continue; // the repo named one - it wins
      node.credentials = { ...(node.credentials ?? {}), [type]: cred };
      carried.push(`${node.name} (${type})`);
    }
  }

  if (carried.length) {
    console.log(`  kept live credentials on ${carried.length} node(s):`);
    carried.forEach((c) => console.log(`    · ${c}`));
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
    // no .env.local - nothing to append to, the id just isn't cached
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
