import fs from "node:fs";
for (const line of fs.readFileSync(".env.local","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/); if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,"")}
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const { data: rfp } = await s.from("rfps").select("id").limit(1).single();
await s.from("rfps").update({ human_verdict: null, human_verdict_at: null }).eq("id", rfp.id);
const { chromium } = await import("playwright");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
await ctx.addInitScript(`localStorage.setItem("rfp-theme","dark");localStorage.setItem("rfp-tour-seen","1")`);
const page = await ctx.newPage();
await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
await page.fill("input[type=email]", process.env.VERIFY_LOGIN_EMAIL);
await page.fill("input[type=password]", process.env.VERIFY_LOGIN_PASSWORD);
await Promise.all([page.waitForURL(/\/dashboard/, {timeout:45000}), page.click("button[type=submit]")]);
await page.goto(`http://localhost:3000/dashboard/rfps/${rfp.id}`, { waitUntil: "networkidle" });
console.log("--- h2 headings while undecided:");
for (const h of await page.locator("h2").allInnerTexts()) console.log("  ·", h.replace(/\n/g," "));
