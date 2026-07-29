// node scripts/apply-patches.mjs
//
// Applies the ONLY seven edits this project needs inside
// components/PeacefulEstimate.jsx. Every one is a data-layer change.
// ZERO change to JSX, class names, colors, layout, copy, or tab order.
//
// Follows the exact-anchor rule from DEVELOPER_NOTES: each patch matches
// one literal string, refuses to run if the anchor is missing or appears
// more than once, and never reformats surrounding code.
//
//   node scripts/apply-patches.mjs           # apply (writes a .backup first)
//   node scripts/apply-patches.mjs --check   # report only, change nothing
//   node scripts/apply-patches.mjs --revert  # restore from .backup
//
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";

const FILE = new URL("../components/PeacefulEstimate.jsx", import.meta.url);
const BACKUP = new URL("../components/PeacefulEstimate.jsx.backup", import.meta.url);
const mode = process.argv.includes("--check") ? "check"
           : process.argv.includes("--revert") ? "revert" : "apply";

if (mode === "revert") {
  if (!existsSync(BACKUP)) { console.error("No .backup file to revert to."); process.exit(1); }
  copyFileSync(BACKUP, FILE);
  console.log("Reverted components/PeacefulEstimate.jsx from backup.");
  process.exit(0);
}

let src = readFileSync(FILE, "utf8");
const original = src;

/* ================================================================== */
/* the patches                                                        */
/* ================================================================== */

const patches = [

/* ---------------- P1 · shared storage ---------------- */
{
  id: "P1",
  why: "Swap per-device localStorage for the shared, tenant-scoped store. This is the change that lets every phone and tablet see the same records.",
  find: `} from "lucide-react";`,
  replace: `} from "lucide-react";

// ---- Backend wiring (added). None of these touch the UI. ----
import { store, migrateLegacyLocalStorage, flushOutbox } from "../lib/store";
import { saveMedia, loadMedia, embedMediaForReport } from "../lib/media";`,
},
{
  id: "P1b",
  why: "Remove the old localStorage store object now that the import above supplies `store` with an identical interface.",
  find: `const store = {
  async set(key, value) { try { localStorage.setItem("pm:" + key, JSON.stringify(value)); return true; } catch (e) { return null; } },
  async list(prefix) { try { const keys = Object.keys(localStorage).filter(k => k.startsWith("pm:" + (prefix || ""))).map(k => k.slice(3)); return { keys }; } catch (e) { return null; } },
  async get(key) { try { const v = localStorage.getItem("pm:" + key); return v == null ? null : { value: v }; } catch (e) { return null; } },
};`,
  replace: `// The \`store\` object now comes from ../lib/store (imported above).
// Same three methods, same return shapes — every existing call site works
// unchanged, including the ones that do JSON.parse(r.value).`,
},

/* ---------------- P2 · broken interpolation ---------------- */
{
  id: "P2",
  why: "Missing $ made every downloaded customer report print the literal text {BRAND.tagline}.",
  find: `<div style="font-style:italic;color:#2E7D32;font-size:13px">{BRAND.tagline}</div>`,
  replace: "<div style=\"font-style:italic;color:#2E7D32;font-size:13px\">${BRAND.tagline}</div>",
},

/* ---------------- P3 · persist media on save ---------------- */
{
  id: "P3",
  why: "saveEstimate() wrote everything EXCEPT photos and videos, so media vanished on reload. This is the data-loss fix.",
  find: `    const record = { meta, vehicle, category, totals, rows, folder: "New", tech: currentTech ? currentTech.name : "", savedAt: new Date().toISOString() };
    await store.set(\`estimates:\${meta.number}\`, record);`,
  replace: `    const record = { meta, vehicle, category, totals, rows, folder: "New", tech: currentTech ? currentTech.name : "", savedAt: new Date().toISOString() };
    await store.set(\`estimates:\${meta.number}\`, record);
    // Photos and videos go to Supabase Storage, keyed to this estimate.
    try { await saveMedia(meta.number, custPhotos); } catch (e) {}`,
},

/* ---------------- P4 · restore media ---------------- */
{
  id: "P4",
  why: "Nothing ever loaded media back. Restores it whenever the estimate number changes; also replays offline writes and lifts any legacy per-device records into the cloud once.",
  find: `  useEffect(() => { if (tab === "Dashboard") loadDashboard(); }, [tab]);`,
  replace: `  useEffect(() => { if (tab === "Dashboard") loadDashboard(); }, [tab]);

  // Rehydrate this estimate's photos/videos. loadMedia returns the same
  // { dataUrl, caption, comment, kind } shape the Media tab already renders,
  // so nothing downstream changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!meta.number) return;
      try {
        const saved = await loadMedia(meta.number);
        if (!cancelled && saved.length) setCustPhotos(saved);
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [meta.number]);

  // One-time lift of legacy per-device records, then replay offline writes.
  useEffect(() => {
    (async () => {
      try { await migrateLegacyLocalStorage(); await flushOutbox(); } catch (e) {}
    })();
  }, []);`,
},

/* ---------------- P5 · real phone verification (send) ---------------- */
{
  id: "P5",
  why: "The code was generated in the browser and sat in React state — readable in devtools. Now generated, hashed, and stored server-side.",
  find: `    const code = String(Math.floor(100000 + Math.random() * 900000));
    setPvSent(code); setPvOK(false);
    try {
      const r = await fetch("/api/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: portalBk.phone, body: BRAND.name + " verification code: " + code }) });
      if (!r.ok) throw new Error("route");
      setPortalBkMsg("Code texted — enter it below.");
    } catch (e) { setPortalBkMsg("Code texting runs on the live site — you can book without verifying for now."); }`,
  replace: `    setPvOK(false);
    try {
      // The code is generated and stored on the server. It is never sent
      // to this browser — that is the whole point of the change.
      const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", phone: portalBk.phone }) });
      const d = await r.json();
      if (!r.ok || !d.sent) throw new Error(d.error || "route");
      setPvSent("sent");
      setPortalBkMsg("Code texted — enter it below.");
    } catch (e) { setPortalBkMsg("Code texting runs on the live site — you can book without verifying for now."); }`,
},

/* ---------------- P6 · real phone verification (check) ---------------- */
{
  id: "P6",
  why: "Comparison moved server-side, with attempt limits and a 10-minute expiry.",
  find: `  function checkVerify() {
    if (pvCode && pvSent && pvCode === pvSent) { setPvOK(true); setPortalBkMsg("Phone verified ✓"); }
    else { setPortalBkMsg("That code does not match — try again."); }`,
  replace: `  async function checkVerify() {
    try {
      const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", phone: portalBk.phone, code: pvCode }) });
      const d = await r.json();
      if (d.verified) { setPvOK(true); setPortalBkMsg("Phone verified ✓"); }
      else { setPortalBkMsg(d.error || "That code does not match — try again."); }
    } catch (e) { setPortalBkMsg("That code does not match — try again."); }`,
},

/* ---------------- P7 · self-contained report ---------------- */
{
  id: "P7",
  why: "Media is now served from signed URLs that expire. The downloadable report must inline the images so it still works when texted or opened next week.",
  find: `  function downloadCustomerReport() {
    const items = custPhotos.map((p, i) => {`,
  replace: `  async function downloadCustomerReport() {
    // Signed URLs expire; the report is a file people keep. Inline the stills.
    const embedded = await embedMediaForReport(custPhotos);
    const items = embedded.map((p, i) => {`,
},
];

/* ================================================================== */
/* runner                                                             */
/* ================================================================== */

let applied = 0, already = 0, failed = 0;

for (const p of patches) {
  const count = src.split(p.find).length - 1;

  if (count === 0) {
    if (src.includes(p.replace.trim().split("\n")[0])) {
      console.log(`  ○ ${p.id} — already applied, skipping`);
      already++;
    } else {
      console.error(`  ✗ ${p.id} — ANCHOR NOT FOUND. Do not hand-edit; check the file version.`);
      console.error(`      looking for: ${p.find.split("\n")[0].slice(0, 78)}…`);
      failed++;
    }
    continue;
  }
  if (count > 1) {
    console.error(`  ✗ ${p.id} — anchor matched ${count} times; refusing to guess.`);
    failed++;
    continue;
  }
  if (mode === "check") { console.log(`  → ${p.id} — would apply · ${p.why}`); applied++; continue; }

  src = src.replace(p.find, p.replace);
  console.log(`  ✓ ${p.id} — ${p.why}`);
  applied++;
}

console.log("");

if (failed) {
  console.error(`${failed} patch(es) could not be applied. Nothing was written.`);
  process.exit(1);
}

if (mode === "check") {
  console.log(`${applied} to apply, ${already} already done. No files changed.`);
  process.exit(0);
}

if (src !== original) {
  if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
  writeFileSync(FILE, src, "utf8");
  console.log(`Wrote components/PeacefulEstimate.jsx (backup at .backup).`);
} else {
  console.log("No changes needed.");
}
console.log(`${applied} applied, ${already} already in place.`);
