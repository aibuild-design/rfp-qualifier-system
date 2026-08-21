import fs from "node:fs";
for (const line of fs.readFileSync(".env.local","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/); if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,"")}
const { createClient } = await import("@supabase/supabase-js");
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const { data: rfp } = await s.from("rfps").select("id").limit(1).maybeSingle();
const { chromium } = await import("playwright");
const b=await chromium.launch();
const c=await b.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:2});
await c.addInitScript(`localStorage.setItem("rfp-theme","dark");localStorage.setItem("rfp-tour-seen","1")`);
const p=await c.newPage();
await p.goto("http://localhost:3100/login",{waitUntil:"domcontentloaded"});
await p.fill("input[type=email]",process.env.VERIFY_LOGIN_EMAIL);
await p.fill("input[type=password]",process.env.VERIFY_LOGIN_PASSWORD);
await Promise.all([p.waitForURL(/\/dashboard/,{timeout:60000}),p.click("button[type=submit]")]);
async function rebuild(n){
  await p.goto(`http://localhost:3100/dashboard/proposals/${rfp.id}`,{waitUntil:"networkidle"});
  await p.keyboard.press("Escape"); await p.waitForTimeout(500);
  await p.locator('button:text("Rebuild"), button:text("Build the draft")').first().click({timeout:20000});
  const cf=p.locator('button:text("Yes, rebuild it")'); if(await cf.count()) await cf.click();
  await p.locator('[role="progressbar"]').first().waitFor({state:"detached",timeout:600000});
  console.log(`  build ${n} done`);
}
await rebuild(1);
await rebuild(2);
const { data: v } = await s.from("proposal_versions").select("*").eq("rfp_id",rfp.id).order("version",{ascending:false});
console.log("\nversions recorded:", v.length);
for(const x of v) console.log(`   v${x.version}  ${x.word_count} words  ${x.written_count}/${x.section_count} written  body ${x.body.length} chars  doc ${x.doc_url?"yes":"none"}`);
// Does the list render, and does Read work?
await p.goto(`http://localhost:3100/dashboard/proposals/${rfp.id}`,{waitUntil:"networkidle"});
await p.waitForTimeout(700);
const txt=await p.evaluate(()=>document.body.innerText);
console.log("\n'Earlier drafts' section on the page:", /Earlier drafts/.test(txt)?"shown":"MISSING");
const read=p.locator('a:has-text("Read")').first();
if(await read.count()){
  await read.click(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(500);
  const t2=await p.evaluate(()=>document.body.innerText);
  console.log("read page url:", p.url().replace("http://localhost:3100",""));
  console.log("read page shows the draft:", t2.length>2000 ? `yes (${t2.length} chars)` : `NO (${t2.length} chars)`);
  await p.screenshot({path:"/tmp/versions.png",clip:{x:300,y:0,width:1140,height:520}});
} else console.log("no Read link found");
await b.close();
