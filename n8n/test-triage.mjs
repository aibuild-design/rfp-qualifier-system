#!/usr/bin/env node
// Runs the triage workflow's REAL Code-node JavaScript - extracted from
// rfp-intake-triage.json, not a copy - against fixture solicitations with
// known-correct verdicts, then asserts the result.
//
// Testing a copy of the prompt would let the workflow and the test drift
// apart silently, which is the exact failure this is meant to catch.
//
//   node n8n/test-triage.mjs            # all fixtures
//   node n8n/test-triage.mjs transit    # fixtures matching a substring
//
// Needs OPENROUTER_API_KEY (read from .env.local). Costs a few cents/run.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CARAVANN_CONTEXT, FIXTURES } from "./fixtures/solicitations.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = join(HERE, "rfp-intake-triage.json");

// ── env ──────────────────────────────────────────────────────────────────────

/**
 * The same two-account rule the app uses, in a form a plain script can run.
 *
 * These scripts read OPENROUTER_API_KEY directly, so emptying that slot in
 * favour of the backup broke both of them with a 401 that says "Missing
 * Authentication header" - which sounds like a bug in the request rather than
 * an unset variable. lib/openrouter.ts is TypeScript behind the @/ alias and
 * will not import here, so the order is repeated rather than shared.
 */
function openRouterKeys() {
  return [process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_API_KEY_BACKUP].filter(
    (k) => k && k.length > 0,
  );
}

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

// ── n8n runtime shim ─────────────────────────────────────────────────────────
// Code nodes run against $input and $('Node Name'). Reproduce just enough of
// that surface to execute them outside n8n.
function runCodeNode(jsCode, { input, nodes }) {
  const $input = { first: () => input, all: () => [input] };
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`Shim: no node named ${name}`);
    return { first: () => nodes[name], all: () => [nodes[name]] };
  };
  const fn = new Function("$input", "$", `"use strict";\n${jsCode}`);
  return fn($input, $);
}

async function getCodeNodes() {
  const wf = JSON.parse(await readFile(WORKFLOW, "utf8"));
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const openrouter = byName["OpenRouter - triage"];

  // The jsonBody is an n8n expression: "={{ JSON.stringify({...}) }}". Strip
  // the wrapper and evaluate it with $json bound, so the request body under
  // test is byte-for-byte what the workflow sends.
  const expr = openrouter.parameters.jsonBody.replace(/^=\{\{/, "").replace(/\}\}$/, "");
  const buildRequestBody = ($json) => JSON.parse(new Function("$json", `return (${expr});`)($json));

  return {
    buildPrompt: byName["Build triage prompt"].parameters.jsCode,
    shapePayload: byName["Shape intake payload"].parameters.jsCode,
    buildRequestBody,
  };
}

// ── assertions ───────────────────────────────────────────────────────────────
function check(fixture, body) {
  const e = fixture.expect;
  const fails = [];
  const ok = [];

  const push = (pass, msg) => (pass ? ok : fails).push(msg);

  push(body.status === e.status, `status ${body.status} (expected ${e.status})`);
  push(
    body.budget_source === e.budget_source,
    `budget_source ${body.budget_source} (expected ${e.budget_source})`
  );

  if (e.budget_amount === null) {
    push(body.budget_amount === null, `budget_amount ${body.budget_amount} (expected null)`);
  } else if (e.budget_amount !== undefined) {
    push(
      Number(body.budget_amount) === e.budget_amount,
      `budget_amount ${body.budget_amount} (expected ${e.budget_amount})`
    );
  }

  if (e.minScore !== undefined) {
    push(body.score_percent >= e.minScore, `score ${body.score_percent} (expected >= ${e.minScore})`);
  }
  if (e.maxScore !== undefined) {
    push(body.score_percent <= e.maxScore, `score ${body.score_percent} (expected <= ${e.maxScore})`);
  }

  if (e.mustFailRequirement) {
    const hit = (body.disqualifier_checks || []).find(
      (c) => c.result === "fail" && c.is_required && e.mustFailRequirement.test(c.requirement_text)
    );
    push(Boolean(hit), `required-requirement failure matching ${e.mustFailRequirement}`);
  }

  if (e.mustGapType) {
    push(
      (body.gap_items || []).some((g) => g.gap_type === e.mustGapType),
      `gap of type "${e.mustGapType}"`
    );
  }

  if (e.mustFlagCompliance) {
    const hit = (body.compliance_items || []).find((c) =>
      e.mustFlagCompliance.test(`${c.label} ${c.detail ?? ""}`)
    );
    push(Boolean(hit), `compliance item matching ${e.mustFlagCompliance}`);
  }

  // Structural guarantees the intake route depends on.
  push(Boolean(body.external_id), "external_id present");
  push((body.compliance_items || []).length > 0, "at least one compliance item");
  push((body.questions || []).length > 0, "at least one drafted question");
  push(
    (body.questions || []).some((q) => q.lane === "incumbent_request"),
    "an incumbent_request-lane question"
  );

  return { ok, fails };
}

// ── run ──────────────────────────────────────────────────────────────────────
async function runFixture(code, fixture) {
  const config = {
    json: {
      bid_desk_url: "http://localhost:3000",
      model: "anthropic/claude-sonnet-5",
      payload: {
        external_id: fixture.external_id,
        source: "manual",
        document_text: fixture.text,
      },
    },
  };

  const promptOut = runCodeNode(code.buildPrompt, {
    input: { json: {} }, // no extracted PDF - text came in on the payload
    nodes: { Config: config, "Load triage context": { json: CARAVANN_CONTEXT } },
  });

  const requestBody = code.buildRequestBody(promptOut[0].json);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKeys()[0]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const response = await res.json();

  const shaped = runCodeNode(code.shapePayload, {
    input: { json: response },
    nodes: { "Build triage prompt": promptOut[0] },
  });

  return { body: shaped[0].json.body, usage: response.usage };
}

async function main() {
  await loadEnv();
  if (openRouterKeys().length === 0) {
    console.error("No OpenRouter account configured (OPENROUTER_API_KEY or OPENROUTER_API_KEY_BACKUP in .env.local)");
    process.exit(1);
  }

  const filter = process.argv[2];
  const fixtures = filter ? FIXTURES.filter((f) => f.name.includes(filter)) : FIXTURES;
  const code = await getCodeNodes();

  let failed = 0;
  const results = [];

  for (const fixture of fixtures) {
    process.stdout.write(`\n▸ ${fixture.name}\n`);
    try {
      const { body, usage } = await runFixture(code, fixture);
      const { ok, fails } = check(fixture, body);
      for (const o of ok) console.log(`  ✓ ${o}`);
      for (const f of fails) console.log(`  ✗ ${f}`);
      console.log(
        `  · ${body.disqualifier_checks?.length ?? 0} checks, ${body.gap_items?.length ?? 0} gaps, ` +
          `${body.compliance_items?.length ?? 0} compliance, ${body.questions?.length ?? 0} questions` +
          (usage ? ` · ${usage.prompt_tokens}in/${usage.completion_tokens}out` : "")
      );
      if (fails.length) failed++;
      results.push({ fixture: fixture.name, body });
    } catch (err) {
      console.log(`  ✗ threw: ${err.message}`);
      failed++;
    }
  }

  if (process.env.DUMP) {
    console.log("\n" + JSON.stringify(results, null, 2));
  }

  console.log(`\n${fixtures.length - failed}/${fixtures.length} fixtures passed`);
  process.exit(failed ? 1 : 0);
}

main();
