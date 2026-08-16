import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
/**
 * Watch a batch of solicitations through triage.
 *
 * Polls until `expected` rows have a score, then prints one line per row with
 * every child-table count beside it. The counts are the point: a verdict that
 * arrives with zero compliance items is a batch that half-failed, and the row
 * on its own looks fine.
 *
 *   node scripts/watch-triage.mjs 5
 */
const expected = Number(process.argv[2] ?? 5);

for (let i = 1; i <= 30; i++) {
  const { data } = await s.from("rfps").select("*").not("score_percent", "is", null);
  if ((data?.length ?? 0) >= expected) {
    console.log(`all ${expected} done\n`);
    console.log("run  verdict  score  reads          budget    due         gate cmpl gaps qs sect team edge  filed");
    let n = 0;
    for (const r of data.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      n++;
      const c = {};
      for (const [k, t] of [["gate","rfp_disqualifier_checks"],["cmpl","rfp_compliance_items"],["gaps","rfp_gap_items"],["qs","rfp_questions"],["sect","rfp_proposal_sections"],["team","rfp_team_assignments"],["edge","rfp_edge_cases"]]) {
        const { count } = await s.from(t).select("*", { count: "exact", head: true }).eq("rfp_id", r.id);
        c[k] = count;
      }
      console.log(
        `${n}    ${r.status.padEnd(8)} ${String(r.score_percent).padStart(3)}%   ${JSON.stringify(r.score_samples).padEnd(14)} $${String(r.budget_amount).padEnd(8)} ${r.due_at?.slice(0,10)}  ${String(c.gate).padStart(3)} ${String(c.cmpl).padStart(4)} ${String(c.gaps).padStart(4)} ${String(c.qs).padStart(2)} ${String(c.sect).padStart(4)} ${String(c.team).padStart(4)} ${String(c.edge).padStart(4)}  ${r.filing_status}`
      );
    }
    const scores = data.map((r) => r.score_percent);
    const verdicts = [...new Set(data.map((r) => r.status))];
    console.log(`\nverdicts: ${verdicts.join(", ")}   scores: ${scores.join(", ")}   spread: ${Math.max(...scores) - Math.min(...scores)}`);
    console.log(`solicitation numbers: ${[...new Set(data.map((r) => r.solicitation_number))].join(" | ")}`);
    console.log(`due dates:            ${[...new Set(data.map((r) => r.due_at?.slice(0,10)))].join(" | ")}`);
    console.log(`budgets:              ${[...new Set(data.map((r) => r.budget_amount))].join(" | ")}`);
    process.exit(0);
  }
  console.log(`  ${i * 30}s: ${data?.length ?? 0}/${expected} scored`);
  await new Promise((r) => setTimeout(r, 30000));
}
console.log("timed out");
