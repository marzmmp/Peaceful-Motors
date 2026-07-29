// node scripts/selfcheck.mjs — the maintenance gate. Runs locally and on
// every push via .github/workflows/selfcheck.yml.
//
// UPGRADED. The previous version counted braces with
// src.split("{").length === src.split("}").length, which also counts
// braces inside strings, comments, and regex — balanced-but-broken code
// passed. It cleared a file that contained a broken template literal and
// a data-loss bug. This version actually parses the source.
import { readFileSync, existsSync } from "fs";
import { transformSync } from "esbuild";

const root = new URL("../", import.meta.url);
const p = (rel) => new URL(rel, root);
const read = (rel) => readFileSync(p(rel), "utf8");

const checks = [];
const add = (name, ok) => checks.push([name, !!ok]);

/* ---------- 1. the component actually compiles ---------- */
const componentPath = "components/PeacefulEstimate.jsx";
const src = read(componentPath);
try {
  transformSync(src, { loader: "jsx" });
  add("component parses (real compiler)", true);
} catch (e) {
  add(`component parses — ${e.message.split("\n")[0]}`, false);
}

/* ---------- 2. every backend file compiles too ---------- */
const backend = [
  "lib/store.js", "lib/media.js", "lib/guard.js", "lib/ratelimit.js",
  "lib/supabase-browser.js", "lib/supabase-server.js", "lib/supabase-admin.js",
  "lib/pin.js", "lib/customers.js",
  "middleware.js",
  "app/api/claude/route.js", "app/api/email/route.js", "app/api/sms/route.js",
  "app/api/phone/route.js", "app/api/parts/route.js", "app/api/carfax/route.js",
  "app/api/verify/route.js", "app/login/page.js", "app/auth/callback/route.js",
  "app/api/roster/route.js", "app/api/pin/verify/route.js",
  "app/api/pin/set/route.js", "app/api/pin/reset/route.js",
];
for (const f of backend) {
  if (!existsSync(p(f))) { add(`present: ${f}`, false); continue; }
  try { transformSync(read(f), { loader: "jsx" }); add(`compiles: ${f}`, true); }
  catch (e) { add(`compiles: ${f} — ${e.message.split("\n")[0]}`, false); }
}

/* ---------- 3. no broken template interpolation ---------- */
// Catches `{BRAND.tagline}` written inside a template literal without the $.
const badInterp = /[^$]\{[A-Za-z_$][\w$]*\.[\w$]+\}/g;
const lines = src.split("\n");
let inTemplate = false, badLines = [];
lines.forEach((line, i) => {
  const ticks = (line.match(/`/g) || []).length;
  if (inTemplate && badInterp.test(line) && !line.trim().startsWith("//")) badLines.push(i + 1);
  if (ticks % 2 === 1) inTemplate = !inTemplate;
  badInterp.lastIndex = 0;
});
add(`no broken \${} interpolation${badLines.length ? ` (lines ${badLines.join(", ")})` : ""}`, badLines.length === 0);

/* ---------- 4. every tab still renders ---------- */
for (const t of ["Details","Bookings","Photo Estimate","Line Items","Parts","Customer View","Invoice","Media","Guides","Fixes & Times","Community","Academy","Integrations","Dashboard","Admin","Help"])
  add(`tab renders: ${t}`, src.includes(`tab === "${t}"`));

/* ---------- 5. systems still wired ---------- */
for (const k of ["sendTextSmart","getShopNumber","reportProblem","autoDraft","sendVerify","portalBallpark","toggleDonor","tabEnabled","consent:loc:","terms:accepted","shoplog:entries","forum:posts","fixes:library","carfax:queue","times:guide","members:list","mfeed:posts","BarcodeDetector"])
  add(`system present: ${k}`, src.includes(k));

/* ---------- 6. security invariants ---------- */
add("no secrets in the component", !/sk-ant-[A-Za-z0-9]|AC[0-9a-f]{30}|re_[A-Za-z0-9]{20}/.test(src));
add("service-role key never imported by a component",
  !existsSync(p(componentPath)) || !src.includes("supabase-admin"));
for (const r of ["claude","email","sms","phone","parts","carfax","roster","pin/verify","pin/set","pin/reset"]) {
  const f = `app/api/${r}/route.js`;
  add(`route guarded: /api/${r}`, existsSync(p(f)) && read(f).includes("guard("));
}
// Task 2 invariant: the component never stores or compares a plaintext PIN
// on its own when the server is reachable — login goes through the verify
// route, and new PINs are minted by /api/pin/set.
add("PIN login verifies server-side", src.includes("/api/pin/verify"));
add("PINs hashed via /api/pin/set", src.includes("/api/pin/set"));
{
  // Strip SQL comments first — otherwise this trips on its own explanatory prose.
  const sqlFiles = ["supabase/01_schema.sql", "supabase/02_policies.sql", "supabase/03_storage.sql"];
  let open = false;
  for (const f of sqlFiles) {
    if (!existsSync(p(f))) continue;
    const bare = read(f).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    if (/using\s*\(\s*true\s*\)/.test(bare)) open = true;
  }
  add("no RLS policy open to the world", !open);
  add("legacy open-policy schema removed", !existsSync(p("supabase-schema.sql")));
}
add("no stray TODO/FIXME", !/TODO|FIXME/.test(src));

/* ---------- report ---------- */
let fail = 0;
for (const [n, ok] of checks) { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; }
if (fail) { console.error(`\n${fail} check(s) failed`); process.exit(1); }
console.log(`\nAll ${checks.length} checks passed.`);
