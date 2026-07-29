"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Camera, Plus, Trash2, Loader2, AlertTriangle, Copy, Download, Printer,
  Car, Wrench, X, Search, MapPin, ChevronDown, Store, Stethoscope, ImagePlus,
  CheckCircle2, Circle, User, FileText, BarChart3, ShieldCheck, Save, Check, Mail
} from "lucide-react";

// ---- Backend wiring (added). None of these touch the UI. ----
import { store, migrateLegacyLocalStorage, flushOutbox } from "../lib/store";
import { saveMedia, loadMedia, embedMediaForReport, embedMediaForBackup } from "../lib/media";
import { upsertCustomerRecord } from "../lib/customers";

const C = {
  maroon: "#7A1F1F", maroonDark: "#5E1515", green: "#2E7D32",
  ink: "#141414", panel: "#1E1E1E", line: "#2E2E2E", amber: "#F59E0B", red: "#B3261E",
};

// ---- WHITE-LABEL BRAND CONFIG ----------------------------------------
// To sell this to another shop, this block (plus SERVICE_MENU and LOCAL
// below) is everything that changes. One edit, whole app rebrands.
const BRAND = {
  name: "PEACEFUL MOTORS",
  tagline: "An Ease of Mind is Simply Divine.",
  phone: "314-919-7456",
  email: "peacefulmotors@outlook.com",
  site: "peacefulmotors.com",
};

// ---- Secure backend call target. In your real Next.js deployment this hits
// YOUR api route (app/api/claude/route.js, included alongside this file),
// which holds the Anthropic key server-side. It will 404 in a bare claude.ai
// preview since that route only exists once you deploy — that's expected.
const API_BASE = "/api/claude";

// ---- Storage abstraction. Uses the artifact's built-in window.storage when
// present (claude.ai preview only). On your real deployment this is a stub —
// swap it for real calls to your Supabase `estimates` table.
// The `store` object now comes from ../lib/store (imported above).
// Same three methods, same return shapes — every existing call site works
// unchanged, including the ones that do JSON.parse(r.value).

const CATEGORIES = [
  { key: "domestic", label: "Domestic" }, { key: "foreign", label: "Foreign" },
  { key: "exotic", label: "Exotic" }, { key: "diesel", label: "Diesel" },
  { key: "lawn", label: "Lawn & Equipment" },
];
const OP_GROUPS = [
  { key: "body", label: "Body" }, { key: "paint", label: "Paint" },
  { key: "mechanical", label: "Mechanical" }, { key: "frame", label: "Frame" },
];
const STATUSES = ["Draft", "Review", "Approved", "In Progress", "Completed"];
const FOLDERS = ["New", "Waiting", "Finished", "Closed"];

// Customer community guidelines — members sign these to get in; owner can pause anyone.
const CUST_GUIDELINES = [
  "Be decent — no harassment, hate, or personal attacks.",
  "No spam, scams, or selling — swap posts are for members' own parts only.",
  "Advice here is neighbor-to-neighbor: verify anything safety-critical with a professional before relying on it.",
  "No posting anyone's personal info, photos of people without permission, or private pricing.",
  "Keep it legal — no stolen parts, odometer tricks, or inspection dodges. Ever.",
  "Breaking these can pause or remove access — the shop's call is final.",
];

// Academy — in-house training modules (premium feature; per-tech completion tracked).
const ACADEMY = [
  ["Safety first", "PPE every job. Jack stands always — never wheels-off on a jack alone. Battery disconnected before electrical work. No body parts under unsupported loads."],
  ["Customer-home conduct", "Drop cloths and clean hands at every home. No promises beyond the written estimate — pricing questions go to the owner. Leave it cleaner than you found it."],
  ["Estimating standard", "Photograph cause AND correction. Verify prices with the supplier before quoting. Check hours against the licensed guide. Approve drafted lines only when you'd stake your name on them."],
  ["Documentation", "Before, during, after — every job. Label photos in Media. The customer report is what turns a repair into a referral."],
  ["Messaging compliance", "Text only when the consent box is checked. Every message honors STOP the moment it arrives. Never argue by text — call."],
  ["Authorization & supplements", "Signature before wrenches turn. Found more damage? STOP — supplement approved in writing before continuing. Replaced parts saved for the customer."],
];

// Platform release notes — owner-only panel; product voice, no personal names.
// Business Shield — owner-only legal template library (starting points; attorney finalizes).
const SHIELD_DOCS = [
  ["Technician Conduct & Disclaimer Acknowledgment", "TECHNICIAN ACKNOWLEDGMENT\n\nI will: follow the written estimate — no extra work without documented customer approval; photograph cause and correction on every job; obtain the customer's signature before repairs begin; only text customers whose consent box is checked, honoring STOP immediately; keep replaced parts for customer return; report any injury, damage, or dispute to the owner the same day.\nI understand drafted estimate content requires my human review before it reaches a customer, and that pay, scheduling, and discipline are governed by shop policy, not this app.\n\nTechnician: __________________  Signature: __________________  Date: ________"],
  ["Shop Warranty Policy Statement", "LIMITED REPAIR WARRANTY\n\nThis shop warrants its repairs for 12 months or 12,000 miles, whichever comes first, covering the parts installed and the labor to install them. The warranty excludes: unrelated failures, customer-supplied parts (parts warranty only, per the supplier), damage from misuse, racing, commercial overload, or continued operation after a warning sign. Warranty service requires the original invoice; remedy is repair or replacement of the covered work. This statement supplements, and does not replace, rights under state law. Attorney finalizes before public posting."],
  ["Warranty / Insurance Claim Checklist", "CLAIM FILE CHECKLIST — attach to the job\n\n1. Customer authorization signed BEFORE teardown. 2. Warranty company / insurer name + contract or claim number on the estimate. 3. Cause-and-correction photos (before, during, after). 4. Administrator contacted BEFORE repairs for authorization number: ______  Rep: ______  Date/time: ______. 5. Approved amount and any customer-pay difference documented in writing. 6. Final invoice + photos + authorization number submitted together. 7. Payment terms noted (administrator pays in ___ days; customer signs responsibility for non-covered balance)."],
  ["Vehicle Release & Storage Notice", "VEHICLE RELEASE\n\nI accept return of my vehicle and acknowledge the work performed as invoiced. Personal property was removed or is my responsibility. Vehicles left more than ___ days after completed-work notice may accrue storage of $___/day as permitted by law, and unclaimed-vehicle remedies may apply. Balance due before release unless arranged in writing.\n\nCustomer: __________________  Signature: __________________  Date: ________"],
];

const RELEASE_NOTES = [
  ["3.7", "Owner menu · account vs shop settings · subscribed-shops view · roles & pay on the roster · community board + parts swap · messaging service with on-my-way and reminder texts · assistant upgrade · automated self-check workflow"],
  ["3.6", "Desktop and tablet layouts · on-screen assistant on every page · added legal notices"],
  ["3.5", "Per-shop feature switches · shop update log · consent gate on every outbound text"],
  ["3.0–3.4", "Schedule board redesign · one-time terms acceptance · login emails with temporary-code reset · document library in web and print formats"],
  ["2.x", "Photo estimating with line-by-line approval · invoicing & payment collection · signatures · bookings · parts catalog · media reports · guides · dispatch · customer portal"],
  ["1.x", "Core estimator · labor rates by area · printable customer documents"],
];

// Licensed labor-guide / wiring sources — launchers only. No guide content is
// ever copied into this app: that's what keeps it copyright-clean & sellable.
const GUIDE_SOURCES = [
  { key: "motor", name: "MOTOR (US/Canada labor times — data API available)", url: "https://www.motor.com" },
  { key: "prodemand", name: "Mitchell 1 ProDemand (US cars/light trucks + wiring)", url: "https://www.prodemand.com" },
  { key: "alldata", name: "ALLDATA (OEM procedures + wiring diagrams)", url: "https://www.alldata.com" },
  { key: "truckseries", name: "Mitchell 1 TruckSeries (Class 4-8 diesel labor + wiring)", url: "https://www.mitchell1.com" },
  { key: "haynespro", name: "HaynesPro (UK/EU coverage + wiring schematics)", url: "https://www.haynespro.com" },
  { key: "autodata", name: "Autodata (broad overseas coverage)", url: "https://www.autodata-group.com" },
];
const CONDITIONS = ["OEM", "Aftermarket", "Recycled"];

// Peaceful Motors service menu — flat items use your set price; hourly items
// price at the active area's labor rate. Edit freely to match your website menu.
const SERVICE_MENU = [
  { label: "Mobile Diagnostic Visit (incl. 1 hr — $40 credits toward repair)", flat: 100 },
  { label: "Level 2 Full Diagnosis ($40 credits toward repair)", flat: 150 },
  { label: "Front brake pads & rotors", hrs: 1.5, group: "mechanical" },
  { label: "Rear brake pads & rotors", hrs: 1.5, group: "mechanical" },
  { label: "A/C evac & recharge", hrs: 1.5, group: "mechanical" },
  { label: "A/C leak check & diagnosis", hrs: 1, group: "mechanical" },
  { label: "Oil change & inspection", hrs: 0.5, group: "mechanical" },
  { label: "Battery test & replacement", hrs: 0.5, group: "mechanical" },
  { label: "Starter replacement", hrs: 2, group: "mechanical" },
  { label: "Alternator replacement", hrs: 2, group: "mechanical" },
  { label: "Engine swap (same engine) — teardown confirm & deposit required", hrs: 16, group: "mechanical" },
];

const LOCAL = {
  car: [
    { name: "NAPA / O'Reilly / AutoZone", meta: "local counters — domestic & foreign" },
    { name: "OEM dealer / online OEM", meta: "exotic & OEM-specific parts" },
  ],
  diesel: [
    { name: "Degel Truck Center", meta: "Hazelwood · Hino/Isuzu, OEM + aftermarket" },
    { name: "Truck Parts & Sales Co.", meta: "St. Louis · since 1948, Mack & hard-to-find" },
    { name: "Rush Truck Centers", meta: "Pontoon Beach · online + local inventory check" },
  ],
  lawn: [
    { name: "Art's Lawn Mower Shop", meta: "Florissant 63033 · (314) 741-1055 · Deere/Kubota/Toro/Stihl/Echo/Briggs" },
    { name: "Eljay Lawn Products", meta: "St. Louis · (314) 727-1171 · mower & OPE parts" },
  ],
};

let ID = 1;
const newRow = (over = {}) => ({
  id: ID++, desc: "", part: "", opGroup: "mechanical",
  cost: "", markup: "40", price: "", manualPrice: false,
  condition: "Aftermarket", supplier: "", availability: "", priceDate: "",
  core: "", hrs: "", teardown: false,
  aiDraft: false, confidence: "", note: "", priceBusy: false, priceSrc: "",
});
const todayStr = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const estNumber = () => "PM-" + new Date().getFullYear() + "-" + String(Math.floor(1000 + Math.random() * 9000));

export default function PeacefulEstimate() {
  // ---------- Estimate meta / workflow ----------
  const [meta, setMeta] = useState({
    number: estNumber(), date: todayStr(), expiration: plusDays(30),
    estimator: "", status: "Draft",
    customer: { name: "", phone: "", email: "", address: "", notify: true },
    insurance: { company: "", claim: "", adjuster: "", deductible: "" },
  });
  const [showInsurance, setShowInsurance] = useState(false);

  // ---------- Vehicle / job ----------
  const [category, setCategory] = useState("domestic");
  const [vehicle, setVehicle] = useState({ ymm: "", id: "", use: "" });
  const [jobType, setJobType] = useState("both");

  // ---------- Area rates ----------
  const [areas, setAreas] = useState([{ label: "St. Louis County · 63033", rate: "" }]);
  const [activeArea, setActiveArea] = useState(0);
  const [showAreas, setShowAreas] = useState(false);
  const [showLocal, setShowLocal] = useState(false);

  // ---------- Photos / AI staging ----------
  const [photos, setPhotos] = useState([]);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState([]); // AI suggestions awaiting human approval
  const [err, setErr] = useState("");

  // ---------- Line items (only human-approved lines live here) ----------
  const [rows, setRows] = useState([]);
  const [sublet, setSublet] = useState("");
  const [supplies, setSupplies] = useState("");
  const [paintMat, setPaintMat] = useState("");
  const [taxRate, setTaxRate] = useState("");

  // ---------- Diagnosis ----------
  const [complaint, setComplaint] = useState("");
  const [recentWork, setRecentWork] = useState("");
  const [readings, setReadings] = useState({ low: "", high: "", vent: "", ambient: "" });
  const [dxBusy, setDxBusy] = useState(false);
  const [dxTips, setDxTips] = useState([]);

  // ---------- Customer photos ----------
  const [custPhotos, setCustPhotos] = useState([]);
  const custRef = useRef(null);

  // ---------- VIN decoder (free NHTSA vPIC database — no key needed) ----------
  const [vinBusy, setVinBusy] = useState(false);
  async function decodeVin() {
    const vin = vehicle.id.trim();
    if (vin.length < 11) { setErr("Enter the full 17-character VIN first."); return; }
    setVinBusy(true); setErr("");
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
      const data = await res.json();
      const r = (data.Results && data.Results[0]) || {};
      const ymm = [r.ModelYear, r.Make, r.Model, r.Trim].filter(Boolean).join(" ");
      if (ymm) setVehicle((v) => ({ ...v, ymm }));
      else setErr("VIN decoded but returned no vehicle details — double-check the VIN.");
    } catch (e) {
      setErr("VIN decoder unreachable — works on your deployed site; this preview sandbox may block outside services.");
    }
    setVinBusy(false);
  }

  // ---------- Quick-add from the service menu ----------
  function addFromMenu(i) {
    const m = SERVICE_MENU[Number(i)];
    if (!m) return;
    setRows((rs) => [...rs, mkRow(
      m.flat != null
        ? { desc: m.label, manualPrice: true, price: String(m.flat), hrs: "" }
        : { desc: m.label, hrs: String(m.hrs), opGroup: m.group || "mechanical" }
    )]);
  }

  // ---------- Customer view / approval ----------
  const [authName, setAuthName] = useState("");
  const [authDate, setAuthDate] = useState("");
  const [authorized, setAuthorized] = useState(false);

  // ---------- Tabs ----------
  const TABS = ["Details", "Bookings", "Photo Estimate", "Line Items", "Parts", "Fixes & Times", "Customer View", "Invoice", "Media", "Guides", "Community", "Academy", "Integrations", "Dashboard", "Admin", "Help"];
  const [tab, setTab] = useState("Details");

  // ---------- Dashboard ----------
  const [savedEstimates, setSavedEstimates] = useState([]);
  const [saveMsg, setSaveMsg] = useState("");

  // ---------- Tech login & roster (accountability layer — see Admin tab) ----------
  const [techs, setTechs] = useState([]);
  const [currentTech, setCurrentTech] = useState(null);
  const [loginSel, setLoginSel] = useState(0);
  const [loginPin, setLoginPin] = useState("");
  const [newTech, setNewTech] = useState({ name: "", pin: "" });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSel, setForgotSel] = useState(0);
  const [forgotMsg, setForgotMsg] = useState("");
  async function resetPinByEmail() {
    const t = techs[forgotSel];
    if (!t) return;
    if (!t.email) { setForgotMsg("No email saved for " + t.name + " — the owner can add one and reset your PIN on the Admin tab."); return; }
    setForgotMsg("Sending…");
    try {
      // The server generates the temporary PIN, emails it (same wording as
      // before), and returns only the scrypt hash — plaintext never lands
      // in the shared roster again.
      const r = await fetch("/api/pin/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: t.name }) });
      if (!r.ok) throw new Error("no reset route");
      const d = await r.json();
      if (d.pinHash) await saveTechs(techs.map((x, i) => i === forgotSel ? { ...x, pin: undefined, pinHash: d.pinHash } : x));
      setForgotMsg("Temporary PIN emailed to " + t.email + " — check the inbox (and spam). The old PIN no longer works.");
    } catch (e) {
      setForgotMsg("Email resets work on your deployed site (with the email key set). Until then: the owner resets PINs on the Admin tab — that's the customer-service path.");
    }
  }
  useEffect(() => { (async () => {
    const r = await store.get("techs:roster");
    if (r) { try { setTechs(JSON.parse(r.value)); } catch (e) {} }
    const t = await store.get("terms:accepted");
    if (t) setAgreeTerms(true); // accepted once — never asked again
  })(); }, []);
  async function saveTechs(list) { setTechs(list); await store.set("techs:roster", list); }
  // PIN edits live in local drafts until committed on blur — the roster
  // record stores only pinHash from /api/pin/set, never the PIN (Task 2).
  const [pinDrafts, setPinDrafts] = useState({});
  async function commitPinDraft(key, matches) {
    const draft = String(pinDrafts[key] || "").trim();
    if (!draft) return;
    setPinDrafts((p) => ({ ...p, [key]: "" }));
    if (draft.length < 4) { setErr("PIN needs at least 4 digits."); return; }
    // Preview/offline fallback keeps the old plaintext behavior; the first
    // online login upgrades it to a hash automatically.
    let up = { pin: draft, pinHash: undefined };
    try {
      const r = await fetch("/api/pin/set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: draft }) });
      if (r.ok) { const d = await r.json(); up = { pin: undefined, pinHash: d.pinHash }; }
    } catch (e) {}
    await saveTechs(techs.map((t, j) => (matches(t, j) ? { ...t, ...up } : t)));
  }
  async function tryLogin() {
    const t = techs[loginSel];
    const pin = loginPin.trim();
    let ok = false;
    if (t) {
      try {
        // Verification happens server-side against the shop's roster —
        // hashes never get compared (or shipped) in the browser (Task 2).
        const r = await fetch("/api/pin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: t.name, pin }) });
        if (r.status === 429) { setErr("Too many tries — wait a minute."); return; }
        if (!r.ok) throw new Error("no verify route");
        const d = await r.json();
        ok = !!d.ok;
        if (d.ok && d.pinHash) saveTechs(techs.map((x, i) => i === loginSel ? { ...x, pin: undefined, pinHash: d.pinHash } : x));
        if (d.noRoster && t.pin != null) ok = String(t.pin) === pin;
      } catch (e) {
        if (t.pin != null) ok = String(t.pin) === pin; // legacy local roster (preview/offline)
        else { setErr("Can't reach the server to check your PIN — check the connection and try again."); return; }
      }
    }
    if (ok) {
      setCurrentTech(t); setLoginPin(""); setErr("");
      setMeta((m) => ({ ...m, estimator: m.estimator || t.name }));
    } else setErr("Wrong PIN — try again.");
  }

  // ---------- Invoice ----------
  const [inv, setInv] = useState({ number: "", status: "due", serviceCall: "20", diagCredit: "0" });

  // ---------- Integrations: PartsTech & RepairLink credentials ----------
  const [integr, setIntegr] = useState({ ptAccount: "", ptKey: "", rlUser: "", rlKey: "" });
  const [integrMsg, setIntegrMsg] = useState("");
  useEffect(() => { (async () => {
    const r = await store.get("integrations:creds");
    if (r) { try { setIntegr(JSON.parse(r.value)); } catch (e) {} }
  })(); }, []);
  async function saveIntegrations() {
    await store.set("integrations:creds", integr);
    setIntegrMsg("Saved."); setTimeout(() => setIntegrMsg(""), 2000);
  }
  function openRepairLink(r) {
    const q = [vehicle.ymm, r.desc, r.part].filter(Boolean).join(" ");
    try { navigator.clipboard.writeText(q); } catch (e) {}
    window.open("https://repairlinkshop.com", "_blank");
    setErr(`Copied "${q}" — log into RepairLink and paste into search.`);
    setTimeout(() => setErr(""), 4500);
  }

  const isCar = ["domestic", "foreign", "exotic"].includes(category);
  const isLawn = category === "lawn";
  const localList = isCar ? LOCAL.car : LOCAL[category];
  const rateNum = parseFloat(areas[activeArea]?.rate) || 0;
  const num = (v) => parseFloat(v) || 0;
  const money = (n) => "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // price auto-calc: cost * (1 + markup%) unless manually overridden
  function priceFor(r) {
    if (r.manualPrice) return num(r.price);
    return num(r.cost) * (1 + num(r.markup) / 100);
  }

  const groupTotals = useMemo(() => {
    const t = {}; OP_GROUPS.forEach((g) => (t[g.key] = { parts: 0, labor: 0 }));
    rows.forEach((r) => {
      const g = t[r.opGroup] || t.mechanical;
      g.parts += priceFor(r);
      g.labor += num(r.hrs) * rateNum;
    });
    return t;
  }, [rows, rateNum]);

  const totals = useMemo(() => {
    const partsSub = rows.reduce((s, r) => s + priceFor(r), 0);
    const laborSub = rows.reduce((s, r) => s + num(r.hrs) * rateNum, 0);
    const sub = partsSub + laborSub + num(sublet) + num(supplies) + num(paintMat);
    const tax = (partsSub + num(supplies) + num(paintMat)) * (num(taxRate) / 100);
    return { partsSub, laborSub, sub, tax, grand: sub + tax };
  }, [rows, rateNum, sublet, supplies, taxRate, paintMat]);

  function readImages(files, cb) {
    Array.from(files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => cb({ name: file.name, dataUrl: ev.target.result, base64: ev.target.result.split(",")[1], mediaType: file.type });
      reader.readAsDataURL(file);
    });
  }
  function onFiles(e) { readImages(e.target.files, (img) => setPhotos((p) => [...p, img])); e.target.value = ""; }
  function onCustFiles(e) { readImages(e.target.files, (img) => setCustPhotos((p) => [...p, { ...img, caption: "", comment: "", kind: (img.mediaType || "").startsWith("video") ? "video" : "image" }])); e.target.value = ""; }

  async function callClaude(content, tools) {
    const body = { max_tokens: 1200, messages: [{ role: "user", content }] };
    if (tools) body.tools = tools;
    const res = await fetch(API_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`API route returned ${res.status} — check your /api/claude deployment and ANTHROPIC_API_KEY.`);
    const data = await res.json();
    return (data.content || []).map((i) => (i.type === "text" ? i.text : "")).join("\n");
  }

  function scopeText() {
    if (category === "diesel") return "heavy-duty / diesel mechanical work";
    if (category === "lawn") return "outdoor power equipment / small-engine work — no VIN";
    const jt = jobType === "both" ? "collision AND mechanical" : jobType === "collision" ? "collision / body" : "mechanical";
    return `${category} vehicle ${jt} work`;
  }

  async function analyze() {
    setErr("");
    if (photos.length === 0) { setErr("Add at least one photo first."); return; }
    setBusy(true);
    try {
      const content = photos.map((p) => ({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } }));
      content.push({ type: "text", text:
`You are an experienced estimator drafting a repair estimate from photos. Item: ${vehicle.ymm || category}. Scope: ${scopeText()}.
Complaint: ${complaint || "(none)"}.
Separate what you can SEE clearly from what needs teardown/further inspection to confirm.
Return ONLY a JSON array (no prose/fences) of up to 10 items, each exactly:
{"operation":"<short op>","opGroup":"body|paint|mechanical|frame","laborHours":<number>,"part":true|false,"partName":"<generic name or empty>","confidence":"low|med|high","needsTeardown":true|false,"note":"<short or empty>"}
Rules: NEVER invent part numbers or prices. Conservative hours. If nothing clear, return []. Output ONLY the JSON array.` });
      const text = await callClaude(content);
      const parsed = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
      if (!Array.isArray(parsed) || !parsed.length) { setErr("No clear work found — add closer shots or enter lines by hand."); setBusy(false); return; }
      setStaged((prev) => [...prev, ...parsed.map((it) => ({
        sid: ID++, operation: it.operation, opGroup: it.opGroup || "mechanical",
        laborHours: it.laborHours ?? "", part: it.part, partName: it.partName || "",
        confidence: it.confidence || "low", needsTeardown: !!it.needsTeardown, note: it.note || "",
      }))]);
    } catch (e) { setErr(e.message || "Couldn't read a clean draft back."); }
    setBusy(false);
  }

  function approveStaged(sid) {
    const it = staged.find((s) => s.sid === sid);
    if (!it) return;
    setRows((rs) => [...rs, mkRow({
      desc: it.partName ? `${it.operation} — ${it.partName}` : it.operation,
      opGroup: it.opGroup, hrs: it.laborHours, aiDraft: true,
      confidence: it.confidence, teardown: it.needsTeardown,
      note: it.note,
    })]);
    setStaged((s) => s.filter((x) => x.sid !== sid));
  }
  function approveAllStaged() { staged.forEach((s) => approveStaged(s.sid)); }
  function rejectStaged(sid) { setStaged((s) => s.filter((x) => x.sid !== sid)); }

  async function getDiagnostics() {
    setErr(""); setDxBusy(true);
    try {
      const content = photos.map((p) => ({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } }));
      const kind = category === "lawn" ? "small-engine" : category === "diesel" ? "diesel" : "automotive";
      content.push({ type: "text", text:
`You are a master ${kind} diagnostic tech. Item: ${vehicle.ymm || category}. Complaint: ${complaint || "(none)"}. Recent work: ${recentWork || "(none)"}.
Readings: low ${readings.low || "-"} psi, high ${readings.high || "-"} psi, vent ${readings.vent || "-"}°F, ambient ${readings.ambient || "-"}°F.
Return ONLY a JSON array (max 7) of {"check":"<do/verify this>","why":"<short reason>","priority":"high|med|low"}. No prose.` });
      const text = await callClaude(content);
      const j = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
      setDxTips(Array.isArray(j) ? j : []);
      if (!Array.isArray(j) || !j.length) setErr("No clear diagnostic read — add a photo or fill in the complaint.");
    } catch (e) { setErr(e.message || "Couldn't generate diagnostic tips."); }
    setDxBusy(false);
  }

  async function lookupPrice(id) {
    const row = rows.find((r) => r.id === id);
    if (!row || !row.desc) { setErr("Add a description on that line first."); return; }
    setRow(id, "priceBusy", true); setErr("");
    const sources = category === "diesel" ? "diesel / heavy-duty truck parts suppliers"
      : category === "lawn" ? "small-engine / OPE parts" : "OEM and aftermarket auto parts suppliers";
    try {
      const text = await callClaude(
        [{ type: "text", text:
`Find a ballpark current US retail COST (what a shop pays, not retail markup) for this part, favoring ${sources}, near St. Louis, MO. Item: ${vehicle.ymm || category}. Part/operation: "${row.desc}".
Return ONLY JSON: {"price": <number or null>, "source": "<site/store>", "confidence": "low|med|high"}. No prose.` }],
        [{ type: "web_search_20250305", name: "web_search", user_location: { type: "approximate", city: "St. Louis", region: "Missouri", country: "US" } }]
      );
      const j = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
      setRows((rs) => rs.map((r) => r.id === id ? {
        ...r, cost: j.price != null ? String(j.price) : r.cost, manualPrice: false,
        priceDate: todayStr(), supplier: r.supplier || (j.source || ""),
        priceSrc: `ballpark cost · ${j.source || "web"} · ${j.confidence || "low"} confidence — confirm before quoting`,
        priceBusy: false,
      } : r));
    } catch (e) {
      setRows((rs) => rs.map((r) => r.id === id ? { ...r, priceBusy: false } : r));
      setErr("Couldn't pull a ballpark price — check your counter or supplier account.");
    }
  }

  const setRow = (id, k, v) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  const delRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));

  function customerText() {
    const lines = rows.filter((r) => r.desc).map((r) => {
      const p = priceFor(r), labor = num(r.hrs) * rateNum;
      return `${r.desc}${r.teardown ? " [needs teardown to confirm]" : ""}\n   ${r.condition} · Part# ${r.part || "-"} | Parts ${money(p)} | ${num(r.hrs)} hr @ ${money(rateNum)} = ${money(labor)} | Line ${money(p + labor)}`;
    });
    const dx = dxTips.length ? `\nDiagnostic findings:\n` + dxTips.map((t) => `   - ${t.check}`).join("\n") + "\n" : "";
    return `${BRAND.name} — REPAIR ESTIMATE #${meta.number}
${BRAND.tagline}
${BRAND.phone} | ${BRAND.email} | ${BRAND.site}
${meta.warrCo ? "WARRANTY JOB — " + meta.warrCo + (meta.warrNum ? " #" + meta.warrNum : "") + " — authorization required before repairs\n" : ""}Status: ${meta.status}   Estimator: ${meta.estimator || "-"}   Date: ${meta.date}   Expires: ${meta.expiration}

Customer: ${meta.customer.name || "-"}   Phone: ${meta.customer.phone || "-"}
${meta.insurance.company ? `Insurance: ${meta.insurance.company}   Claim#: ${meta.insurance.claim || "-"}\n` : ""}
Category: ${CATEGORIES.find((c) => c.key === category)?.label}
Item: ${vehicle.ymm || "-"}   ${isLawn ? "Serial" : "VIN"}: ${vehicle.id || "-"}   ${isLawn ? "Hours" : "Miles"}: ${vehicle.use || "-"}
Area: ${areas[activeArea]?.label || "-"}   Labor rate: ${money(rateNum)}/hr
${complaint ? `Complaint: ${complaint}\n` : ""}${dx}
${lines.join("\n")}

Parts subtotal: ${money(totals.partsSub)}
Labor subtotal: ${money(totals.laborSub)}
Sublet: ${money(num(sublet))}   Shop supplies: ${money(num(supplies))}${num(paintMat) > 0 ? "   Paint materials: " + money(num(paintMat)) : ""}
Tax: ${money(totals.tax)}
GRAND TOTAL: ${money(totals.grand)}

Photos on file: ${custPhotos.length}
${authorized ? `Authorized by: ${authName} on ${authDate}\n` : ""}
${(settings.stripeLink || "").startsWith("http") && inv.status === "due" ? "Pay online: " + settings.stripeLink + "\n" : ""}Estimate only. Hidden/additional damage found at teardown may require a supplement.
Warranty: 12 months / 12,000 miles, parts & labor.`;
  }

  function copyText() { navigator.clipboard.writeText(customerText()); setErr("Copied estimate to clipboard."); setTimeout(() => setErr(""), 2500); }
  function printView() { setTab("Customer View"); setTimeout(() => window.print(), 200); }

  function downloadCSV() {
    const head = ["Description", "Group", "Condition", "Part #", "Cost", "Markup %", "Customer Price", "Labor Hrs", "Labor $", "Line Total", "Supplier", "Price Date"];
    const bodyRows = rows.filter((r) => r.desc).map((r) => {
      const p = priceFor(r), labor = num(r.hrs) * rateNum;
      return [r.desc, r.opGroup, r.condition, r.part, num(r.cost).toFixed(2), r.markup, p.toFixed(2), num(r.hrs), labor.toFixed(2), (p + labor).toFixed(2), r.supplier, r.priceDate];
    });
    const csv = [head, ...bodyRows, [], ["", "", "", "", "", "", "", "", "", "Grand Total", totals.grand.toFixed(2)]]
      .map((r) => r.map((c) => `"${String(c ?? "")}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${meta.number}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // ---------- Shop settings (Admin → permanent defaults) ----------
  // Task 3: fresh shops start with only the tabs a job needs — Details,
  // Photo Estimate, Line Items, Media, Customer View, Invoice (+ Admin,
  // Help). Everything else is one checkbox away in Admin → FEATURE
  // SWITCHES. A shop with saved settings keeps exactly what it had.
  const [settings, setSettings] = useState({ requireSig: false, defaultMarkup: "40", defaultRate: "150", defaultEmail: "", stripeLink: "", altPayName: "", altPayLink: "", reviewLink: "https://g.page/r/CatNfmPVETgsEAE/review", locationOn: false, guidesOn: false, guideSubs: {}, zipMarkups: [], smsFrom: "", msgMaster: true, assistantPro: true, features: { bookings: false, parts: false, ai: true, media: true, portal: true, community: false, academy: false, shield: false, fixes: false, custCommunity: true, integrations: false, dashboard: false } });
  // Per-shop feature switches: each shop's deployment shows only what its owner turns on.
  // (With cloud accounts, the master admin flips these per subscriber shop from one screen.)
  const feat = settings.features || {};
  const tabEnabled = (t) =>
    t === "Bookings" ? feat.bookings !== false :
    t === "Parts" ? feat.parts !== false :
    t === "Photo Estimate" ? feat.ai !== false :
    t === "Media" ? feat.media !== false :
    t === "Guides" ? !!settings.guidesOn :
    t === "Community" ? feat.community !== false :
    t === "Academy" ? feat.academy === true :
    t === "Fixes & Times" ? feat.fixes !== false :
    t === "Integrations" ? feat.integrations !== false :
    t === "Dashboard" ? feat.dashboard !== false : true;
  useEffect(() => { if (!tabEnabled(tab)) setTab("Details"); }, [settings, tab]);
  const [setMsg, setSetMsg] = useState("");
  useEffect(() => { (async () => {
    const r = await store.get("settings:shop");
    if (r) { try {
      const d = JSON.parse(r.value);
      setSettings((s) => ({ ...s, ...d }));
      if (d.defaultRate) setAreas((a) => a.map((x) => x.rate ? x : { ...x, rate: d.defaultRate }));
    } catch (e) {} }
  })(); }, []);
  async function saveSettings() { await store.set("settings:shop", settings); setSetMsg("Saved."); setTimeout(() => setSetMsg(""), 2000); }
  const mkRow = (over = {}) => {
    const areaLabel = (areas[activeArea] && areas[activeArea].label) || "";
    const zm = (settings.zipMarkups || []).find((z) => z.zip && areaLabel.includes(z.zip));
    return newRow({ markup: (zm && zm.markup) || settings.defaultMarkup || "40", ...over });
  };

  // ---------- Signature pad (optional pre-repair approval) ----------
  const sigRef = useRef(null);
  const sigDrawing = useRef(false);
  const [sigData, setSigData] = useState("");
  const [sigTyped, setSigTyped] = useState(false);
  function sigPos(e) {
    const c = sigRef.current, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function sigStart(e) { e.preventDefault(); if (!sigRef.current) return; sigDrawing.current = true; const ctx = sigRef.current.getContext("2d"); const p = sigPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function sigMove(e) { if (!sigDrawing.current || !sigRef.current) return; e.preventDefault(); const ctx = sigRef.current.getContext("2d"); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a1a"; const p = sigPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function sigEnd() { if (!sigDrawing.current) return; sigDrawing.current = false; try { setSigData(sigRef.current.toDataURL()); } catch (e) {} }
  function sigClear() { const c = sigRef.current; if (!c) return; c.getContext("2d").clearRect(0, 0, c.width, c.height); setSigData(""); }

  // ---------- Send invoice by email + shareable link ----------
  const [askEmail, setAskEmail] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [dashFilter, setDashFilter] = useState("All");
  const [showAdj, setShowAdj] = useState(false);
  function sendInvoiceEmail() {
    const to = (meta.customer.email || settings.defaultEmail || "").trim();
    if (!to) { setAskEmail(true); return; }
    const subject = `Peaceful Motors Invoice ${inv.number || meta.number} — ${vehicle.ymm || "vehicle"}`;
    const bodyText = customerText();
    fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, text: bodyText }) })
      .then((r) => { if (!r.ok) throw new Error(); setErr("Invoice emailed to " + to); setTimeout(() => setErr(""), 3000); })
      .catch(() => { window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText.slice(0, 1800))}`; });
  }
  // ---------- VIN barcode scanner (door jamb / title / windshield) ----------
  const [scanOpen, setScanOpen] = useState(false);
  const scanVideo = useRef(null);
  const scanStream = useRef(null);
  const scanTimer = useRef(null);
  function stopScan() {
    if (scanTimer.current) clearInterval(scanTimer.current);
    if (scanStream.current) scanStream.current.getTracks().forEach((t) => t.stop());
    scanTimer.current = null; scanStream.current = null; setScanOpen(false);
  }
  async function startScan() {
    if (!("BarcodeDetector" in window)) { setErr("Barcode scanning isn't supported in this browser (works best in Chrome on Android) — type the VIN and tap VIN→."); return; }
    setScanOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      scanStream.current = stream;
      setTimeout(() => { if (scanVideo.current) { scanVideo.current.srcObject = stream; scanVideo.current.play(); } }, 50);
      const det = new window.BarcodeDetector({ formats: ["code_39", "code_128", "pdf417", "qr_code", "data_matrix"] });
      scanTimer.current = setInterval(async () => {
        try {
          if (!scanVideo.current) return;
          const codes = await det.detect(scanVideo.current);
          for (const c of codes) {
            const v = (c.rawValue || "").replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
            if (v.length >= 17) {
              setVehicle((x) => ({ ...x, id: v.slice(-17) }));
              stopScan(); setErr("VIN captured from barcode — tap VIN→ to decode."); setTimeout(() => setErr(""), 3500);
              return;
            }
          }
        } catch (e) {}
      }, 400);
    } catch (e) { stopScan(); setErr("Couldn't open the camera — check permissions, or type the VIN."); }
  }

  // ---------- Customer history ----------
  const [history, setHistory] = useState(null);
  async function lookupHistory() {
    const nm = (meta.customer.name || "").trim().toLowerCase();
    const ph = (meta.customer.phone || "").replace(/\D/g, "");
    if (!nm && !ph) { setErr("Enter a customer name or phone first, then look up."); return; }
    const listing = await store.list("estimates:");
    const out = [];
    if (listing && listing.keys) {
      for (const k of listing.keys) {
        const r = await store.get(k);
        if (!r) continue;
        try {
          const e = JSON.parse(r.value);
          const en = (e.meta && e.meta.customer && e.meta.customer.name || "").toLowerCase();
          const ep = (e.meta && e.meta.customer && e.meta.customer.phone || "").replace(/\D/g, "");
          if ((nm && en && en.includes(nm)) || (ph && ep && ep === ph)) out.push(e);
        } catch (x) {}
      }
    }
    out.sort((a2, b2) => (b2.savedAt || "").localeCompare(a2.savedAt || ""));
    setHistory(out);
  }

  // ---------- Customer portal state ----------
  const [custPortal, setCustPortal] = useState(false);
  const [portalQ, setPortalQ] = useState("");
  const [portalRes, setPortalRes] = useState(null);
  const [faq, setFaq] = useState("");
  async function portalLookup() {
    const q = portalQ.trim().toLowerCase();
    const qd = q.replace(/\D/g, "");
    if (!q) return;
    const listing = await store.list("estimates:");
    const out = [];
    if (listing && listing.keys) {
      for (const k of listing.keys) {
        const r = await store.get(k);
        if (!r) continue;
        try {
          const e = JSON.parse(r.value);
          const ph = ((e.meta && e.meta.customer && e.meta.customer.phone) || "").replace(/\D/g, "");
          const num = ((e.meta && e.meta.number) || "").toLowerCase();
          if ((qd.length >= 7 && ph && ph.endsWith(qd.slice(-7))) || (num && num === q)) out.push(e);
        } catch (x) {}
      }
    }
    setPortalRes(out);
  }

  // ---------- Portal self-booking (replaces Setmore) ----------
  const [portalBk, setPortalBk] = useState({ name: "", phone: "", vehicle: "", date: "", issue: "", email: "", pref: "text" });
  const [pvSent, setPvSent] = useState(""); const [pvCode, setPvCode] = useState(""); const [pvOK, setPvOK] = useState(false);
  const [pHp, setPHp] = useState(""); const [pHuman, setPHuman] = useState("");
  const [pPhotos, setPPhotos] = useState([]);
  const [pBall, setPBall] = useState(null);
  function addPortalPhotos(e) {
    const files = Array.from(e.target.files || []).slice(0, 3 - pPhotos.length);
    files.forEach((f) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const s2 = Math.min(1, 900 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * s2); c.height = Math.round(img.height * s2);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const d = c.toDataURL("image/jpeg", 0.7);
        setPPhotos((l) => (l.length >= 3 ? l : [...l, d]));
      };
      img.src = URL.createObjectURL(f);
    });
    e.target.value = "";
  }
  function portalBallpark() {
    if (!portalBk.issue.trim()) { setPortalBkMsg("Tell us what it's doing first."); setTimeout(() => setPortalBkMsg(""), 3000); return; }
    setPBall(offlineDiag((portalBk.vehicle || "") + " " + portalBk.issue));
  }
  async function sendVerify() {
    if (!portalBk.phone) { setPortalBkMsg("Enter your phone first."); return; }
    setPvOK(false);
    try {
      // The code is generated and stored on the server. It is never sent
      // to this browser — that is the whole point of the change.
      const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", phone: portalBk.phone }) });
      const d = await r.json();
      if (!r.ok || !d.sent) throw new Error(d.error || "route");
      setPvSent("sent");
      setPortalBkMsg("Code texted — enter it below.");
    } catch (e) { setPortalBkMsg("Code texting runs on the live site — you can book without verifying for now."); }
    setTimeout(() => setPortalBkMsg(""), 5000);
  }
  async function checkVerify() {
    try {
      const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", phone: portalBk.phone, code: pvCode }) });
      const d = await r.json();
      if (d.verified) { setPvOK(true); setPortalBkMsg("Phone verified ✓"); }
      else { setPortalBkMsg(d.error || "That code does not match — try again."); }
    } catch (e) { setPortalBkMsg("That code does not match — try again."); }
    setTimeout(() => setPortalBkMsg(""), 4000);
  }
  const [portalBkMsg, setPortalBkMsg] = useState("");
  const [portalTermsOpen, setPortalTermsOpen] = useState(false);
  async function portalBook() {
    if (pHp) { setPortalBkMsg("Request received! We'll text you shortly to confirm your window."); return; }
    if (!portalBk.name || !portalBk.phone) { setPortalBkMsg("Name and phone please — that's how we confirm your time."); return; }
    if (pHuman.trim() !== "7") { setPortalBkMsg("Quick human check: what is 3 + 4? Enter the number to send your request."); return; }
    await store.set("bookings:" + (portalBk.date || todayStr()) + "-" + Date.now(),
      { name: portalBk.name, phone: portalBk.phone, vehicle: portalBk.vehicle, date: portalBk.date || todayStr(), time: "", tech: "", notes: portalBk.issue, email: portalBk.email, pref: portalBk.pref, verified: pvOK, photos: pPhotos, ball: pBall || undefined, status: "Requested", source: "portal" });
    try {
      const ack = "Thanks " + portalBk.name + " — request received at " + BRAND.name + ". " + (pBall ? "First look: " + pBall.causes.join(", ") + " — ballpark " + money(pBall.lo) + "-" + money(pBall.hi) + " parts + labor. " : "") + "We'll confirm your window shortly. This automated first look is not a quote or a diagnosis; your written estimate follows inspection. Reply STOP to opt out.";
      if (portalBk.pref === "email" && portalBk.email) { fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: portalBk.email, subject: BRAND.name + " — request received", text: ack }) }).catch(() => {}); }
      else { fetch("/api/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: portalBk.phone, body: ack }) }).catch(() => {}); }
    } catch (e) {}
    setPortalBk({ name: "", phone: "", vehicle: "", date: "", issue: "", email: "", pref: "text" });
    setPvSent(""); setPvCode(""); setPvOK(false); setPHuman(""); setPPhotos([]); setPBall(null);
    setPortalBkMsg("Request received! We'll text you shortly to confirm your window.");
    setTimeout(() => setPortalBkMsg(""), 6000);
  }

  // ---------- Customer status update (respects their consent toggle) ----------
  const [acode, setAcode] = useState("314");
  const [acqBusy, setAcqBusy] = useState(false);
  async function getShopNumber() {
    setAcqBusy(true);
    try {
      const r = await fetch("/api/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ areaCode: acode }) });
      const d = await r.json();
      if (r.ok && d.number) { setSettings({ ...settings, smsFrom: d.number }); setErr("Your shop number: " + d.number + " — hit Save settings to keep it."); }
      else { setErr(d.error || "Number service not configured yet — works on the deployed site with Twilio keys."); }
    } catch (e) { setErr("Number service not reachable here — on the deployed site with Twilio keys this button buys your shop number."); }
    setAcqBusy(false); setTimeout(() => setErr(""), 6000);
  }

  async function sendTextSmart(to, body) {
    if (settings.msgMaster === false) { setErr("Shop-wide messaging is switched off in Admin."); return false; }
    try {
      const r = await fetch("/api/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, body, from: settings.smsFrom || undefined }) });
      if (r.ok) { setErr("Text sent ✓"); setTimeout(() => setErr(""), 2500); return true; }
      throw new Error("no sms route");
    } catch (e) {
      window.location.href = "sms:" + (to || "") + "?&body=" + encodeURIComponent(body);
      return false;
    }
  }
  function bookingText(bk, kind) {
    const body = kind === "otw"
      ? `${BRAND.name}: ${bk.tech || "Your technician"} is on the way now for your ${bk.vehicle || "service"}. Questions? ${BRAND.phone}. Reply STOP to opt out.`
      : `${BRAND.name} reminder: your service is scheduled ${bk.date}${bk.time ? " at " + bk.time : ""}. Reply C to confirm or call ${BRAND.phone} to change. Reply STOP to opt out.`;
    sendTextSmart(bk.phone || "", body);
  }

  async function sendUpdate() {
    if (meta.customer.notify === false) { setErr("This customer opted out of updates — flip the toggle only if they've re-consented."); return; }
    // Put the customer (and their current consent state) on file BEFORE the
    // send, so the /api/sms consent gate has a row to check (Task 4).
    try { await upsertCustomerRecord(meta.customer); } catch (e) {}
    const msg = `Update from ${BRAND.name} on your ${vehicle.ymm || "vehicle"} (${meta.number}): status ${meta.status}. Total ${money(totals.grand)}. Questions? ${BRAND.phone}. Reply STOP to opt out.`;
    sendTextSmart(meta.customer.phone || "", msg);
  }

  // ---------- Tech location sharing (strictly opt-in, work-hours, revocable) ----------
  const [sharingLoc, setSharingLoc] = useState(false);
  const locWatch = useRef(null);
  const [locList, setLocList] = useState([]);
  const [locConsentOpen, setLocConsentOpen] = useState(false);
  function startLoc() {
    if (!currentTech) return;
    if (!navigator.geolocation) { setErr("Location isn't available in this browser."); return; }
    setLocConsentOpen(true); // approval happens on the in-app consent page
  }
  function approveLocShare() {
    setLocConsentOpen(false);
    store.set("consent:loc:" + currentTech.name, { tech: currentTech.name, approvedAt: new Date().toISOString() }); // consent on record
    setSharingLoc(true);
    locWatch.current = navigator.geolocation.watchPosition((p) => {
      store.set("locations:" + currentTech.name, { tech: currentTech.name, lat: p.coords.latitude, lng: p.coords.longitude, ts: new Date().toISOString() });
    }, () => { setErr("Couldn't get GPS — check location permissions."); setSharingLoc(false); }, { enableHighAccuracy: true, maximumAge: 15000 });
  }
  function stopLoc() { if (locWatch.current != null && navigator.geolocation) navigator.geolocation.clearWatch(locWatch.current); locWatch.current = null; setSharingLoc(false); }
  async function refreshLocs() {
    const listing = await store.list("locations:");
    const out = [];
    if (listing && listing.keys) for (const k of listing.keys) { const r = await store.get(k); if (r) { try { out.push(JSON.parse(r.value)); } catch (e) {} } }
    out.sort((x, y) => (y.ts || "").localeCompare(x.ts || ""));
    setLocList(out);
  }

  // ---------- Bookings (your own Setmore-style board) ----------
  const [bookings, setBookings] = useState([]);
  const [bkForm, setBkForm] = useState({ name: "", phone: "", vehicle: "", date: todayStr(), time: "", tech: "", notes: "", status: "Scheduled" });
  useEffect(() => { if (tab === "Bookings") loadBookings(); }, [tab]);
  async function loadBookings() {
    const listing = await store.list("bookings:");
    const out = [];
    if (listing && listing.keys) for (const k of listing.keys) { const r = await store.get(k); if (r) { try { out.push({ key: k, ...JSON.parse(r.value) }); } catch (e) {} } }
    out.sort((x, y) => ((x.date || "") + (x.time || "")).localeCompare((y.date || "") + (y.time || "")));
    setBookings(out);
  }
  async function saveBooking() {
    if (!bkForm.name && !bkForm.vehicle) { setErr("A booking needs at least a name or a vehicle."); return; }
    await store.set("bookings:" + (bkForm.date || todayStr()) + "-" + Date.now(), bkForm);
    setBkForm({ name: "", phone: "", vehicle: "", date: todayStr(), time: "", tech: "", notes: "", status: "Scheduled" });
    loadBookings();
  }
  async function setBookingStatus(k, status) {
    const bk = bookings.find((x) => x.key === k); if (!bk) return;
    const { key, ...rest } = bk;
    await store.set(k, { ...rest, status });
    loadBookings();
  }
  function bookingToEstimate(bk) {
    setMeta((m) => ({ ...m, customer: { ...m.customer, name: bk.name || "", phone: bk.phone || "" } }));
    setVehicle((v) => ({ ...v, ymm: bk.vehicle || v.ymm }));
    setTab("Details");
  }

  // ---------- Custom parts catalog (parts money for your parts guy) ----------
  const [myParts, setMyParts] = useState([]);
  const [ptForm, setPtForm] = useState({ desc: "", part: "", source: "", cost: "", price: "" });
  useEffect(() => { if (tab === "Parts") (async () => {
    const r = await store.get("catalog:parts");
    if (r) { try { setMyParts(JSON.parse(r.value)); } catch (e) {} }
  })(); }, [tab]);
  async function addMyPart() {
    if (!ptForm.desc) { setErr("Give the part a description first."); return; }
    const list = [...myParts, ptForm];
    setMyParts(list); await store.set("catalog:parts", list);
    setPtForm({ desc: "", part: "", source: "", cost: "", price: "" });
  }
  async function delMyPart(i) { const list = myParts.filter((_, j) => j !== i); setMyParts(list); await store.set("catalog:parts", list); }
  function partToEstimate(p) {
    setRows((rs) => [...rs, mkRow({ desc: p.desc, part: p.part, supplier: p.source, cost: p.cost, manualPrice: !!p.price, price: p.price || "" })]);
    setErr("Added to Line Items."); setTimeout(() => setErr(""), 2000);
  }

  // ---------- Customer shares THEIR location (one-time, consent by tap) ----------
  function shareMyLocation() {
    if (!navigator.geolocation) { setErr("Location isn't available in this browser."); return; }
    if (!window.confirm("Approve a one-time share of your vehicle's location?\n\nIt's sent only inside the text YOU send us — we never track you.")) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const good = "https://www.google.com/maps?q=" + p.coords.latitude + "," + p.coords.longitude;
      window.location.href = "sms:" + BRAND.phone.replace(/[^0-9+]/g, "") + "?&body=" + encodeURIComponent("Here's my vehicle's location for service: " + good);
    }, () => setErr("Couldn't get your location — check permissions, or text us your address."));
  }

  // ---------- Shop update log: revisions/changes/corrections, in the shop's own words ----------
  const [logType, setLogType] = useState("Revision");
  const [logText, setLogText] = useState("");
  const [shopLog, setShopLog] = useState([]);
  useEffect(() => { if (tab === "Help") (async () => {
    const r = await store.get("shoplog:entries");
    if (r) { try { setShopLog(JSON.parse(r.value)); } catch (e) {} }
  })(); }, [tab]);
  async function addLogEntry() {
    if (!logText.trim()) return;
    const list = [{ type: logType, text: logText.trim(), ts: new Date().toISOString().slice(0, 10), by: currentTech ? currentTech.name : "" }, ...shopLog];
    setShopLog(list); await store.set("shoplog:entries", list); setLogText("");
  }

  // ---------- Floating shop assistant: on every staff screen ----------
  const [botOpen, setBotOpen] = useState(false);
  const [errLog, setErrLog] = useState([]);
  useEffect(() => {
    const h = (msg, src, line) => { setErrLog((l) => [String(msg) + (line ? " @" + line : ""), ...l].slice(0, 5)); return false; };
    const hr = (e) => { setErrLog((l) => [("promise: " + String(e && e.reason ? e.reason : "")).slice(0, 140), ...l].slice(0, 5)); };
    window.onerror = h; window.addEventListener("unhandledrejection", hr);
    return () => { window.onerror = null; window.removeEventListener("unhandledrejection", hr); };
  }, []);
  async function reportProblem() {
    const ownerEmail = ((techs.find((t) => t.admin) || {}).email) || BRAND.email;
    const body = "Problem report — " + BRAND.name + "\nBy: " + (currentTech ? currentTech.name : "?") + "\nWhen: " + new Date().toLocaleString() + "\nNote: " + (botQ || "(none)") + "\nRecent errors:\n" + (errLog.join("\n") || "(none logged)");
    try {
      const r = await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: ownerEmail, subject: "Peaceful OS problem report — " + BRAND.name, html: "<pre>" + body.replace(/</g, "&lt;") + "</pre>" }) });
      if (!r.ok) throw new Error("route");
      setBotA("Report sent to the owner's email ✓ — errors included automatically.");
    } catch (e) {
      window.location.href = "mailto:" + ownerEmail + "?subject=" + encodeURIComponent("Peaceful OS problem report") + "&body=" + encodeURIComponent(body);
    }
  }
  const [botMode, setBotMode] = useState("mech");
  const [botQ, setBotQ] = useState("");
  const [botA, setBotA] = useState("");
  const [botBusy, setBotBusy] = useState(false);
  const BOT_FAQ = [
    ["vin", "Type the VIN and tap VIN→ to decode, or tap the camera button to scan the door-jamb barcode (best in Chrome on Android)."],
    ["sign", "Customer View → Authorize & sign. Finger-drawn, typed fallback one tap. Admin can require it before work starts."],
    ["invoice", "Invoice auto-fills from approved lines. Send by email, Collect payment, mark PAID, then Request a review."],
    ["book", "Bookings tab. Online requests arrive as amber NEW REQUEST cards — tap ✓ Confirm. Walk-ins go in the form at the top."],
    ["price", "Line Items: cost + markup computes the customer price. ZIP rules and your default markup apply automatically."],
    ["photo", "Photo Estimate: shoot it, Analyze, then approve only the lines you agree with — nothing hits the quote until you do."],
    ["pin", "Forgot PIN? Link on the login screen emails a temporary PIN (deployed site), or the owner resets it on Admin."],
    ["backup", "Dashboard → Backup everything. Before changes and monthly into your Legal folder."],
    ["location", "Location sharing is opt-in on the bar under the tabs, work hours only, one tap to stop."],
    ["text", "Only text customers whose consent box is checked — that toggle is your legal consent record."],
  ];
  const LEGAL_FAQ = [
    ["text", "Text customers only when their consent box is checked; every message honors STOP the moment it arrives; the Admin master switch can silence the shop but can never override a customer opt-out."],
    ["consent", "Consent lives on the record: customer text opt-in is the checkbox on the estimate; tech GPS requires the recorded in-app approval; portal bookings capture messaging consent in the form."],
    ["sign", "Signature before wrenches turn — the finger-drawn authorization on Customer View. Extra work found mid-job stops until the supplement is approved in writing."],
    ["warranty", "The written 12-month/12,000-mile warranty statement lives in Business Shield (Admin) — post it, hand it out, and let the invoice reference it."],
    ["location", "Tech location is opt-in with a recorded approval, work hours only, one tap to stop, short retention. Customer location is one-time and customer-initiated only."],
    ["disclosure", "Every estimate and invoice carries the authorization, replaced-parts, and supplement disclosure lines for MO/IL-style compliance — your attorney confirms the final wording."],
    ["claim", "Warranty/insurance jobs: authorization number BEFORE repairs, cause-and-correction photos, the claim checklist in Business Shield, and the customer signs for any non-covered balance."],
    ["data", "The shop owns its data — export everything any day from Dashboard. Card numbers never touch this system; payments run through the processors' secure pages."],
    ["contract", "Signed estimates + invoices are your written record. The subscriber terms, ToS, and privacy policy drafts exist — an attorney pass makes them final before public use."],
    ["fine", "The fine-avoidance rules: no text without the checked box, honor STOP same-day, signature before work, keep the signed papers in the Legal folder. The app gates the first two automatically."],
  ];
  async function askBot() {
    const q = botQ.trim().toLowerCase();
    if (!q) return;
    const hit = (botMode === "legal" ? LEGAL_FAQ : BOT_FAQ).find(([k]) => q.includes(k));
    if (hit) { setBotA(hit[1]); return; }
    setBotBusy(true); setBotA("");
    try {
      const r = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: (botMode === "legal"
          ? "You are the in-app compliance helper for an auto-repair shop platform. Explain, in 2-4 plain sentences with no markdown, how this platform practices handle the question (consent-gated texting with STOP, signature-before-work authorization, recorded GPS consent, written 12/12 warranty statement, MO/IL disclosure lines on documents, data export, processor-hosted payments). Always end with: this is general information, not legal advice — the shop attorney decides. Question: "
          : (settings.assistantPro !== false
          ? "You are Master Elite — the platform's highest assistant tier, counsel worthy of master technicians and multi-bay owners. Answer with master-level depth across drivability, electrical, diesel, estimating, warranty documentation, and service-writing: correct terminology, diagnostic strategy (verify the complaint, gather data, isolate the system, test before replacing parts), estimate and labor best practice, and honest customer-communication advice. Automotive Service Excellence standards inform your answers, but you are software guidance — not a certified technician, and never a substitute for verified specs or licensed labor guides. Tabs: Details, Bookings, Photo Estimate, Line Items, Parts, Customer View, Invoice, Media, Guides, Community, Integrations, Dashboard, Admin, Help. Keep it to 2-5 tight sentences, no markdown. Question: "
          : "You are the in-app helper for a shop estimating app. Answer this staff question in 2-3 plain sentences, no markdown: ")) + botQ }] }) });
      if (!r.ok) throw new Error("route");
      const d = await r.json();
      const txt = (d.content || []).map((c) => c.text || "").join(" ").trim();
      setBotA(txt || "Try the Help tab — the full walkthrough lives there.");
    } catch (e) {
      setBotA("Quick answers work offline — try words like vin, sign, invoice, book, price, photo, pin, backup, location, text. Full answers switch on once the app is deployed.");
    }
    setBotBusy(false);
  }

  // ---------- Community: crew feed + parts swap ----------
  const [feedText, setFeedText] = useState("");
  const [feed, setFeed] = useState([]);
  const [swap, setSwap] = useState([]);
  const [swapForm, setSwapForm] = useState({ kind: "SELL", part: "", price: "", cond: "", contact: "" });
  useEffect(() => { if (tab === "Community") (async () => {
    const f = await store.get("forum:posts"); if (f) { try { setFeed(JSON.parse(f.value)); } catch (e) {} }
    const w = await store.get("swap:listings"); if (w) { try { setSwap(JSON.parse(w.value)); } catch (e) {} }
  })(); }, [tab]);
  async function postFeed() {
    if (!feedText.trim()) return;
    const list = [{ by: currentTech ? currentTech.name : "Tech", text: feedText.trim(), ts: new Date().toISOString().slice(0, 16).replace("T", " ") }, ...feed].slice(0, 200);
    setFeed(list); await store.set("forum:posts", list); setFeedText("");
  }
  async function postSwap() {
    if (!swapForm.part.trim()) { setErr("Name the part first."); return; }
    const list = [{ ...swapForm, by: currentTech ? currentTech.name : "Tech", ts: new Date().toISOString().slice(0, 10) }, ...swap].slice(0, 200);
    setSwap(list); await store.set("swap:listings", list); setSwapForm({ kind: "SELL", part: "", price: "", cond: "", contact: "" });
  }
  async function delSwap(i) { const list = swap.filter((_, j) => j !== i); setSwap(list); await store.set("swap:listings", list); }

  // ---------- Academy progress ----------
  const [acadDone, setAcadDone] = useState({});
  useEffect(() => { if (tab === "Academy") (async () => { const r = await store.get("academy:progress"); if (r) { try { setAcadDone(JSON.parse(r.value)); } catch (e) {} } })(); }, [tab]);
  async function markModule(i) {
    if (!currentTech) return;
    const key = currentTech.name + ":" + i;
    const next = { ...acadDone };
    if (next[key]) delete next[key]; else next[key] = new Date().toISOString().slice(0, 10);
    setAcadDone(next); await store.set("academy:progress", next);
  }

  // ---------- Peacefully Accurate: the shop's own confirmed-fix library ----------
  const [fixes, setFixes] = useState([]);
  const [fixQ, setFixQ] = useState("");
  const [fixDraft, setFixDraft] = useState(null);
  const [carfaxQ, setCarfaxQ] = useState([]);
  useEffect(() => { if (tab === "Fixes & Times") (async () => {
    const r = await store.get("fixes:library"); if (r) { try { setFixes(JSON.parse(r.value)); } catch (e) {} }
    const c = await store.get("carfax:queue"); if (c) { try { setCarfaxQ(JSON.parse(c.value)); } catch (e) {} }
  })(); }, [tab]);
  function draftFixFromJob() {
    const corr = rows.filter((r) => r.desc).map((r) => r.desc).join("; ");
    const hrs = rows.reduce((a2, r) => a2 + (parseFloat(r.hours) || 0), 0);
    setFixDraft({ ymm: vehicle.ymm || "", engine: "", complaint: (meta && meta.diagnosis) || "", cause: "", correction: corr, hours: hrs ? String(hrs) : "", parts: "" });
    setTab("Fixes & Times");
  }
  async function publishFix() {
    if (!fixDraft || !fixDraft.ymm.trim() || !fixDraft.correction.trim()) { setErr("A fix needs at least the vehicle and the correction."); return; }
    const entry = { ...fixDraft, by: currentTech ? currentTech.name : "Tech", shop: BRAND.name, ts: new Date().toISOString().slice(0, 10), confirms: 1 };
    const list = [entry, ...fixes].slice(0, 500);
    setFixes(list); await store.set("fixes:library", list); setFixDraft(null);
    setErr("Confirmed fix published — the library just got smarter."); setTimeout(() => setErr(""), 2500);
  }
  async function confirmFix(i) { const list = fixes.map((f, j) => j === i ? { ...f, confirms: (f.confirms || 1) + 1 } : f); setFixes(list); await store.set("fixes:library", list); }
  async function queueCarfax() {
    const entry = { ts: new Date().toISOString().slice(0, 10), ymm: vehicle.ymm || "", vin: vehicle.id || "", miles: vehicle.use || "", services: rows.filter((r) => r.desc).map((r) => r.desc).slice(0, 6).join("; ") };
    const r = await store.get("carfax:queue"); let list = [];
    if (r) { try { list = JSON.parse(r.value); } catch (e) {} }
    list = [entry, ...list].slice(0, 300);
    await store.set("carfax:queue", list); setCarfaxQ(list);
    setErr("Queued for CARFAX reporting ✓"); setTimeout(() => setErr(""), 2500);
  }

  // ---------- Peaceful Times: real-world labor guide ----------
  const [timesG, setTimesG] = useState([]);
  const [timeQ, setTimeQ] = useState("");
  const [timeForm, setTimeForm] = useState({ job: "", veh: "", hours: "" });
  useEffect(() => { if (tab === "Fixes & Times") (async () => { const r = await store.get("times:guide"); if (r) { try { setTimesG(JSON.parse(r.value)); } catch (e) {} } })(); }, [tab]);
  async function saveTimes(list) { setTimesG(list); await store.set("times:guide", list); }
  async function addTimeEntry() {
    if (!timeForm.job.trim() || !(parseFloat(timeForm.hours) > 0)) { setErr("A time entry needs the job and the hours."); return; }
    await saveTimes([{ job: timeForm.job.trim(), veh: timeForm.veh.trim(), hours: String(parseFloat(timeForm.hours)), by: currentTech ? currentTech.name : "Tech", ts: new Date().toISOString().slice(0, 10) }, ...timesG].slice(0, 1000));
    setTimeForm({ job: "", veh: "", hours: "" });
  }
  async function logJobTimes() {
    const entries = rows.filter((r) => r.desc && parseFloat(r.hours) > 0).map((r) => ({ job: r.desc, veh: vehicle.ymm || "", hours: String(parseFloat(r.hours)), by: currentTech ? currentTech.name : "Tech", ts: new Date().toISOString().slice(0, 10) }));
    if (!entries.length) { setErr("No labor lines with hours on this job."); return; }
    const r = await store.get("times:guide"); let list = [];
    if (r) { try { list = JSON.parse(r.value); } catch (e) {} }
    await saveTimes([...entries, ...list].slice(0, 1000));
    setErr(entries.length + " time entr" + (entries.length === 1 ? "y" : "ies") + " logged to the guide ✓"); setTimeout(() => setErr(""), 2500);
  }
  async function loadTimeSamples() {
    const S = [["Front brake pads & rotors", "SAMPLE sedan", "1.4"], ["Front brake pads & rotors", "SAMPLE SUV", "1.7"], ["Alternator replacement", "SAMPLE pickup", "1.8"], ["Alternator replacement", "SAMPLE sedan", "1.5"], ["Serpentine belt", "SAMPLE sedan", "0.7"], ["Starter replacement", "SAMPLE pickup", "2.2"]];
    await saveTimes([...S.map(([j, v, h]) => ({ job: j, veh: v, hours: h, by: "SAMPLE", ts: "sample" })), ...timesG]);
  }
  async function clearTimeSamples() { await saveTimes(timesG.filter((t) => t.by !== "SAMPLE")); }

  // ---------- Intake auto-draft: diagnose → ballpark → drafted reply → owner edits → owner sends ----------
  const [replyDraft, setReplyDraft] = useState(null);
  const OFFLINE_CAUSES = [
    ["no start|wont start|won't start|no crank|click", ["Weak/dead battery", "Starter", "Battery cable/connection"], 150, 550],
    ["brake|grind|squeal", ["Brake pads & rotors", "Sticking caliper", "Brake hardware"], 220, 650],
    ["overheat|running hot|coolant", ["Thermostat", "Water pump", "Radiator/hose leak"], 180, 900],
    ["battery light|charging|alternator", ["Alternator", "Serpentine belt", "Battery"], 250, 800],
    ["check engine|misfire|rough idle", ["Ignition coils/plugs", "Vacuum leak", "Sensor fault — scan needed"], 95, 600],
    ["a/c|air condition|not blowing cold", ["Refrigerant leak/recharge", "Compressor clutch", "Blend door actuator"], 150, 950],
    ["mower|blade|deck|won't cut", ["Blade sharpen/replace", "Deck belt", "Spindle bearing"], 60, 260],
    ["oil leak|leaking oil", ["Valve cover gasket", "Oil pan gasket", "Main seal — inspect first"], 120, 700],
  ];
  function offlineDiag(txt) {
    const t = (txt || "").toLowerCase();
    for (const [pat, causes, lo, hi] of OFFLINE_CAUSES) if (pat.split("|").some((k) => t.includes(k))) return { causes, lo, hi };
    return { causes: ["Needs eyes on it — diagnostic first"], lo: 95, hi: 195 };
  }
  async function autoDraft(bk) {
    let d = offlineDiag((bk.vehicle || "") + " " + (bk.notes || ""));
    try {
      const r = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: 'A customer requests service. Vehicle: ' + (bk.vehicle || "unknown") + '. They say: ' + (bk.notes || "") + '. Reply ONLY with JSON {"causes":[three short probable causes],"lo":number,"hi":number} — a realistic independent-shop parts+labor range in USD. No other text.' }] }) });
      if (r.ok) {
        const j = await r.json();
        const txt = (j.content || []).map((c) => c.text || "").join("");
        const p = JSON.parse(txt.replace(/```json|```/g, "").trim());
        if (p && p.causes && p.causes.length) d = { causes: p.causes.slice(0, 3), lo: Number(p.lo) || d.lo, hi: Number(p.hi) || d.hi };
      }
    } catch (e) {}
    const msg = "Hi " + (bk.name || "there") + " — got your request about your " + (bk.vehicle || "vehicle") + ". From what you described, the usual suspects are: " + d.causes.join(", ") + ". Ballpark " + money(d.lo) + "–" + money(d.hi) + " parts + labor; exact written estimate after we look (diagnostic from $95, with $40 credited to the repair). Want us out " + (bk.date || "this week") + (bk.time ? " at " + bk.time : "") + "? Reply YES to confirm. — " + BRAND.name + " " + BRAND.phone + " (Reply STOP to opt out)";
    setReplyDraft({ key: bk.key, name: bk.name || "", phone: bk.phone || "", email: bk.email || "", pref: bk.pref || "text", causes: d.causes, lo: d.lo, hi: d.hi, msg });
  }
  async function sendDraftEmail() {
    if (!replyDraft) return;
    if (!replyDraft.email) { setErr("No email on this request — send by text, or add their email to the booking."); return; }
    try {
      const r = await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: replyDraft.email, subject: BRAND.name + " — your service request", html: '<pre style="font-family:inherit;white-space:pre-wrap">' + replyDraft.msg.replace(/</g, "&lt;") + "</pre>" }) });
      if (!r.ok) throw new Error("route");
      setErr("Estimate reply emailed ✓"); setTimeout(() => setErr(""), 2500);
    } catch (e) {
      window.location.href = "mailto:" + replyDraft.email + "?subject=" + encodeURIComponent(BRAND.name + " — your service request") + "&body=" + encodeURIComponent(replyDraft.msg);
    }
  }

  // ---------- Customer members: free login (no repair needed), chat w/ shop, community channels ----------
  const [pmMember, setPmMember] = useState(null);
  const [memMode, setMemMode] = useState("join");
  const [memForm, setMemForm] = useState({ name: "", phone: "", pin: "", signedName: "", agree: false, notify: true });
  const [memLogin, setMemLogin] = useState({ phone: "", pin: "" });
  const [memMsg, setMemMsg] = useState("");
  const [memChat, setMemChat] = useState([]);
  const [memChatText, setMemChatText] = useState("");
  const [memFeed, setMemFeed] = useState([]);
  const [memChannel, setMemChannel] = useState("Ask & Learn");
  const [memPost, setMemPost] = useState("");
  async function getMembers() { const r = await store.get("members:list"); if (r) { try { return JSON.parse(r.value); } catch (e) {} } return []; }
  async function memberSignup() {
    if (!memForm.name.trim() || !memForm.phone.trim() || memForm.pin.length < 4) { setMemMsg("Name, phone, and a 4+ digit PIN please."); return; }
    if (!memForm.agree || !memForm.signedName.trim()) { setMemMsg("Read the guidelines, type your name to sign, and check the box."); return; }
    const list = await getMembers();
    if (list.find((m) => m.phone === memForm.phone.trim())) { setMemMsg("That phone already has a login — use Sign in."); setMemMode("login"); return; }
    const m = { name: memForm.name.trim(), phone: memForm.phone.trim(), pin: memForm.pin, ok: true, notify: memForm.notify, signedName: memForm.signedName.trim(), ts: new Date().toISOString().slice(0, 10) };
    await store.set("members:list", [...list, m]);
    setPmMember(m); setMemMsg("");
  }
  async function memberLogin() {
    const list = await getMembers();
    const m = list.find((x) => x.phone === memLogin.phone.trim() && x.pin === memLogin.pin);
    if (!m) { setMemMsg("No match — check phone and PIN."); return; }
    if (m.ok === false) { setMemMsg("Your access is paused. Text the shop at " + BRAND.phone + " to talk it through."); return; }
    setPmMember(m); setMemMsg("");
  }
  useEffect(() => { if (custPortal && pmMember) (async () => {
    const f = await store.get("mfeed:posts"); if (f) { try { setMemFeed(JSON.parse(f.value)); } catch (e) {} }
    const c = await store.get("mchat:" + pmMember.phone); if (c) { try { setMemChat(JSON.parse(c.value)); } catch (e) {} } else setMemChat([]);
  })(); }, [custPortal, pmMember]);
  async function sendMemberMsg() {
    if (!memChatText.trim() || !pmMember) return;
    const list = [...memChat, { from: "member", text: memChatText.trim(), ts: new Date().toISOString().slice(0, 16).replace("T", " ") }].slice(-100);
    setMemChat(list); await store.set("mchat:" + pmMember.phone, list); setMemChatText("");
  }
  async function postMemberFeed() {
    if (!memPost.trim() || !pmMember) return;
    const list = [{ by: pmMember.name, ch: memChannel, text: memPost.trim(), ts: new Date().toISOString().slice(0, 16).replace("T", " ") }, ...memFeed].slice(0, 300);
    setMemFeed(list); await store.set("mfeed:posts", list); setMemPost("");
  }
  // staff side
  const [membersAll, setMembersAll] = useState([]);
  const [inboxSel, setInboxSel] = useState("");
  const [inboxThread, setInboxThread] = useState([]);
  const [inboxReply, setInboxReply] = useState("");
  useEffect(() => { if (tab === "Community" && currentTech && currentTech.admin) (async () => { setMembersAll(await getMembers()); })(); }, [tab, currentTech]);
  async function toggleDonor(phone) {
    const list = (await getMembers()).map((m) => m.phone === phone ? { ...m, donor: !m.donor } : m);
    await store.set("members:list", list); setMembersAll(list);
  }
  async function toggleMember(phone) {
    const list = (await getMembers()).map((m) => m.phone === phone ? { ...m, ok: m.ok === false } : m);
    await store.set("members:list", list); setMembersAll(list);
  }
  async function openThread(phone) {
    setInboxSel(phone);
    const c = await store.get("mchat:" + phone);
    if (c) { try { setInboxThread(JSON.parse(c.value)); return; } catch (e) {} }
    setInboxThread([]);
  }
  async function replyThread() {
    if (!inboxReply.trim() || !inboxSel) return;
    const list = [...inboxThread, { from: "shop", by: currentTech ? currentTech.name : "Shop", text: inboxReply.trim(), ts: new Date().toISOString().slice(0, 16).replace("T", " ") }].slice(-100);
    setInboxThread(list); await store.set("mchat:" + inboxSel, list);
    const m = membersAll.find((x) => x.phone === inboxSel);
    if (m && m.notify !== false) sendTextSmart(inboxSel, BRAND.name + ": " + inboxReply.trim() + " (Reply STOP to opt out)");
    setInboxReply("");
  }

  function copyAppLink() {
    try { navigator.clipboard.writeText(window.location.href); setErr("App link copied — text it to any phone or tablet."); setTimeout(() => setErr(""), 3000); } catch (e) {}
  }

  async function downloadCustomerReport() {
    // Signed URLs expire; the report is a file people keep. Inline the stills.
    const embedded = await embedMediaForReport(custPhotos);
    const items = embedded.map((p, i) => {
      const media = p.kind === "video"
        ? `<video controls style="width:100%;border-radius:10px" src="${p.dataUrl}"></video>`
        : `<img style="width:100%;border-radius:10px" src="${p.dataUrl}">`;
      return `<div style="margin:0 0 22px"><div style="font-weight:800;color:#7A1F1F;margin:0 0 6px">${p.caption || "Photo " + (i + 1)}</div>${media}${p.comment ? `<div style="font-size:14px;color:#444;margin-top:6px">${p.comment}</div>` : ""}</div>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Peaceful Motors — ${meta.number}</title></head>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:18px;color:#241F1F">
<div style="border-bottom:3px solid #7A1F1F;padding-bottom:10px;margin-bottom:16px">
<div style="font-size:24px;font-weight:900;color:#7A1F1F">PEACEFUL MOTORS</div>
<div style="font-style:italic;color:#2E7D32;font-size:13px">${BRAND.tagline}</div>
<div style="font-size:12px;color:#666">314-919-7456 · peacefulmotors@outlook.com · peacefulmotors.com</div></div>
<p style="font-size:15px"><b>${meta.customer.name || "Customer"}</b> — here's what we found on your <b>${vehicle.ymm || "vehicle"}</b> (${meta.number}).</p>
${items || "<p>(no media attached)</p>"}
${rows.filter((r) => r.desc).length ? `<div style="background:#F5EDE6;border-radius:10px;padding:12px;font-size:14px"><b>Estimate total: ${money(totals.grand)}</b> — full written estimate provided separately.</div>` : ""}
<p style="font-size:12px;color:#666;margin-top:18px">Questions? Call or text 314-919-7456. Warranty: 12 months / 12,000 miles, parts &amp; labor.</p>
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a"); a.href = url; a.download = `${meta.number}-customer-report.html`; a.click(); URL.revokeObjectURL(url);
  }

  async function backupAll() {
    const listing = await store.list("");
    const dump = { exportedAt: new Date().toISOString(), data: {}, media: {} };
    if (listing && listing.keys) {
      for (const k of listing.keys) {
        const r = await store.get(k);
        if (r) { try { dump.data[k] = JSON.parse(r.value); } catch (e) { dump.data[k] = r.value; } }
      }
    }
    // Media lives in Storage now, not the record store — inline every
    // estimate's photos and videos so the backup file stands on its own
    // long after the signed URLs would have expired (Task 5).
    try {
      const est = await store.list("estimates:");
      for (const k of (est && est.keys) || []) {
        const no = k.slice("estimates:".length);
        try {
          const items = await embedMediaForBackup(no);
          if (items.length) dump.media[no] = items;
        } catch (e) {}
      }
    } catch (e) {}
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `peaceful-os-backup-${todayStr()}.json`; a.click(); URL.revokeObjectURL(url);
  }

  function openPartsTech(r) {
    const q = [vehicle.ymm, r.desc, r.part].filter(Boolean).join(" ");
    try { navigator.clipboard.writeText(q); } catch (e) {}
    window.open("https://app.partstech.com", "_blank");
    setErr(`Copied "${q}" — log into PartsTech and paste it into search.`);
    setTimeout(() => setErr(""), 4500);
  }

  function emailEstimate() {
    const subject = `Peaceful Motors Estimate ${meta.number} — ${vehicle.ymm || "vehicle"}`;
    const body = customerText();
    // mailto links have a practical length cap, so the body is kept compact
    window.location.href = `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
  }

  async function saveEstimate() {
    const record = { meta, vehicle, category, totals, rows, folder: "New", tech: currentTech ? currentTech.name : "", savedAt: new Date().toISOString() };
    await store.set(`estimates:${meta.number}`, record);
    // The customer goes on file in the customers table too, so the
    // /api/sms consent gate has a row to check (Task 4).
    try { upsertCustomerRecord(meta.customer); } catch (e) {}
    // Photos and videos go to Supabase Storage, keyed to this estimate.
    try { await saveMedia(meta.number, custPhotos); } catch (e) {}
    // Auto-email a copy to the shop inbox — works on the deployed site once
    // RESEND_API_KEY is set; silently skipped everywhere else.
    try { fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: `Peaceful Motors Estimate ${meta.number} — ${vehicle.ymm || ""}`, text: customerText() }) }).catch(() => {}); } catch (e) {}
    setSaveMsg("Saved.");
    setTimeout(() => setSaveMsg(""), 2000);
    loadDashboard();
  }
  async function loadDashboard() {
    const listing = await store.list("estimates:");
    if (!listing || !listing.keys) { setSavedEstimates([]); return; }
    const recs = [];
    for (const k of listing.keys) {
      const r = await store.get(k);
      if (r) { try { recs.push(JSON.parse(r.value)); } catch (e) {} }
    }
    setSavedEstimates(recs);
  }
  useEffect(() => { if (tab === "Dashboard") loadDashboard(); }, [tab]);

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
  }, []);

  const dash = useMemo(() => {
    const n = savedEstimates.length;
    const totalVal = savedEstimates.reduce((s, e) => s + (e.totals?.grand || 0), 0);
    const avg = n ? totalVal / n : 0;
    const byStatus = {};
    STATUSES.forEach((s) => (byStatus[s] = 0));
    savedEstimates.forEach((e) => { byStatus[e.meta?.status || "Draft"] = (byStatus[e.meta?.status || "Draft"] || 0) + 1; });
    const approvedPlus = STATUSES.slice(2).reduce((s, k) => s + (byStatus[k] || 0), 0);
    const approvalRate = n ? Math.round((approvedPlus / n) * 100) : 0;
    const partsTotal = savedEstimates.reduce((s, e) => s + (e.totals?.partsSub || 0), 0);
    const laborTotal = savedEstimates.reduce((s, e) => s + (e.totals?.laborSub || 0), 0);
    return { n, totalVal, avg, byStatus, approvalRate, partsTotal, laborTotal };
  }, [savedEstimates]);

  const input = "w-full bg-neutral-800 text-neutral-100 rounded-lg px-3 py-2.5 text-base border border-neutral-700 focus:outline-none focus:border-neutral-400 min-h-[44px] print:hidden";
  const label = "text-[11px] uppercase tracking-wide text-neutral-400 mb-1 block print:hidden";
  const card = { background: C.panel, border: `1px solid ${C.line}` };
  const pri = (p) => p === "high" ? C.red : p === "med" ? C.amber : "#6b7280";
  const statusIdx = STATUSES.indexOf(meta.status);
  const invTotal = totals.grand + num(inv.serviceCall) - num(inv.diagCredit);

  // ---------- Customer portal ----------
  if (custPortal) {
    return (
      <div className="min-h-screen text-neutral-100 overflow-x-hidden p-4" style={{ background: C.ink }}>
        <div className="max-w-md mx-auto">
          <div className="rounded-lg overflow-hidden mb-4" style={{ border: `1px solid ${C.line}` }}>
            <div className="px-4 py-3" style={{ background: C.maroon }}>
              <div className="text-lg font-black tracking-wide">{BRAND.name}</div>
              <div className="text-xs italic" style={{ color: "#BFE3C0" }}>{BRAND.tagline}</div>
            </div>
          </div>
          <div className="rounded-md p-3 mb-3" style={card}>
            <span className={label}>Look up your estimate — phone number or estimate #</span>
            <div className="flex gap-2">
              <input className={input} placeholder="Phone or PM-2026-…" value={portalQ} onChange={(e) => setPortalQ(e.target.value)} />
              <button onClick={portalLookup} className="px-4 rounded font-semibold" style={{ background: C.green }}>Find</button>
            </div>
          </div>
          {portalRes !== null && (portalRes.length === 0
            ? <div className="rounded-md p-3 text-sm text-neutral-400 mb-3" style={card}>Nothing found — double-check the number, or call {BRAND.phone}.</div>
            : portalRes.map((e, i) => (
              <div key={i} className="rounded-md p-3 mb-3" style={card}>
                <div className="flex justify-between text-sm"><b>{e.meta && e.meta.number}</b><span>{(e.meta && e.meta.status) || ""}</span></div>
                <div className="text-xs text-neutral-400">{(e.vehicle && e.vehicle.ymm) || ""} · {e.folder || "New"}</div>
                <div className="text-lg font-black mt-1" style={{ color: "#9be3a0" }}>{money((e.totals && e.totals.grand) || 0)}</div>
                {(settings.stripeLink || "").startsWith("http") && (
                  <button onClick={() => window.open(settings.stripeLink, "_blank")} className="mt-2 w-full py-2 rounded font-bold" style={{ background: "#1a5fb4" }}>Pay online</button>
                )}
              </div>
            )))}
          <div className="rounded-md p-3 mb-3" style={card}>
            <span className={label}>Quick answers</span>
            <select className={input} value={faq} onChange={(e) => setFaq(e.target.value)}>
              <option value="">Pick a question…</option>
              <option value="hours">What are your hours?</option>
              <option value="warranty">What's the warranty?</option>
              <option value="pay">How can I pay?</option>
              <option value="area">Do you come to me?</option>
            </select>
            {faq && <div className="text-xs text-neutral-300 mt-2">{
              faq === "hours" ? "Mon–Fri, 8:30 AM – 5:30 PM. Call or text " + BRAND.phone + " anytime." :
              faq === "warranty" ? "12 months / 12,000 miles on parts & labor, whichever comes first." :
              faq === "pay" ? "All major cards (Stripe), Apple Pay, Google Pay, Cash App Pay, Klarna, or cash." :
              "Yes — we're mobile. Home, work, or roadside across the St. Louis metro."
            }</div>}
          </div>
          <div className="rounded-md p-3 mb-3" style={card}>
            <span className={label}>Book a service — no account needed</span>
            <div className="grid grid-cols-2 gap-2">
              <input className={input} placeholder="Your name" value={portalBk.name} onChange={(e) => setPortalBk({ ...portalBk, name: e.target.value })} />
              <input className={input} placeholder="Phone" value={portalBk.phone} onChange={(e) => setPortalBk({ ...portalBk, phone: e.target.value })} />
              <input className={input} placeholder="Vehicle (yr/make/model)" value={portalBk.vehicle} onChange={(e) => setPortalBk({ ...portalBk, vehicle: e.target.value })} />
              <input className={input} type="date" value={portalBk.date} onChange={(e) => setPortalBk({ ...portalBk, date: e.target.value })} />
            </div>
            <input className={input + " mt-2"} placeholder="What's it doing? Where's the vehicle?" value={portalBk.issue} onChange={(e) => setPortalBk({ ...portalBk, issue: e.target.value })} />
            <input className={input + " mt-2"} placeholder="Email (optional — for estimates by email)" inputMode="email" value={portalBk.email} onChange={(e) => setPortalBk({ ...portalBk, email: e.target.value })} />
            <div className="flex items-center gap-3 mt-2 text-xs text-neutral-300">
              <span>Reply by:</span>
              <label className="flex items-center gap-1"><input type="radio" checked={portalBk.pref === "text"} onChange={() => setPortalBk({ ...portalBk, pref: "text" })} /> Text</label>
              <label className="flex items-center gap-1"><input type="radio" checked={portalBk.pref === "email"} onChange={() => setPortalBk({ ...portalBk, pref: "email" })} /> Email</label>
            </div>
            <div className="flex gap-2 mt-2 items-center flex-wrap">
              {!pvOK ? (<>
                <button onClick={sendVerify} className="px-3 py-2 rounded-lg text-xs font-semibold border border-neutral-600 text-neutral-300">Text me a code</button>
                <input className={input + " w-24"} placeholder="Code" inputMode="numeric" value={pvCode} onChange={(e) => setPvCode(e.target.value)} />
                <button onClick={checkVerify} className="px-3 py-2 rounded-lg text-xs font-semibold border border-neutral-600 text-neutral-300">Verify</button>
              </>) : (<span className="text-xs font-bold" style={{ color: "#9be3a0" }}>✓ Phone verified</span>)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-neutral-400">Human check: 3 + 4 =</span>
              <input className={input + " w-16"} inputMode="numeric" value={pHuman} onChange={(e) => setPHuman(e.target.value)} />
            </div>
            <div className="mt-2">
              <label className="text-xs text-neutral-400">Photos help us quote faster — VIN sticker (driver-door jamb) and the problem area (optional, up to 3):</label>
              <input type="file" accept="image/*" multiple onChange={addPortalPhotos} className="block mt-1 text-xs" />
              {pPhotos.length > 0 && (
                <div className="flex gap-2 mt-1">{pPhotos.map((p, i) => (
                  <span key={i} className="relative"><img src={p} className="h-14 w-14 object-cover rounded" alt="upload" /><button onClick={() => setPPhotos(pPhotos.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 bg-black/80 rounded-full w-4 h-4 text-[9px]">✕</button></span>
                ))}</div>
              )}
            </div>
            <button onClick={portalBallpark} className="w-full mt-2 py-2 rounded-lg text-xs font-semibold border border-neutral-600 text-neutral-300">🔎 Get an instant first look (free)</button>
            {pBall && (
              <div className="rounded-md p-2 mt-2 text-xs" style={{ background: "#161616" }}>
                <b style={{ color: "#9be3a0" }}>Usual suspects:</b> {pBall.causes.join(" · ")} — <b>ballpark {money(pBall.lo)}–{money(pBall.hi)}</b> parts + labor.
                <div className="text-[10px] text-neutral-500 mt-1">Automated first look from what you typed — not a quote or a diagnosis. Your written estimate comes after we actually look, and it is the only number that counts.</div>
              </div>
            )}
            <input value={pHp} onChange={(e) => setPHp(e.target.value)} tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: "-5000px", height: 0, width: 0, opacity: 0 }} aria-hidden="true" placeholder="company" />
            <button onClick={portalBook} className="mt-2 w-full py-2.5 rounded font-bold" style={{ background: C.maroon }}>Request my appointment</button>
            {portalBkMsg && <div className="text-xs mt-2" style={{ color: "#9be3a0" }}>{portalBkMsg}</div>}
            <div className="text-[10px] text-neutral-500 mt-1">By requesting, you agree we may text or email you about this appointment. Reply STOP anytime to stop messages.</div>
          </div>
          <button onClick={shareMyLocation} className="w-full py-2.5 rounded font-bold mb-3" style={{ background: C.green }}>📍 Share my vehicle's location for service</button>
          <div className="text-[10px] text-neutral-500 mb-3">Location is shared once, only in the text you send — we never track you. Your estimate appears here once the shop saves it in this system. Amounts shown are estimates pending final written approval and subject to the shop's posted terms. Full customer accounts, push notifications, and history arrive with the cloud upgrade.</div>
          {(settings.features || {}).custCommunity !== false ? (
          <div className="rounded-md p-3 mb-3" style={{ ...card, border: `1px solid ${C.green}` }}>
            <div className="text-sm font-bold mb-1">🚗 {BRAND.name} community</div>
            {!pmMember ? (<>
              <div className="text-[11px] text-neutral-500 mb-2">Free login for everyone — you don't need a repair to join. Ask questions, learn, talk cars, and message the shop directly.</div>
              <div className="flex gap-2 mb-2">
                <button onClick={() => setMemMode("join")} className="flex-1 py-2 rounded-lg text-xs font-bold" style={{ background: memMode === "join" ? C.green : "#262626" }}>Join free</button>
                <button onClick={() => setMemMode("login")} className="flex-1 py-2 rounded-lg text-xs font-bold" style={{ background: memMode === "login" ? C.green : "#262626" }}>Sign in</button>
              </div>
              {memMode === "join" ? (<>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input className={input} placeholder="Your name" value={memForm.name} onChange={(e) => setMemForm({ ...memForm, name: e.target.value })} />
                  <input className={input} placeholder="Phone" inputMode="tel" value={memForm.phone} onChange={(e) => setMemForm({ ...memForm, phone: e.target.value })} />
                  <input className={input} placeholder="Create a PIN (4+)" inputMode="numeric" value={memForm.pin} onChange={(e) => setMemForm({ ...memForm, pin: e.target.value })} />
                </div>
                <div className="rounded-md p-2 mt-2 text-[11px] text-neutral-400" style={{ background: "#161616" }}>
                  <b className="text-neutral-300">Community guidelines (your signature below accepts them):</b>
                  {CUST_GUIDELINES.map((g, i) => <div key={i}>• {g}</div>)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <input className={input} placeholder="Type your name to sign" value={memForm.signedName} onChange={(e) => setMemForm({ ...memForm, signedName: e.target.value })} />
                  <label className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={memForm.agree} onChange={(e) => setMemForm({ ...memForm, agree: e.target.checked })} /> I've read and accept the guidelines</label>
                </div>
                <label className="flex items-center gap-2 text-xs text-neutral-400 mt-1"><input type="checkbox" checked={memForm.notify} onChange={(e) => setMemForm({ ...memForm, notify: e.target.checked })} /> OK to text me when the shop replies (STOP anytime)</label>
                <button onClick={memberSignup} className="w-full mt-2 py-2 rounded-lg text-sm font-bold" style={{ background: C.green }}>Create my login</button>
              </>) : (<>
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} placeholder="Phone" inputMode="tel" value={memLogin.phone} onChange={(e) => setMemLogin({ ...memLogin, phone: e.target.value })} />
                  <input className={input} placeholder="PIN" inputMode="numeric" value={memLogin.pin} onChange={(e) => setMemLogin({ ...memLogin, pin: e.target.value })} />
                </div>
                <button onClick={memberLogin} className="w-full mt-2 py-2 rounded-lg text-sm font-bold" style={{ background: C.green }}>Sign in</button>
              </>)}
              {memMsg && <div className="text-xs mt-2" style={{ color: "#f0b356" }}>{memMsg}</div>}
            </>) : (<>
              <div className="flex items-center gap-2 mb-2"><b className="text-sm flex-1" style={{ color: "#9be3a0" }}>Hey {pmMember.name} 👋</b><button onClick={() => setPmMember(null)} className="text-xs text-neutral-400 underline">Sign out</button></div>
              <div className="rounded-md p-2 mb-2" style={{ background: "#161616" }}>
                <div className="text-xs font-bold mb-1">💬 Message the shop</div>
                {memChat.slice(-6).map((c, i) => (
                  <div key={i} className="text-xs py-0.5"><b style={{ color: c.from === "shop" ? "#9be3a0" : "#ddd" }}>{c.from === "shop" ? BRAND.name : "You"}:</b> {c.text}</div>
                ))}
                <div className="flex gap-2 mt-1">
                  <input className={input} placeholder="Ask us anything…" value={memChatText} onChange={(e) => setMemChatText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendMemberMsg(); }} />
                  <button onClick={sendMemberMsg} className="px-3 rounded-lg text-xs font-bold shrink-0" style={{ background: C.green }}>Send</button>
                </div>
              </div>
              <div className="rounded-md p-2" style={{ background: "#161616" }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs font-bold flex-1">🗣 Community</div>
                  {["Ask & Learn", "Tips & Wins", ...(pmMember.donor ? ["Donor Room"] : [])].map((ch) => (
                    <button key={ch} onClick={() => setMemChannel(ch)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: memChannel === ch ? C.green : "#262626" }}>{ch}</button>
                  ))}
                </div>
                {memFeed.filter((p) => p.ch === memChannel).slice(0, 8).map((p, i) => (
                  <div key={i} className="text-xs py-1 border-b border-neutral-800"><b style={{ color: "#9be3a0" }}>{p.by}</b> <span className="text-[9px] text-neutral-500">{p.ts}</span><div>{p.text}</div></div>
                ))}
                <div className="flex gap-2 mt-1">
                  <input className={input} placeholder={"Post in " + memChannel + "…"} value={memPost} onChange={(e) => setMemPost(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") postMemberFeed(); }} />
                  <button onClick={postMemberFeed} className="px-3 rounded-lg text-xs font-bold shrink-0" style={{ background: C.green }}>Post</button>
                </div>
                <div className="text-[9px] text-neutral-500 mt-1">Neighbor-to-neighbor — verify safety-critical advice with a pro. Guidelines apply; the shop can pause accounts.</div>
              </div>
            </>)}
          </div>
          ) : (
          <div className="rounded-md p-3 mb-3" style={card}>
            <div className="text-sm font-bold mb-1">💚 Support the mission</div>
            <div className="text-[11px] text-neutral-400">Our member community is invite-only right now. You can still be part of the work — <b>become a donor</b> to Peaceful Ministries: text {BRAND.phone} or tap Donate on our website.</div>
          </div>
          )}
          <button onClick={() => setPortalTermsOpen(!portalTermsOpen)} className="w-full py-2 rounded border border-neutral-700 text-xs text-neutral-400 mb-3">View service terms (optional)</button>
          {portalTermsOpen && (
            <div className="rounded-md p-3 mb-3 text-[11px] text-neutral-400" style={card}>Estimates are drafts until approved in writing; final invoices may vary with approved supplements. Payments run through secure third-party processors. Message and data rates may apply to texts; reply STOP anytime to stop updates. Full terms are posted by the shop and available on request.</div>
          )}
          <button onClick={() => { setCustPortal(false); setPortalRes(null); setPortalQ(""); setFaq(""); }} className="w-full py-2 rounded border border-neutral-600 text-sm">← Staff login</button>
        </div>
      </div>
    );
  }

  // ---------- Login gate ----------
  if (!currentTech) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-neutral-100" style={{ background: C.ink }}>
        <div className="w-full max-w-sm rounded-lg p-5" style={{ background: C.panel, border: `1px solid ${C.maroon}` }}>
          <div className="text-center mb-4">
            <div className="text-xl font-black tracking-wide">{BRAND.name}</div>
            <div className="text-xs italic" style={{ color: "#BFE3C0" }}>{BRAND.tagline}</div>
          </div>
          {techs.length === 0 ? (
            <div>
              <div className="text-sm font-bold mb-2">First run — create the owner login</div>
              <input className={input} placeholder="Your name" value={newTech.name} onChange={(e) => setNewTech({ ...newTech, name: e.target.value })} />
              <input className={input + " mt-2"} placeholder="Choose a PIN (4+ digits)" inputMode="numeric" value={newTech.pin} onChange={(e) => setNewTech({ ...newTech, pin: e.target.value })} />
              <input className={input + " mt-2"} placeholder="Your email (for PIN resets)" inputMode="email" value={newTech.email || ""} onChange={(e) => setNewTech({ ...newTech, email: e.target.value })} />
              {!agreeTerms && <label className="flex items-start gap-2 text-[11px] text-neutral-400 mt-2">
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-0.5" />
                <span>I've read and agree to the Subscriber Agreement &amp; Disclaimer: Drafted content requires human review; prices and hours are estimates until confirmed; texting and location features require the consents described. (Asked once — your acceptance is saved.)</span>
              </label>}
              <button onClick={async () => {
                if (newTech.name && newTech.pin.trim().length >= 4 && agreeTerms) {
                  const owner = { name: newTech.name, pin: newTech.pin.trim(), email: (newTech.email || "").trim(), admin: true };
                  // Hash the owner PIN server-side from day one (Task 2);
                  // preview/offline keeps the old plaintext behavior and
                  // upgrades itself on the first online login.
                  try {
                    const r = await fetch("/api/pin/set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: owner.pin }) });
                    if (r.ok) { const d = await r.json(); if (d.pinHash) { owner.pinHash = d.pinHash; delete owner.pin; } }
                  } catch (e) {}
                  const list = [owner];
                  saveTechs(list); setCurrentTech(list[0]);
                  store.set("terms:accepted", { name: newTech.name, ts: new Date().toISOString() }); // one-time acceptance, on record
                  setMeta((m) => ({ ...m, estimator: m.estimator || newTech.name }));
                  setNewTech({ name: "", pin: "", email: "" }); setErr("");
                } else setErr("Enter a name, a PIN of at least 4 digits, and accept the subscriber terms.");
              }} className="w-full mt-3 py-2.5 rounded font-bold" style={{ background: C.green }}>Create owner &amp; enter</button>
            </div>
          ) : (
            <div>
              <span className={label}>Who's working?</span>
              <select className={input} value={loginSel} onChange={(e) => setLoginSel(Number(e.target.value))}>
                {techs.map((t, i) => <option key={i} value={i}>{t.name}{t.admin ? " (admin)" : ""}</option>)}
              </select>
              <input className={input + " mt-2"} placeholder="PIN" type="password" inputMode="numeric" value={loginPin}
                onChange={(e) => setLoginPin(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") tryLogin(); }} />
              <button onClick={tryLogin} className="w-full mt-3 py-2.5 rounded font-bold" style={{ background: C.maroon }}>Log in</button>
              <button onClick={() => { setForgotOpen(!forgotOpen); setForgotMsg(""); }} className="w-full mt-2 py-1.5 text-xs text-neutral-400 underline">Forgot your PIN?</button>
              {forgotOpen && (
                <div className="mt-2 rounded-lg p-2" style={{ background: "#262626" }}>
                  <select className={input} value={forgotSel} onChange={(e) => setForgotSel(Number(e.target.value))}>
                    {techs.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
                  </select>
                  <button onClick={resetPinByEmail} className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold" style={{ background: C.green }}>Email me a temporary PIN</button>
                  {forgotMsg && <div className="text-[11px] mt-2 text-neutral-300">{forgotMsg}</div>}
                </div>
              )}
            </div>
          )}
          {err && <div className="text-[12px] mt-3 text-center" style={{ color: "#fcd9a1" }}>{err}</div>}
          {(settings.features || {}).portal !== false && (
            <button onClick={() => setCustPortal(true)} className="w-full mt-3 py-2 rounded text-sm border border-neutral-600 text-neutral-300">I'm a customer — view my estimate / pay</button>
          )}
          {(settings.features || {}).portal !== false && (
            <button onClick={() => { setCustPortal(true); setMemMode("join"); }} className="w-full mt-2 py-2 rounded text-sm font-semibold text-white" style={{ background: C.green }}>🚗 Customer community — free login, no repair needed</button>
          )}
          <div className="text-[10px] text-neutral-500 mt-4">PIN login stamps every job to the right tech and keeps casual eyes out. Forgot your PIN? The owner resets it on the Admin tab. Real email-based accounts and reset links come with the deployed login upgrade.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-neutral-100 overflow-x-hidden print:bg-white print:text-black" style={{ background: C.ink }}>
      <style>{`input, select, textarea { caret-color: #4ade80; } input:focus, select:focus, textarea:focus { border-color: #4ade80 !important; box-shadow: 0 0 0 3px rgba(74,222,128,0.35); border-radius: 8px; } input[type=checkbox] { accent-color: #2E7D32; width: 18px; height: 18px; } @media print { .no-print { display:none !important; } .print-area { display:block !important; color:#000; background:#fff; } body { background:#fff; } }`}</style>
      {scanOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 no-print">
          <div className="w-full max-w-md rounded-lg overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.maroon}` }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ background: C.maroon }}>
              <span className="text-sm font-bold text-white">Scan the VIN barcode</span>
              <button onClick={stopScan} className="p-1 text-white"><X size={18} /></button>
            </div>
            <video ref={scanVideo} playsInline muted className="w-full" />
            <div className="text-[11px] text-neutral-400 p-2">Door jamb, title, or windshield barcode — hold steady. Works best in Chrome on Android; if this browser can't scan, close and type the VIN.</div>
          </div>
        </div>
      )}
      {locConsentOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 no-print">
          <div className="w-full max-w-md rounded-lg overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.green}` }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ background: C.green }}>
              <span className="text-sm font-bold text-white">Location sharing — your approval</span>
              <button onClick={() => setLocConsentOpen(false)} className="p-1 text-white"><X size={18} /></button>
            </div>
            <div className="p-4 text-sm text-neutral-200 space-y-2">
              <div>Share your live location with <b>{BRAND.name}</b> dispatch <b>while you work</b>, so service advisors can give customers accurate ETAs.</div>
              <div className="text-xs text-neutral-400">• Work hours only — sharing stops the moment you tap Stop, close the app, or end your shift.<br/>• Visible only to shop admins/dispatch. Never sold, never used for anything else.<br/>• Records purge on the shop's retention schedule.<br/>• Your approval is recorded with your name and the time.</div>
              <button onClick={approveLocShare} className="w-full py-2.5 rounded-lg font-bold" style={{ background: C.green }}>I approve — start sharing</button>
              <button onClick={() => setLocConsentOpen(false)} className="w-full py-2 rounded-lg text-sm border border-neutral-600">Not now</button>
            </div>
          </div>
        </div>
      )}
      <button onClick={() => setBotOpen(!botOpen)} title="Shop assistant" className="fixed right-3 z-40 w-12 h-12 rounded-full font-black text-lg no-print shadow-lg" style={{ bottom: "13rem", background: C.green, color: "#fff" }}>?</button>
      {botOpen && (
        <div className="fixed right-3 z-40 w-80 max-w-[92vw] rounded-lg overflow-hidden no-print shadow-2xl" style={{ bottom: "16.5rem", background: C.panel, border: `1px solid ${C.green}` }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ background: C.green }}>
            <span className="text-sm font-bold text-white">Shop assistant</span>
            <span className="flex gap-1">
              <button onClick={() => setBotMode("mech")} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: botMode === "mech" ? "#fff" : "rgba(255,255,255,0.25)", color: botMode === "mech" ? C.green : "#fff" }}>Mechanic</button>
              <button onClick={() => setBotMode("legal")} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: botMode === "legal" ? "#fff" : "rgba(255,255,255,0.25)", color: botMode === "legal" ? C.green : "#fff" }}>Legal</button>
            </span>
            <button onClick={() => setBotOpen(false)} className="p-1 text-white"><X size={16} /></button>
          </div>
          <div className="p-3">
            <div className="flex gap-2">
              <input className={input} placeholder="Ask anything… (vin, invoice, book)" value={botQ} onChange={(e) => setBotQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") askBot(); }} />
              <button onClick={askBot} className="px-3 rounded-lg font-semibold shrink-0" style={{ background: C.green }}>{botBusy ? "…" : "Ask"}</button>
            </div>
            {botA && <div className="text-xs text-neutral-200 mt-2 leading-relaxed">{botA}</div>}
            <div className="text-[10px] text-neutral-500 mt-2">Guidance only — never legal, tax, or repair advice. Mechanic mode helps you work; Legal mode explains the app's built-in compliance practices; your professionals make the calls.</div>
            <button onClick={reportProblem} className="w-full mt-2 py-2 rounded-lg text-xs font-semibold border border-neutral-600 text-neutral-300">🐞 Report a problem to the owner (recent errors attach automatically)</button>
          </div>
        </div>
      )}
      <div className="max-w-4xl lg:max-w-6xl mx-auto p-4 lg:p-6 pb-72 no-print">
        {/* Letterhead + workflow status */}
        <div className="rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${C.line}` }}>
          <div className="px-4 py-3 flex items-center gap-3" style={{ background: C.maroon }}>
            <div className="rounded-full p-2" style={{ background: C.maroonDark }}><Car size={22} /></div>
            <div className="leading-tight">
              <div className="text-lg font-black tracking-wide">{BRAND.name}</div>
              <div className="text-xs italic" style={{ color: "#BFE3C0" }}>{BRAND.tagline}</div>
            </div>
            <div className="ml-auto text-right text-[11px] text-neutral-200">Estimate #{meta.number}<br />{meta.date}<br />{currentTech && currentTech.admin && (
              <select className="bg-neutral-800 text-neutral-200 text-xs rounded-lg px-2 py-2 border border-neutral-700 no-print min-h-[44px]" value="" onChange={(e) => { const v = e.target.value; if (v) setTab(v); e.target.value = ""; }} title="Owner menu">
                <option value="">👑 Owner ▾</option>
                <option value="Dashboard">Tech reports</option>
                <option value="Details">Customers &amp; history</option>
                <option value="Bookings">Scheduling</option>
                <option value="Community">Community</option>
                <option value="Fixes & Times">📊 Labor guide &amp; fixes</option>
                <option value="Admin">Account &amp; shop settings</option>
              </select>
            )}
            <button onClick={copyAppLink} className="underline mr-2">copy link</button><button onClick={() => setCurrentTech(null)} className="underline">{currentTech.name} · log out</button></div>
          </div>
          <div className="flex" style={{ background: "#111" }}>
            {STATUSES.map((s, i) => (
              <button key={s} onClick={() => setMeta({ ...meta, status: s })}
                className="flex-1 py-2 text-[10px] font-semibold flex flex-col items-center gap-1"
                style={{ color: i <= statusIdx ? "#9be3a0" : "#666", borderBottom: i <= statusIdx ? `2px solid ${C.green}` : "2px solid #333" }}>
                {i < statusIdx ? <CheckCircle2 size={13} /> : <Circle size={13} />}{s}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto md:flex-wrap md:overflow-visible sticky top-0 z-40 py-2 -mx-4 px-4" style={{ background: C.ink }}>
          {TABS.filter(tabEnabled).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="px-3.5 py-2.5 rounded-lg text-[13px] font-semibold whitespace-nowrap min-h-[44px]"
              style={{ background: tab === t ? C.green : "#262626", color: tab === t ? "#fff" : "#bbb" }}>{t}</button>
          ))}
        </div>

        {settings.locationOn && (
          <div className="flex items-center gap-2 mb-3 rounded-md px-3 py-2 text-xs no-print" style={card}>
            <MapPin size={14} style={{ color: sharingLoc ? "#9be3a0" : "#888" }} />
            <span className="flex-1">Location sharing for dispatch ETAs: <b>{sharingLoc ? "ON" : "OFF"}</b></span>
            {sharingLoc
              ? <button onClick={stopLoc} className="px-3 py-1 rounded font-semibold" style={{ background: C.maroon }}>Stop</button>
              : <button onClick={startLoc} className="px-3 py-1 rounded font-semibold" style={{ background: C.green }}>Share my location</button>}
          </div>
        )}
        {err && <div className="text-[13px] rounded px-3 py-2 mb-3" style={{ background: "#20140a", border: "1px solid #6b520c", color: "#fcd9a1" }}>{err}</div>}

        {/* ============ DETAILS TAB ============ */}
        {tab === "Details" && (
          <div className="space-y-3">
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">Shop update log — revisions · changes · corrections</div>
              <div className="text-[11px] text-neutral-500 mb-2">This shop's own record, written in this shop's own words. Entries save with the date and who wrote them.</div>
              <div className="flex gap-2 flex-wrap">
                <select className={input + " w-36"} value={logType} onChange={(e) => setLogType(e.target.value)}>
                  {["Revision", "Change", "Correction"].map((x) => <option key={x}>{x}</option>)}
                </select>
                <input className={input + " flex-1 min-w-[150px]"} placeholder="What changed?" value={logText} onChange={(e) => setLogText(e.target.value)} />
                <button onClick={addLogEntry} className="px-4 rounded-lg font-semibold" style={{ background: C.green }}>Add</button>
              </div>
              {shopLog.map((l, i2) => (
                <div key={i2} className="text-xs py-1.5 border-b border-neutral-800"><b style={{ color: l.type === "Correction" ? "#f0b356" : l.type === "Change" ? "#9be3a0" : "#ddd" }}>{l.type}</b> · {l.ts} {l.by && "· " + l.by} — {l.text}</div>
              ))}
              {shopLog.length === 0 && <div className="text-xs text-neutral-500">No entries yet — the first one is yours.</div>}
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="flex items-center gap-2 mb-2"><User size={15} style={{ color: C.green }} /><span className="text-sm font-bold">Customer</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={input} placeholder="Name" value={meta.customer.name} onChange={(e) => setMeta({ ...meta, customer: { ...meta.customer, name: e.target.value } })} />
                <input className={input} placeholder="Phone" value={meta.customer.phone} onChange={(e) => setMeta({ ...meta, customer: { ...meta.customer, phone: e.target.value } })} />
                <input className={input} placeholder="Email" value={meta.customer.email} onChange={(e) => setMeta({ ...meta, customer: { ...meta.customer, email: e.target.value } })} />
                <input className={input} placeholder="Address" value={meta.customer.address} onChange={(e) => setMeta({ ...meta, customer: { ...meta.customer, address: e.target.value } })} />
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-neutral-300">
                  <input type="checkbox" checked={meta.customer.notify !== false} onChange={(e) => setMeta({ ...meta, customer: { ...meta.customer, notify: e.target.checked } })} />
                  Customer OK'd text/email updates
                </label>
                <button onClick={sendUpdate} disabled={meta.customer.notify === false} className="ml-auto px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-40" style={{ background: C.green }}>Text status update</button>
              </div>
              <div className="text-[10px] text-neutral-500 mt-1">Get their OK before texting (TCPA) — this toggle is your consent record. See the compliance guide.</div>
              <button onClick={() => setShowInsurance(!showInsurance)} className="text-xs mt-2 flex items-center gap-1" style={{ color: C.green }}>
                <ShieldCheck size={13} /> {showInsurance ? "Hide" : "Add"} insurance / claim info
              </button>
              {showInsurance && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input className={input} placeholder="Insurance company" value={meta.insurance.company} onChange={(e) => setMeta({ ...meta, insurance: { ...meta.insurance, company: e.target.value } })} />
                  <input className={input} placeholder="Claim #" value={meta.insurance.claim} onChange={(e) => setMeta({ ...meta, insurance: { ...meta.insurance, claim: e.target.value } })} />
                <input className={input} placeholder="Warranty company (if warranty job)" value={meta.warrCo || ""} onChange={(e) => setMeta({ ...meta, warrCo: e.target.value })} />
                <input className={input} placeholder="Warranty contract / claim #" value={meta.warrNum || ""} onChange={(e) => setMeta({ ...meta, warrNum: e.target.value })} />
                  <input className={input} placeholder="Adjuster" value={meta.insurance.adjuster} onChange={(e) => setMeta({ ...meta, insurance: { ...meta.insurance, adjuster: e.target.value } })} />
                  <input className={input} placeholder="Deductible" value={meta.insurance.deductible} onChange={(e) => setMeta({ ...meta, insurance: { ...meta.insurance, deductible: e.target.value } })} />
                </div>
              )}
            </div>

            <div className="rounded-md p-3" style={card}>
              <div className="flex items-center gap-2 mb-2"><User size={15} style={{ color: C.green }} /><span className="text-sm font-bold">Customer history</span>
                <button onClick={lookupHistory} className="ml-auto px-3 py-1 rounded text-xs font-semibold" style={{ background: C.green }}>Look up</button>
              </div>
              {history === null
                ? <div className="text-[11px] text-neutral-500">Type the customer's name or phone above, then Look up — every prior job, what was done, and what they paid.</div>
                : history.length === 0
                  ? <div className="text-xs text-neutral-500">No prior jobs found on this device. Shared history across every phone turns on with the Supabase database (see the guide).</div>
                  : <div className="space-y-1">{history.map((h, i) => (
                      <div key={i} className="text-xs py-1 border-b border-neutral-800">
                        <b>{h.meta && h.meta.number}</b> · {h.savedAt ? h.savedAt.slice(0, 10) : ""} · {(h.vehicle && h.vehicle.ymm) || "-"} · {money((h.totals && h.totals.grand) || 0)} · {h.folder || "New"}
                        <div className="text-neutral-500">{(h.rows || []).filter((r) => r.desc).map((r) => r.desc).slice(0, 4).join(" · ")}</div>
                      </div>
                    ))}</div>}
            </div>

            <div className="rounded-md p-3" style={card}>
              <div className="flex items-center gap-2 mb-2"><FileText size={15} style={{ color: C.green }} /><span className="text-sm font-bold">Estimate details</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><span className={label}>Estimate #</span><input className={input} value={meta.number} onChange={(e) => setMeta({ ...meta, number: e.target.value })} /></div>
                <div><span className={label}>Date</span><input className={input} type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></div>
                <div><span className={label}>Expires</span><input className={input} type="date" value={meta.expiration} onChange={(e) => setMeta({ ...meta, expiration: e.target.value })} /></div>
              </div>
              <div className="mt-2"><span className={label}>Estimator / technician</span><input className={input} value={meta.estimator} onChange={(e) => setMeta({ ...meta, estimator: e.target.value })} /></div>
            </div>

            <span className={label}>What are we fixing?</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)} className="px-3 py-1.5 rounded text-xs font-semibold"
                  style={{ background: category === c.key ? C.green : "#262626", color: category === c.key ? "#fff" : "#bbb" }}>{c.label}</button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><span className={label}>{isLawn ? "Make / Model" : "Year / Make / Model"}</span>
                <input className={input} value={vehicle.ymm} onChange={(e) => setVehicle({ ...vehicle, ymm: e.target.value })} /></div>
              <div><span className={label}>{isLawn ? "Serial #" : "VIN"}</span>
                <div className="flex gap-1">
                  <input className={input} value={vehicle.id} onChange={(e) => setVehicle({ ...vehicle, id: e.target.value })} />
                  {!isLawn && (
                    <button onClick={decodeVin} title="Decode VIN — fills year/make/model from the free NHTSA database"
                      className="px-2 rounded border border-neutral-700 text-neutral-300 shrink-0 text-[10px] font-bold" style={{ background: "#262626" }}>
                      {vinBusy ? <Loader2 size={14} className="animate-spin" /> : "VIN→"}
                    </button>
                  )}
                  {!isLawn && (
                    <button onClick={startScan} title="Scan the VIN barcode with the camera" className="px-2 rounded border border-neutral-700 shrink-0 text-neutral-300" style={{ background: "#262626" }}><Camera size={14} /></button>
                  )}
                </div></div>
              <div><span className={label}>{isLawn ? "Engine hours" : "Mileage"}</span>
                <input className={input} value={vehicle.use} onChange={(e) => setVehicle({ ...vehicle, use: e.target.value })} /></div>
            </div>

            {isCar && (
              <div><span className={label}>Job type</span>
                <div className="flex rounded overflow-hidden border border-neutral-700 text-xs">
                  {[["both", "Both"], ["collision", "Collision"], ["mechanical", "Mechanical"]].map(([v, l]) => (
                    <button key={v} onClick={() => setJobType(v)} className="flex-1 py-1.5"
                      style={{ background: jobType === v ? C.green : "#262626", color: jobType === v ? "#fff" : "#bbb" }}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-md p-3" style={card}>
              <div className="flex items-center gap-2">
                <MapPin size={15} style={{ color: C.green }} /><span className={label + " mb-0"}>Job area &amp; rate</span>
                <button onClick={() => setShowAreas(!showAreas)} className="ml-auto text-xs text-neutral-400 flex items-center gap-1">Manage <ChevronDown size={13} className={showAreas ? "rotate-180" : ""} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <select className={input} value={activeArea} onChange={(e) => setActiveArea(Number(e.target.value))}>
                  {areas.map((a, i) => <option key={i} value={i}>{a.label || `Area ${i + 1}`}</option>)}
                </select>
                <div className="flex items-center px-3 rounded-lg bg-neutral-800 border-2 min-h-[52px]" style={{ borderColor: rateNum ? C.green : "#6b520c" }}>
                  <span className="text-neutral-400 text-lg mr-1">$</span>
                  <input className="w-full bg-transparent focus:outline-none py-2 text-xl font-bold" inputMode="decimal"
                    placeholder={settings.defaultRate ? "default: " + settings.defaultRate : "rate/hr"}
                    value={areas[activeArea]?.rate || ""} onChange={(e) => setAreas(areas.map((a, i) => i === activeArea ? { ...a, rate: e.target.value } : a))} />
                  <span className="text-neutral-500 text-sm">/hr</span>
                </div>
              </div>
              {showAreas && (
                <div className="mt-3 space-y-2 border-t border-neutral-700 pt-3">
                  {areas.map((a, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={input} placeholder="Area / ZIP" value={a.label} onChange={(e) => setAreas(areas.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                      <input className={input + " w-24"} placeholder="rate" inputMode="decimal" value={a.rate} onChange={(e) => setAreas(areas.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                      {areas.length > 1 && <button onClick={() => { setAreas(areas.filter((_, j) => j !== i)); setActiveArea(0); }} className="text-neutral-500 hover:text-red-400"><X size={15} /></button>}
                    </div>
                  ))}
                  <button onClick={() => setAreas([...areas, { label: "", rate: settings.defaultRate || "" }])} className="text-sm py-2 flex items-center gap-1" style={{ color: "#9be3a0" }}><Plus size={15} /> Add area (starts at your default rate)</button>
                </div>
              )}
            </div>

            <div className="rounded-md p-3" style={card}>
              <div className="flex items-center gap-2">
                <Store size={15} style={{ color: C.green }} /><span className={label + " mb-0"}>Local parts — {CATEGORIES.find((c) => c.key === category)?.label}</span>
                <button onClick={() => setShowLocal(!showLocal)} className="ml-auto text-xs text-neutral-400 flex items-center gap-1">{showLocal ? "Hide" : "Show"} <ChevronDown size={13} className={showLocal ? "rotate-180" : ""} /></button>
              </div>
              {showLocal && (
                <div className="mt-2 space-y-2">
                  {localList.map((s, i) => (<div key={i} className="text-xs"><div className="font-semibold text-neutral-100">{s.name}</div><div className="text-neutral-400">{s.meta}</div></div>))}
                  <div className="text-[10px] text-neutral-500 pt-1 border-t border-neutral-700">Independents have no live inventory API — call to confirm.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ PHOTOS & AI TAB ============ */}
        {tab === "Photo Estimate" && (
          <div className="space-y-3">
            <div className="flex gap-2 items-start rounded-md px-3 py-2 text-[13px]" style={{ background: "#3a2c07", border: "1px solid #6b520c" }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: C.amber }} />
              <span className="text-amber-100">Drafted items land in a <b>staging area</b> below — nothing reaches the quote until you approve it line by line. Labor hours are drafted estimates, not certified guide times — verify against your licensed labor guide (MOTOR/Mitchell/ALLDATA; Autodata for overseas coverage).</span>
            </div>

            <div><span className={label}>Photos (used for estimate + diagnosis)</span>
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded overflow-hidden border border-neutral-700">
                    <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute top-0 right-0 bg-black/70 p-0.5"><X size={12} /></button>
                  </div>
                ))}
                <button onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded border-2 border-dashed border-neutral-600 flex flex-col items-center justify-center text-neutral-400 text-[10px]"><Camera size={20} /><span className="mt-1">Add</span></button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={onFiles} className="hidden" />
              </div>
            </div>

            <button onClick={analyze} disabled={busy} className="w-full py-3 rounded-md font-bold flex items-center justify-center gap-2" style={{ background: busy ? "#444" : C.green }}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Wrench size={18} />}{busy ? "Reading the photos…" : "Analyze photos & draft estimate"}
            </button>

            {staged.length > 0 && (
              <div className="rounded-md p-3" style={{ background: C.panel, border: `1px solid ${C.amber}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold">Staged AI suggestions — review each</span>
                  <button onClick={approveAllStaged} className="text-xs px-2 py-1 rounded" style={{ background: C.green }}>Approve all</button>
                </div>
                <div className="space-y-2">
                  {staged.map((s) => (
                    <div key={s.sid} className="rounded p-2" style={{ background: "#262626", border: `1px solid ${s.confidence === "high" ? C.green : s.confidence === "med" ? C.amber : C.red}` }}>
                      <div className="text-sm font-semibold">{s.operation}{s.partName ? ` — ${s.partName}` : ""}</div>
                      <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded uppercase font-bold" style={{ background: OP_GROUPS.find(g=>g.key===s.opGroup)? "#3d3d3d":"#3d3d3d" }}>{s.opGroup}</span>
                        <span className="text-neutral-400">confidence: {s.confidence}</span>
                        <span className="text-neutral-400">{s.laborHours} hrs</span>
                        {s.needsTeardown && <span className="px-1.5 py-0.5 rounded font-bold" style={{ background: C.red, color: "#fff" }}>needs teardown</span>}
                      </div>
                      {s.note && <div className="text-[11px] text-neutral-500 mt-1">{s.note}</div>}
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => approveStaged(s.sid)} className="flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1" style={{ background: C.green }}><Check size={13} /> Approve &amp; add</button>
                        <button onClick={() => rejectStaged(s.sid)} className="px-3 py-1.5 rounded text-xs border border-neutral-600">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diagnosis */}
            <div className="rounded-md p-3" style={{ background: C.panel, border: `1px solid ${C.maroon}` }}>
              <div className="flex items-center gap-2 mb-2"><Stethoscope size={16} style={{ color: "#9be3a0" }} /><span className="text-sm font-bold">Diagnosis</span></div>
              <div className="mb-2"><span className={label}>Customer complaint / symptom</span><input className={input} value={complaint} onChange={(e) => setComplaint(e.target.value)} /></div>
              <div className="mb-2"><span className={label}>Recent work / notes</span><input className={input} value={recentWork} onChange={(e) => setRecentWork(e.target.value)} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                <div><span className={label}>Low psi</span><input className={input} inputMode="decimal" value={readings.low} onChange={(e) => setReadings({ ...readings, low: e.target.value })} /></div>
                <div><span className={label}>High psi</span><input className={input} inputMode="decimal" value={readings.high} onChange={(e) => setReadings({ ...readings, high: e.target.value })} /></div>
                <div><span className={label}>Vent °F</span><input className={input} inputMode="decimal" value={readings.vent} onChange={(e) => setReadings({ ...readings, vent: e.target.value })} /></div>
                <div><span className={label}>Amb °F</span><input className={input} inputMode="decimal" value={readings.ambient} onChange={(e) => setReadings({ ...readings, ambient: e.target.value })} /></div>
              </div>
              <button onClick={getDiagnostics} disabled={dxBusy} className="w-full py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2" style={{ background: dxBusy ? "#444" : C.maroon }}>
                {dxBusy ? <Loader2 size={16} className="animate-spin" /> : <Stethoscope size={16} />}{dxBusy ? "Diagnosing…" : "Get diagnostic tips"}
              </button>
              <button onClick={() => { try { navigator.clipboard.writeText([vehicle.ymm, complaint].filter(Boolean).join(" — ")); } catch (e) {} window.open("https://www.identifix.com", "_blank"); }} className="mt-2 w-full py-2 rounded-md text-sm font-semibold border border-neutral-600 text-neutral-200">Open Identifix Direct-Hit (copies vehicle + complaint)</button>
              <button onClick={() => { setRows((rs) => [...rs, mkRow({ desc: "Warranty diagnostics — cause & correction documented for the warranty administrator", hours: "1" })]); setErr("Warranty-diagnostic line added to Line Items."); setTimeout(() => setErr(""), 2500); }} className="mt-2 w-full py-2 rounded-md text-sm font-semibold border border-neutral-600 text-neutral-200">＋ Warranty diagnostic line (cause &amp; correction)</button>
              <button onClick={draftFixFromJob} className="mt-2 w-full py-2 rounded-md text-sm font-semibold" style={{ background: C.green }}>✅ Publish this repair as a confirmed fix (customer info stripped)</button>
              {dxTips.length > 0 && (
                <div className="mt-3 space-y-2">
                  {dxTips.map((t, i) => (
                    <div key={i} className="rounded p-2 text-xs" style={{ background: "#262626", borderLeft: `3px solid ${pri(t.priority)}` }}>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold" style={{ background: pri(t.priority), color: "#111" }}>{t.priority}</span>
                        <span className="font-semibold text-neutral-100">{t.check}</span>
                      </div>
                      {t.why && <div className="text-neutral-400 mt-1">{t.why}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md p-3 text-xs text-neutral-400" style={card}>Customer photos, videos, labels &amp; comments now live on the <b className="text-neutral-200">Media</b> tab.</div>
          </div>
        )}

        {/* ============ LINE ITEMS TAB ============ */}
        {tab === "Line Items" && (
          <div className="space-y-2">
            <div className="rounded-md p-3" style={card}>
              <span className={label}>Quick add from your service menu</span>
              <select className={input} value="" onChange={(e) => { addFromMenu(e.target.value); e.target.value = ""; }}>
                <option value="">Pick a service…</option>
                {SERVICE_MENU.map((m, i) => (
                  <option key={i} value={i}>{m.label}{m.flat != null ? ` — $${m.flat}` : ` — ${m.hrs} hr labor + parts`}</option>
                ))}
              </select>
              <div className="text-[10px] text-neutral-500 mt-1">Flat services add at your set price; hourly ones price at this area's labor rate — add parts on the line after.</div>
            </div>
            {OP_GROUPS.map((g) => {
              const glist = rows.filter((r) => r.opGroup === g.key);
              if (!glist.length) return null;
              const gt = groupTotals[g.key];
              return (
                <div key={g.key}>
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wide text-neutral-400 mt-3 mb-1">
                    <span>{g.label}</span><span>{money(gt.parts + gt.labor)}</span>
                  </div>
                  {glist.map((r) => {
                    const p = priceFor(r), labor = num(r.hrs) * rateNum;
                    return (
                      <div key={r.id} className="rounded-md p-2.5 mb-2" style={{ background: C.panel, border: `1px solid ${r.aiDraft ? "#6b520c" : C.line}` }}>
                        <div className="flex items-start gap-2">
                          <input className={input + " flex-1"} placeholder="Operation / description" value={r.desc} onChange={(e) => setRow(r.id, "desc", e.target.value)} />
                          <select className={input + " w-32"} value={r.opGroup} onChange={(e) => setRow(r.id, "opGroup", e.target.value)}>
                            {OP_GROUPS.map((og) => <option key={og.key} value={og.key}>{og.label}</option>)}
                          </select>
                          <button onClick={() => delRow(r.id)} className="p-1.5 text-neutral-500 hover:text-red-400"><Trash2 size={16} /></button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px]">
                          {r.aiDraft && <span className="px-1.5 py-0.5 rounded" style={{ background: C.amber, color: "#3a2c07" }}>AI DRAFT · APPROVED</span>}
                          {r.confidence && <span className="text-neutral-400">confidence: {r.confidence}</span>}
                          <label className="flex items-center gap-1 text-neutral-400"><input type="checkbox" checked={r.teardown} onChange={(e) => setRow(r.id, "teardown", e.target.checked)} /> needs teardown</label>
                          {r.note && <span className="text-neutral-500">{r.note}</span>}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div><span className={label}>Condition</span>
                            <select className={input} value={r.condition} onChange={(e) => setRow(r.id, "condition", e.target.value)}>
                              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                          <div><span className={label}>Part #</span><input className={input} value={r.part} onChange={(e) => setRow(r.id, "part", e.target.value)} /></div>
                          <div><span className={label}>Supplier</span><input className={input} value={r.supplier} onChange={(e) => setRow(r.id, "supplier", e.target.value)} /></div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                          <div><span className={label}>Cost</span>
                            <div className="flex gap-1">
                              <input className={input} inputMode="decimal" value={r.cost} onChange={(e) => setRow(r.id, "cost", e.target.value)} />
                              <button onClick={() => lookupPrice(r.id)} title="Ballpark cost" className="px-2 rounded border border-neutral-700 text-neutral-300 shrink-0" style={{ background: "#262626" }}>
                                {r.priceBusy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                              </button>
                              <button onClick={() => openPartsTech(r)} title="Copy this line & open PartsTech" className="px-2 rounded border border-neutral-700 text-[9px] font-black shrink-0" style={{ background: "#262626", color: "#9be3a0" }}>PT</button>
                              <button onClick={() => openRepairLink(r)} title="Copy this line & open RepairLink (OEM parts)" className="px-2 rounded border border-neutral-700 text-[9px] font-black shrink-0" style={{ background: "#262626", color: "#fcd9a1" }}>RL</button>
                            </div>
                          </div>
                          <div><span className={label}>Markup %</span><input className={input} inputMode="decimal" value={r.markup} disabled={r.manualPrice} onChange={(e) => setRow(r.id, "markup", e.target.value)} /></div>
                          <div><span className={label}>Customer price {r.manualPrice ? "(manual)" : "(auto)"}</span>
                            <input className={input} inputMode="decimal" value={r.manualPrice ? r.price : p.toFixed(2)}
                              onFocus={() => setRow(r.id, "manualPrice", true)}
                              onChange={(e) => setRow(r.id, "price", e.target.value)} />
                          </div>
                          <div><span className={label}>Core charge</span><input className={input} inputMode="decimal" value={r.core} onChange={(e) => setRow(r.id, "core", e.target.value)} /></div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div><span className={label}>Labor hrs</span><input className={input} inputMode="decimal" value={r.hrs} onChange={(e) => setRow(r.id, "hrs", e.target.value)} /></div>
                          <div><span className={label}>Availability</span><input className={input} value={r.availability} onChange={(e) => setRow(r.id, "availability", e.target.value)} /></div>
                          <div><span className={label}>Price date</span><input className={input} type="date" value={r.priceDate} onChange={(e) => setRow(r.id, "priceDate", e.target.value)} /></div>
                        </div>
                        {r.priceSrc && <div className="text-[10px] mt-1" style={{ color: C.amber }}>{r.priceSrc}</div>}
                        <div className="flex justify-end gap-4 mt-2 text-xs text-neutral-400"><span>Labor {money(labor)}</span><span className="text-neutral-100 font-semibold">Line {money(p + labor)}</span></div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <button onClick={() => setRows([...rows, mkRow()])} className="mt-2 w-full py-2 rounded-md border border-neutral-700 text-sm text-neutral-300 flex items-center justify-center gap-2"><Plus size={16} /> Add line manually</button>
          </div>
        )}

        {/* ============ CUSTOMER VIEW TAB ============ */}
        {tab === "Customer View" && (
          <div className="print-area rounded-md p-4 bg-white text-black">
            <div className="flex justify-between items-start border-b-2 pb-3 mb-3" style={{ borderColor: C.maroon }}>
              <div><div className="text-2xl font-black" style={{ color: C.maroon }}>{BRAND.name}</div><div className="text-xs italic" style={{ color: C.green }}>{BRAND.tagline}</div></div>
              <div className="text-right text-xs"><div className="font-bold">Estimate #{meta.number}</div><div>{meta.date} · expires {meta.expiration}</div><div className="uppercase font-bold mt-1" style={{ color: C.maroon }}>{meta.status}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs mb-3">
              <div><b>Customer:</b> {meta.customer.name || "-"}<br />{meta.customer.phone || ""} {meta.customer.email || ""}</div>
              <div><b>Vehicle:</b> {vehicle.ymm || "-"}<br />{isLawn ? "Serial" : "VIN"}: {vehicle.id || "-"} · {isLawn ? "Hrs" : "Mi"}: {vehicle.use || "-"}</div>
            </div>
            {meta.insurance.company && <div className="text-xs mb-3"><b>Insurance:</b> {meta.insurance.company} · Claim# {meta.insurance.claim}</div>}
            <table className="w-full text-xs border-collapse mb-3">
              <thead><tr className="border-b-2" style={{ borderColor: "#ccc" }}><th className="text-left py-1">Description</th><th className="text-left py-1">Condition</th><th className="text-right py-1">Parts</th><th className="text-right py-1">Labor</th><th className="text-right py-1">Total</th></tr></thead>
              <tbody>
                {rows.filter((r) => r.desc).map((r) => {
                  const p = priceFor(r), labor = num(r.hrs) * rateNum;
                  return (<tr key={r.id} className="border-b" style={{ borderColor: "#eee" }}>
                    <td className="py-1">{r.desc}{r.teardown ? " (pending teardown confirmation)" : ""}</td>
                    <td className="py-1">{r.condition}</td><td className="py-1 text-right">{money(p)}</td><td className="py-1 text-right">{money(labor)}</td><td className="py-1 text-right font-semibold">{money(p + labor)}</td>
                  </tr>);
                })}
              </tbody>
            </table>
            <div className="flex justify-end mb-4"><div className="w-64 text-xs">
              <div className="flex justify-between py-0.5"><span>Parts</span><span>{money(totals.partsSub)}</span></div>
              <div className="flex justify-between py-0.5"><span>Labor</span><span>{money(totals.laborSub)}</span></div>
              <div className="flex justify-between py-0.5"><span>Sublet</span><span>{money(num(sublet))}</span></div>
              <div className="flex justify-between py-0.5"><span>Supplies</span><span>{money(num(supplies))}</span></div>
              {num(paintMat) > 0 && <div className="flex justify-between py-0.5"><span>Paint &amp; materials</span><span>{money(num(paintMat))}</span></div>}
              <div className="flex justify-between py-0.5"><span>Tax</span><span>{money(totals.tax)}</span></div>
              <div className="flex justify-between py-1 font-black text-sm mt-1" style={{ background: C.maroon, color: "#fff", padding: "6px 8px", borderRadius: 4 }}><span>GRAND TOTAL</span><span>{money(totals.grand)}</span></div>
            </div></div>
            <div className="text-[10px] text-neutral-600 border-t pt-2 mb-3">
              <p>Estimate only. Hidden or additional damage found at teardown may require a supplement before work continues.</p>
              <p>Warranty: 12 months / 12,000 miles on parts &amp; labor, whichever comes first.</p>
              <p>Parts prices subject to supplier availability at time of order. Replaced parts are available for return upon request.</p>
              <p>No work beyond this written estimate will be performed without the customer's prior authorization.</p>
            </div>
            <div className="border-t pt-3 no-print">
              <div className="text-xs font-bold mb-2">Authorization to proceed — before any repair begins</div>
              <label className="flex items-center gap-2 text-xs mb-2"><input type="checkbox" checked={authorized} onChange={(e) => { setAuthorized(e.target.checked); if (e.target.checked && !authDate) setAuthDate(todayStr()); }} /> Customer authorizes Peaceful Motors to perform the work described above at the price quoted. No additional work will be performed without further approval.</label>
              {authorized && (
                <div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input className="border rounded px-2 py-1 text-xs" placeholder="Customer full name" value={authName} onChange={(e) => setAuthName(e.target.value)} />
                    <input className="border rounded px-2 py-1 text-xs" type="date" value={authDate} onChange={(e) => setAuthDate(e.target.value)} />
                  </div>
                  {settings.requireSig && !sigTyped ? (
                    <div>
                      <div className="text-[10px] text-neutral-600 mb-1">Sign below with your finger or mouse:</div>
                      <canvas ref={sigRef} width={560} height={140}
                        className="w-full border rounded bg-white touch-none" style={{ borderColor: "#999", touchAction: "none" }}
                        onPointerDown={sigStart} onPointerMove={sigMove} onPointerUp={sigEnd} onPointerLeave={sigEnd} />
                      <div className="flex gap-3 mt-1 text-[11px]">
                        <button onClick={sigClear} className="underline text-neutral-600">Clear &amp; re-sign</button>
                        <button onClick={() => setSigTyped(true)} className="underline text-neutral-600">Trouble signing? Type instead</button>
                        {sigData && <span style={{ color: C.green }} className="font-bold">✓ signature captured</span>}
                      </div>
                    </div>
                  ) : settings.requireSig && (
                    <div className="text-[11px]">Typed signature accepted (pad skipped). <button onClick={() => setSigTyped(false)} className="underline text-neutral-600">Use the signature pad instead</button></div>
                  )}
                </div>
              )}
              <div className="text-[10px] text-neutral-500 mt-1">A drawn or typed signature here is your work-authorization record. For insurance or court-grade e-signatures with audit trails, use a dedicated e-sign service — have your attorney confirm what your jobs require.</div>
            </div>
            {authorized && (authName || sigData) && (
              <div className="hidden print:block text-xs mt-4">
                Authorized by: <b>{authName || "customer"}</b> on {authDate}
                {sigData && !sigTyped && <img src={sigData} alt="signature" style={{ height: 60, display: "block", marginTop: 4 }} />}
              </div>
            )}
          </div>
        )}

        {/* ============ INVOICE TAB ============ */}
        {tab === "Invoice" && (
          <div className="space-y-3">
            <div className="rounded-md p-3 no-print" style={card}>
              <div className="text-sm font-bold mb-2">Final invoice — flows from your approved lines</div>
              {rows.filter((r) => r.desc).length === 0 && (
                <div className="text-xs rounded px-3 py-2 mb-2" style={{ background: "#3a2c07", border: "1px solid #6b520c", color: "#fcd9a1" }}>
                  No line items yet. Snap photos on the Photos &amp; AI tab, approve the drafted lines, and they populate this invoice automatically.
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div><span className={label}>Invoice #</span><input className={input} placeholder={meta.number.replace("PM-", "INV-")} value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} /></div>
                <div><span className={label}>Status</span>
                  <select className={input} value={inv.status} onChange={(e) => setInv({ ...inv, status: e.target.value })}>
                    <option value="due">BALANCE DUE</option><option value="paid">PAID</option>
                  </select></div>
                <div><span className={label}>Service call $</span><input className={input} inputMode="decimal" value={inv.serviceCall} onChange={(e) => setInv({ ...inv, serviceCall: e.target.value })} /></div>
                <div><span className={label}>Diag credit $</span><input className={input} inputMode="decimal" value={inv.diagCredit} onChange={(e) => setInv({ ...inv, diagCredit: e.target.value })} /></div>
              </div>
              <button onClick={() => setTimeout(() => window.print(), 150)} className="mt-3 w-full py-2.5 rounded font-bold flex items-center justify-center gap-2" style={{ background: C.maroon }}><Printer size={16} /> Print / Save PDF invoice</button>
              <button onClick={sendInvoiceEmail} className="mt-2 w-full py-2.5 rounded font-bold flex items-center justify-center gap-2" style={{ background: C.green }}><Mail size={16} /> Send invoice by email</button>
              {inv.status === "due" && (settings.stripeLink || "").startsWith("http") && (
                <button onClick={() => { try { navigator.clipboard.writeText(settings.stripeLink); } catch (e) {} window.open(settings.stripeLink, "_blank"); }} className="mt-2 w-full py-2.5 rounded font-bold flex items-center justify-center gap-2" style={{ background: "#1a5fb4" }}>$ Collect payment — Stripe (link copied to text the customer)</button>
              )}
              {inv.status === "due" && (settings.altPayLink || "").startsWith("http") && (
                <button onClick={() => { try { navigator.clipboard.writeText(settings.altPayLink); } catch (e) {} window.open(settings.altPayLink, "_blank"); }} className="mt-2 w-full py-2.5 rounded font-bold flex items-center justify-center gap-2" style={{ background: "#5b21b6" }}>$ Collect via {settings.altPayName || "alt processor"}</button>
              )}
              {inv.status === "paid" && (
                <button onClick={queueCarfax} className="w-full py-2 rounded-lg text-sm font-semibold border border-neutral-600 text-neutral-200 mb-2">🚗 Queue this repair for CARFAX (vehicle + services only — never customer info)</button>
              )}
              {inv.status === "paid" && (
                <button onClick={logJobTimes} className="w-full py-2 rounded-lg text-sm font-semibold border border-neutral-600 text-neutral-200 mb-2">📊 Log this job's times to the labor guide</button>
              )}
              {inv.status === "paid" && meta.customer.notify !== false && (
                <button onClick={() => { const msg = "Thank you for choosing " + BRAND.name + "! If we earned it, a quick Google review means the world: " + (settings.reviewLink || ""); sendTextSmart(meta.customer.phone || "", msg); }} className="mt-2 w-full py-2.5 rounded font-bold flex items-center justify-center gap-2" style={{ background: C.green }}>★ Request a Google review by text</button>
              )}
              {askEmail && (
                <div className="mt-2 rounded p-2" style={{ background: "#262626" }}>
                  <span className={label}>Which email should this default to?</span>
                  <div className="flex gap-2">
                    <input className={input} placeholder="name@example.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
                    <button onClick={() => { if (emailTo.includes("@")) { const sNew = { ...settings, defaultEmail: emailTo.trim() }; setSettings(sNew); store.set("settings:shop", sNew); setAskEmail(false); setErr("Default email saved — hit Send again."); setTimeout(() => setErr(""), 3000); } }} className="px-3 rounded text-sm font-semibold" style={{ background: C.green }}>Save</button>
                    <button onClick={() => setAskEmail(false)} className="px-2 rounded border border-neutral-600 text-sm">✕</button>
                  </div>
                </div>
              )}
            </div>

            <div className="print-area rounded-md p-4 bg-white text-black">
              <div className="flex justify-between items-start border-b-2 pb-3 mb-3" style={{ borderColor: C.maroon }}>
                <div>
                  <div className="text-2xl font-black" style={{ color: C.maroon }}>{BRAND.name}</div>
                  <div className="text-xs italic" style={{ color: C.green }}>{BRAND.tagline}</div>
                  <div className="text-[10px] text-neutral-600 mt-1">{BRAND.phone} · {BRAND.email} · {BRAND.site}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-black text-xl" style={{ color: C.maroon }}>INVOICE</div>
                  <div>#{inv.number || meta.number.replace("PM-", "INV-")}</div>
                  <div>{meta.date}</div>
                  <div className="inline-block font-black mt-1 px-3 py-1 rounded-full text-[11px]"
                    style={inv.status === "paid" ? { background: "#EAF4E6", color: C.green, border: `1.5px solid ${C.green}` } : { background: "#FDECEC", color: "#B3261E", border: "1.5px solid #B3261E" }}>
                    {inv.status === "paid" ? "PAID — THANK YOU" : "BALANCE DUE"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs mb-3">
                <div><b>Billed to:</b> {meta.customer.name || "-"}<br />{meta.customer.phone || ""} {meta.customer.email || ""}</div>
                <div><b>Vehicle:</b> {vehicle.ymm || "-"}<br />{isLawn ? "Serial" : "VIN"}: {vehicle.id || "-"} · {isLawn ? "Hrs" : "Mi"}: {vehicle.use || "-"}</div>
              </div>
              <table className="w-full text-xs border-collapse mb-3">
                <thead><tr className="border-b-2" style={{ borderColor: "#ccc" }}><th className="text-left py-1">Description</th><th className="text-right py-1">Parts</th><th className="text-right py-1">Labor</th><th className="text-right py-1">Total</th></tr></thead>
                <tbody>
                  {rows.filter((r) => r.desc).map((r) => {
                    const p = priceFor(r), labor = num(r.hrs) * rateNum;
                    return (<tr key={r.id} className="border-b" style={{ borderColor: "#eee" }}>
                      <td className="py-1">{r.desc}</td><td className="py-1 text-right">{money(p)}</td><td className="py-1 text-right">{money(labor)}</td><td className="py-1 text-right font-semibold">{money(p + labor)}</td>
                    </tr>);
                  })}
                </tbody>
              </table>
              <div className="flex justify-end mb-4"><div className="w-64 text-xs">
                <div className="flex justify-between py-0.5"><span>Parts</span><span>{money(totals.partsSub)}</span></div>
                <div className="flex justify-between py-0.5"><span>Labor ({money(rateNum)}/hr)</span><span>{money(totals.laborSub)}</span></div>
                {num(sublet) > 0 && <div className="flex justify-between py-0.5"><span>Sublet</span><span>{money(num(sublet))}</span></div>}
                {num(supplies) > 0 && <div className="flex justify-between py-0.5"><span>Shop supplies</span><span>{money(num(supplies))}</span></div>}
                {num(paintMat) > 0 && <div className="flex justify-between py-0.5"><span>Paint &amp; materials</span><span>{money(num(paintMat))}</span></div>}
                {num(inv.serviceCall) > 0 && <div className="flex justify-between py-0.5"><span>Mobile service call</span><span>{money(num(inv.serviceCall))}</span></div>}
                {totals.tax > 0 && <div className="flex justify-between py-0.5"><span>Tax</span><span>{money(totals.tax)}</span></div>}
                {num(inv.diagCredit) > 0 && <div className="flex justify-between py-0.5"><span>Diagnostic credit</span><span>−{money(num(inv.diagCredit))}</span></div>}
                <div className="flex justify-between py-1.5 px-3 font-black text-sm mt-1 rounded" style={{ background: C.maroon, color: "#fff" }}><span>TOTAL {inv.status === "paid" ? "PAID" : "DUE"}</span><span>{money(invTotal)}</span></div>
              </div></div>
              <div className="text-[10px] text-neutral-600 border-t pt-2">
                <p className="mb-1"><b>We accept:</b> All major cards (Stripe) · Apple Pay · Google Pay · Cash App Pay · Klarna · Cash</p>
                <p className="mb-1">Warranty: 12 months / 12,000 miles on parts &amp; labor, whichever comes first. Labor-only guarantee on customer-supplied parts. Replaced parts available for return upon request.</p>
                <p className="mb-1">Serviced by: {meta.estimator || currentTech.name}. Thank you — referrals earn $25 off your next service or a free oil change.</p>
                <div className="flex gap-8 mt-5 text-neutral-500">
                  <div className="flex-1 border-t pt-1" style={{ borderColor: "#999" }}>Customer signature</div>
                  <div className="flex-1 border-t pt-1" style={{ borderColor: "#999" }}>Date</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ MEDIA TAB ============ */}
        {tab === "Media" && (
          <div className="space-y-3">
            <div className="rounded-md p-3" style={card}>
              <div className="flex items-center gap-2 mb-1"><ImagePlus size={16} style={{ color: C.green }} /><span className="text-sm font-bold">Customer media — photos &amp; videos</span></div>
              <div className="text-[11px] text-neutral-500 mb-2">Label each shot, leave a comment the customer will read, then download the report and text or email that one file — works from phone, tablet, or computer. Keep videos short (under ~20 MB); text big ones directly.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {custPhotos.map((p, i) => (
                  <div key={i} className="rounded-md p-2" style={{ background: "#262626", border: `1px solid ${C.line}` }}>
                    <div className="relative rounded overflow-hidden border border-neutral-700">
                      {p.kind === "video"
                        ? <video controls className="w-full max-h-48" src={p.dataUrl} />
                        : <img src={p.dataUrl} alt="" className="w-full max-h-48 object-cover" />}
                      <button onClick={() => setCustPhotos(custPhotos.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/70 rounded p-1"><X size={13} /></button>
                    </div>
                    <input className={input + " mt-2"} placeholder="Label (e.g. RF rotor — before)" value={p.caption || ""} onChange={(e) => setCustPhotos(custPhotos.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))} />
                    <textarea className={input + " mt-1"} rows={2} placeholder="Comment for the customer…" value={p.comment || ""} onChange={(e) => setCustPhotos(custPhotos.map((x, j) => j === i ? { ...x, comment: e.target.value } : x))} />
                  </div>
                ))}
                <button onClick={() => custRef.current?.click()} className="min-h-32 rounded border-2 border-dashed border-neutral-600 flex flex-col items-center justify-center text-neutral-400 text-xs"><Camera size={22} /><span className="mt-1">Add photo / video</span></button>
                <input ref={custRef} type="file" accept="image/*,video/*" capture="environment" multiple onChange={onCustFiles} className="hidden" />
              </div>
              <button onClick={downloadCustomerReport} className="mt-3 w-full py-2.5 rounded font-bold flex items-center justify-center gap-2" style={{ background: C.maroon }}><Download size={16} /> Download customer report (share by text/email)</button>
            </div>
          </div>
        )}

        {/* ============ ADMIN TAB ============ */}
        {tab === "Admin" && (
          <div className="space-y-3">
            <div className="rounded-md p-3" style={card}>
              <div className="text-base font-black mb-1" style={{ color: "#9be3a0" }}>ACCOUNT SETTINGS (YOU)</div>
              <div className="text-[11px] text-neutral-500 mb-2">Your own login — separate from the shop-wide settings below.</div>
              {currentTech && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input className={input} value={currentTech.name} disabled title="Name changes: owner edits the roster" />
                  <input className={input} placeholder="My email" inputMode="email" value={(techs.find((t) => t.name === currentTech.name) || {}).email || ""} onChange={(e) => saveTechs(techs.map((t) => t.name === currentTech.name ? { ...t, email: e.target.value } : t))} />
                  <input className={input} placeholder="My PIN" value={pinDrafts.me ?? ""} onChange={(e) => setPinDrafts({ ...pinDrafts, me: e.target.value })} onBlur={() => commitPinDraft("me", (t) => t.name === currentTech.name)} />
                </div>
              )}
            </div>
            {currentTech && currentTech.admin && (
              <div className="rounded-md p-3" style={card}>
                <div className="text-base font-black mb-1" style={{ color: "#9be3a0" }}>SUBSCRIBED SHOPS (MASTER VIEW)</div>
                <div className="flex items-center gap-2 text-sm py-1.5 border-b border-neutral-800"><span className="flex-1"><b>{BRAND.name}</b> <span className="text-[11px] text-neutral-500">— this deployment · owner: {(techs.find((t) => t.admin) || {}).name || "-"}</span></span><span className="text-[10px] font-black px-2 py-1 rounded-full text-white" style={{ background: C.green }}>ACTIVE</span></div>
                <div className="text-[10px] text-neutral-500 mt-2">Every subscribing shop lists here with plan, status, and a support jump-in — populated from the shops table the moment cloud accounts switch on. The master login sees all shops; each owner sees only their own.</div>
              </div>
            )}
            {currentTech && currentTech.admin && (
              <div className="rounded-md p-3" style={card}>
                <div className="text-base font-black mb-1" style={{ color: "#9be3a0" }}>PLATFORM BUILD LOG (OWNER ONLY)</div>
                {RELEASE_NOTES.map((r, i2) => (
                  <div key={i2} className="text-xs py-1.5 border-b border-neutral-800"><b className="text-neutral-300">{r[0]}</b> — <span className="text-neutral-500">{r[1]}</span></div>
                ))}
                <div className="text-[10px] text-neutral-500 mt-2">Owner logins only; at the cloud tier this panel is master-admin only. Shop-facing notes live in Help → Shop update log.</div>
              </div>
            )}
            {(settings.features || {}).shield === true && currentTech && currentTech.admin && (
              <div className="rounded-md p-3" style={card}>
                <div className="text-base font-black mb-1" style={{ color: "#9be3a0" }}>BUSINESS SHIELD — LEGAL TEMPLATE LIBRARY</div>
                <div className="text-[11px] text-neutral-500 mb-2">Owner-only. Copy or email any template to a tech; signed copies go in the shop's legal folder. Starting points — the shop's attorney finalizes wording.</div>
                {SHIELD_DOCS.map((d, i) => (
                  <div key={i} className="py-2 border-b border-neutral-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <b className="text-sm flex-1">{d[0]}</b>
                      <button onClick={() => { try { navigator.clipboard.writeText(d[1]); setErr("Template copied."); setTimeout(() => setErr(""), 2000); } catch (e) {} }} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: "#262626", color: "#9be3a0" }}>Copy</button>
                      <select className={input + " w-40"} defaultValue="" onChange={(e) => { const t = techs[Number(e.target.value)]; if (t && t.email) { window.location.href = "mailto:" + t.email + "?subject=" + encodeURIComponent(BRAND.name + " — " + d[0]) + "&body=" + encodeURIComponent(d[1]); } else if (t) { setErr("No email saved for " + t.name + " — add one on the roster."); } e.target.value = ""; }}>
                        <option value="">Email to tech…</option>
                        {techs.map((t, j) => <option key={j} value={j}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-1">{d[1].slice(0, 110)}…</div>
                  </div>
                ))}
              </div>
            )}
            {!currentTech.admin ? (
              <div className="rounded-md p-3 text-sm" style={card}>Admin is owner-only. Ask {techs.find((t) => t.admin)?.name || "the owner"} to make roster changes.</div>
            ) : (
              <>
                <div className="rounded-md p-3" style={card}>
                  <div className="text-base font-black mb-2" style={{ color: "#9be3a0" }}>TECHNICIAN LOGINS</div>
                  {techs.map((t, i) => (
                    <div key={i} className="flex items-center flex-wrap gap-2 text-sm py-1.5 border-b border-neutral-800">
                      <span className="flex-1">{t.name} {t.admin && <span className="text-[10px] px-1.5 py-0.5 rounded ml-1" style={{ background: C.green }}>admin</span>}</span>
                      <select className={input + " w-32"} title="Role (feeds cloud-tier permissions)" value={t.role || (t.admin ? "Owner" : "Technician")} onChange={(e) => saveTechs(techs.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}>
                        {["Owner", "Manager", "Service Advisor", "Technician", "Independent Contractor", "Apprentice"].map((r) => <option key={r}>{r}</option>)}
                      </select>
                      <input className={input + " w-24"} title="Pay ($/hr — owner reference; payroll runs outside the app)" placeholder="pay" inputMode="decimal" value={t.pay || ""} onChange={(e) => saveTechs(techs.map((x, j) => j === i ? { ...x, pay: e.target.value } : x))} />
                      <input className={input + " w-40"} title="Email for PIN resets" placeholder="email" inputMode="email" value={t.email || ""} onChange={(e) => saveTechs(techs.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                      <input className={input + " w-24"} title="Set new PIN" placeholder="••••" value={pinDrafts[i] ?? ""} onChange={(e) => setPinDrafts({ ...pinDrafts, [i]: e.target.value })} onBlur={() => commitPinDraft(i, (x, j) => j === i)} />
                      {!t.admin && <button onClick={() => saveTechs(techs.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400"><Trash2 size={15} /></button>}
                    </div>
                  ))}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                    <input className={input} placeholder="Tech name" value={newTech.name} onChange={(e) => setNewTech({ ...newTech, name: e.target.value })} />
                    <input className={input} placeholder="PIN (4+ digits)" inputMode="numeric" value={newTech.pin} onChange={(e) => setNewTech({ ...newTech, pin: e.target.value })} />
                    <input className={input} placeholder="Email (for PIN resets)" inputMode="email" value={newTech.email || ""} onChange={(e) => setNewTech({ ...newTech, email: e.target.value })} />
                  </div>
                  <button onClick={async () => {
                    if (newTech.name && newTech.pin.trim().length >= 4) {
                      const t = { name: newTech.name, pin: newTech.pin.trim(), email: (newTech.email || "").trim(), admin: false };
                      // Same button, one more wire (Task 1): /api/roster
                      // invites the tech by email so they get a real login,
                      // attaches them to this shop with their role, and
                      // returns a hash so the roster stores no plaintext
                      // PIN. If the route is unreachable (preview/offline),
                      // the roster add still happens exactly as before.
                      try {
                        const r = await fetch("/api/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: t.name, email: t.email, role: "Technician", pin: t.pin }) });
                        if (r.ok) { const d = await r.json(); if (d.pinHash) { t.pinHash = d.pinHash; delete t.pin; } }
                      } catch (e) {}
                      saveTechs([...techs, t]); setNewTech({ name: "", pin: "", email: "" }); setErr("");
                    }
                    else setErr("Tech needs a name and a PIN of at least 4 digits.");
                  }} className="mt-2 w-full py-2 rounded text-sm font-semibold" style={{ background: C.green }}>Add technician</button>
                </div>
                <div className="rounded-md p-3" style={card}>
                  <div className="text-sm font-bold mb-1">Shop settings — permanent defaults</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div><span className={label}>Default labor rate $/hr</span><input className={input} inputMode="decimal" value={settings.defaultRate} onChange={(e) => setSettings({ ...settings, defaultRate: e.target.value })} /></div>
                    <div><span className={label}>Parts gross profit / markup %</span><input className={input} inputMode="decimal" value={settings.defaultMarkup} onChange={(e) => setSettings({ ...settings, defaultMarkup: e.target.value })} /></div>
                    <div><span className={label}>Default send-to email</span><input className={input} placeholder="name@example.com" value={settings.defaultEmail} onChange={(e) => setSettings({ ...settings, defaultEmail: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <div><span className={label}>Stripe payment link (Collect payment button)</span><input className={input} placeholder="https://buy.stripe.com/..." value={settings.stripeLink || ""} onChange={(e) => setSettings({ ...settings, stripeLink: e.target.value })} /></div>
                    <div><span className={label}>Google review link (review request text)</span><input className={input} value={settings.reviewLink || ""} onChange={(e) => setSettings({ ...settings, reviewLink: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <div><span className={label}>Alt processor name (360 Payments / APS…)</span><input className={input} placeholder="360 Payments" value={settings.altPayName || ""} onChange={(e) => setSettings({ ...settings, altPayName: e.target.value })} /></div>
                    <div><span className={label}>Alt processor pay link / virtual terminal URL</span><input className={input} placeholder="https://…" value={settings.altPayLink || ""} onChange={(e) => setSettings({ ...settings, altPayLink: e.target.value })} /></div>
                  </div>
                  <label className="flex items-center gap-2 text-sm mt-3">
                    <input type="checkbox" checked={settings.requireSig} onChange={(e) => setSettings({ ...settings, requireSig: e.target.checked })} />
                    Require customer signature (finger-drawn) before starting the repair
                  </label>
                  <label className="flex items-center gap-2 text-sm mt-2">
                    <input type="checkbox" checked={!!settings.locationOn} onChange={(e) => setSettings({ ...settings, locationOn: e.target.checked })} />
                    Enable tech location sharing (opt-in GPS for dispatch ETAs)
                  </label>
                  <label className="flex items-center gap-2 text-sm mt-2">
                    <input type="checkbox" checked={settings.msgMaster !== false} onChange={(e) => setSettings({ ...settings, msgMaster: e.target.checked })} />
                    Customer messaging enabled shop-wide (off = no texts leave this shop; a customer's own opt-out is never overridden)
                  </label>
                  <label className="flex items-center gap-2 text-sm mt-2">
                    <input type="checkbox" checked={settings.assistantPro !== false} onChange={(e) => setSettings({ ...settings, assistantPro: e.target.checked })} />
                    Assistant Master Elite — master-level depth, built to help masters (flagship tier)
                  </label>
                  <div className="text-[10px] text-neutral-500 mt-1">Optional on purpose — if the pad gives you trouble in the field, a typed-name fallback is always one tap away on the estimate.</div>
                  <button onClick={saveSettings} className="mt-2 w-full py-2 rounded text-sm font-semibold" style={{ background: C.green }}>{setMsg || "Save settings"}</button>
                  <div className="text-[10px] text-neutral-500 mt-1">Markup applies to every new line from now on; the rate fills any area without one. Existing lines keep what they have.</div>
                </div>
                <div className="rounded-md p-3" style={card}>
                  <div className="text-base font-black mb-1" style={{ color: "#9be3a0" }}>PARTS MARKUP BY ZIP</div>
                  <div className="text-[11px] text-neutral-500 mb-2">Market guidance: 40–50% parts GP is the common range; denser metro ZIPs support the high end. Applies when the job area's label contains the ZIP. Only admins on YOUR deployment can edit this — cross-shop lockdown (nobody else's shop touching your ZIP rules) ships with the cloud accounts.</div>
                  {(settings.zipMarkups || []).map((z, i) => (
                    <div key={i} className="flex gap-2 mb-1">
                      <input className={input} placeholder="ZIP" value={z.zip} onChange={(e) => setSettings({ ...settings, zipMarkups: settings.zipMarkups.map((x, j) => j === i ? { ...x, zip: e.target.value } : x) })} />
                      <input className={input} placeholder="markup %" inputMode="decimal" value={z.markup} onChange={(e) => setSettings({ ...settings, zipMarkups: settings.zipMarkups.map((x, j) => j === i ? { ...x, markup: e.target.value } : x) })} />
                      <button onClick={() => setSettings({ ...settings, zipMarkups: settings.zipMarkups.filter((_, j) => j !== i) })} className="text-neutral-500 hover:text-red-400"><X size={15} /></button>
                    </div>
                  ))}
                  <button onClick={() => setSettings({ ...settings, zipMarkups: [...(settings.zipMarkups || []), { zip: "", markup: "45" }] })} className="text-xs flex items-center gap-1 mt-1" style={{ color: "#9be3a0" }}><Plus size={13} /> Add ZIP rule</button>
                  <div className="text-[10px] text-neutral-500 mt-2">Hit Save settings above to keep changes.</div>
                </div>
                <div className="rounded-md p-3" style={card}>
                  <div className="text-base font-black mb-1" style={{ color: "#9be3a0" }}>LABOR GUIDES &amp; WIRING — SUBSCRIPTIONS</div>
                  <label className="flex items-center gap-2 text-sm mb-2">
                    <input type="checkbox" checked={!!settings.guidesOn} onChange={(e) => setSettings({ ...settings, guidesOn: e.target.checked })} />
                    Show the Guides tab to techs
                  </label>
                  {GUIDE_SOURCES.map((g) => (
                    <label key={g.key} className="flex items-center gap-2 text-xs py-1 text-neutral-300">
                      <input type="checkbox" checked={!!(settings.guideSubs && settings.guideSubs[g.key])}
                        onChange={(e) => setSettings({ ...settings, guideSubs: { ...(settings.guideSubs || {}), [g.key]: e.target.checked } })} />
                      {g.name}
                    </label>
                  ))}
                  <div className="text-[10px] text-neutral-500 mt-1">Check only what you actually pay for — Guides opens YOUR portals; no guide content is copied into the app (copyright-clean, acquisition-safe). Save settings above.</div>
                </div>
                <div className="rounded-md p-3" style={card}>
                  <div className="text-base font-black mb-1" style={{ color: "#9be3a0" }}>FEATURE SWITCHES (THIS SHOP)</div>
                  <div className="text-[11px] text-neutral-500 mb-2">Turn whole sections on or off for this shop. Off = the tab disappears for every tech here. With cloud accounts, the master admin flips these per subscriber shop from one screen.</div>
                  {[["bookings", "Bookings board + online booking requests"],
                    ["parts", "Parts catalog + supplier launchers"],
                    ["ai", "Photo Estimate estimating"],
                    ["media", "Media — photos/videos + customer report"],
                    ["portal", "Customer portal (login-screen entrance)"],
                    ["fixes", "Peacefully Accurate — confirmed-fix library"],
                    ["custCommunity", "Customer community (portal login area)"],
                    ["community", "Community — shop message board + parts swap"],
                    ["integrations", "Integrations — PartsTech / RepairLink credentials"],
                    ["dashboard", "Dashboard — saved estimates + backup"]].map(([k, lbl]) => (
                    <label key={k} className="flex items-center gap-2 text-sm py-1">
                      <input type="checkbox" checked={(settings.features || {})[k] !== false} onChange={(e) => setSettings({ ...settings, features: { ...(settings.features || {}), [k]: e.target.checked } })} />
                      {lbl}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm py-1">
                    <input type="checkbox" checked={(settings.features || {}).academy === true} onChange={(e) => setSettings({ ...settings, features: { ...(settings.features || {}), academy: e.target.checked } })} />
                    Academy — in-house training modules (premium; priced per tech)
                  </label>
                  <label className="flex items-center gap-2 text-sm py-1">
                    <input type="checkbox" checked={(settings.features || {}).shield === true} onChange={(e) => setSettings({ ...settings, features: { ...(settings.features || {}), shield: e.target.checked } })} />
                    Business Shield — legal template library (premium)
                  </label>
                  <div className="text-[10px] text-neutral-500 mt-1">Guides and tech GPS have their own switches above. Premium switches are honest client-side toggles today; tamper-proof per-shop entitlement enforcement lands server-side with cloud accounts. Hit Save settings.</div>
                </div>
                <div className="rounded-md p-3" style={card}>
                  <div className="text-base font-black mb-1" style={{ color: "#9be3a0" }}>SHOP TEXTING NUMBER</div>
                  <div className="text-[11px] text-neutral-500 mb-2">Your shop's own number for outbound texts. Straight facts: numbers run about $1.15/mo plus usage on the Twilio account, and U.S. business texting requires A2P 10DLC brand/campaign registration — an approval measured in days, not minutes. On the deployed site with Twilio keys, the button buys your number and saves it here; every text then sends from it. Each subscriber shop gets its own number the same way — platform-provisioned per shop at the cloud tier.</div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <div className="text-sm font-bold" style={{ color: settings.smsFrom ? "#9be3a0" : "#888" }}>{settings.smsFrom || "No number yet"}</div>
                    <input className={input + " w-28"} placeholder="Area code" inputMode="numeric" value={acode} onChange={(e) => setAcode(e.target.value)} />
                    <button onClick={getShopNumber} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: C.green }}>{acqBusy ? "…" : "Get my shop number"}</button>
                  </div>
                  <input className={input + " w-full mt-2"} placeholder="Or paste a number you already own (+1314…)" value={settings.smsFrom || ""} onChange={(e) => setSettings({ ...settings, smsFrom: e.target.value })} />
                </div>
                {settings.locationOn && (
                  <div className="rounded-md p-3" style={card}>
                    <div className="flex items-center gap-2 mb-2"><MapPin size={15} style={{ color: C.green }} /><span className="text-base font-black" style={{ color: "#9be3a0" }}>TECH LOCATIONS — DISPATCH</span>
                      <button onClick={refreshLocs} className="ml-auto px-3 py-1 rounded text-xs font-semibold" style={{ background: C.green }}>Refresh</button>
                    </div>
                    {locList.length === 0 && <div className="text-xs text-neutral-500">No techs sharing yet. Techs opt in from the bar under the tabs — sharing is consent-based and they can stop anytime.</div>}
                    {locList.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-neutral-800">
                        <span className="flex-1"><b>{l.tech}</b> · {l.ts ? l.ts.slice(11, 16) + " UTC" : ""}</span>
                        <button onClick={() => window.open(`https://www.google.com/maps?q=${l.lat},${l.lng}`, "_blank")} className="px-3 py-1 rounded font-semibold" style={{ background: "#262626", color: "#9be3a0" }}>Map</button>
                      </div>
                    ))}
                    <div className="text-[10px] text-neutral-500 mt-2">This device shows techs saved here; with the Supabase cloud database on, every shop's techs feed one table and the master admin (you) sees all locations across all shops. Legal ground rules: written consent, work hours only, revocable anytime, disclosed in your policy — see Compliance_Roadmap.md; attorney signs off.</div>
                  </div>
                )}
                <div className="rounded-md p-3 text-[11px] text-neutral-400" style={card}>
                  Straight talk: PIN login stamps every estimate to the right tech and keeps casual eyes out. It is NOT bank-grade security — anyone holding an unlocked device can get past it. Password-protect the deployed site in your host's settings (free), and when you go multi-crew we add real per-user accounts.
                </div>
              </>
            )}
          </div>
        )}

        {/* ============ HELP TAB ============ */}
        {tab === "Help" && (
          <div className="rounded-md p-4 text-sm leading-relaxed" style={card}>
            <div className="text-base font-bold mb-2">How to use Peaceful OS</div>
            <ol className="list-decimal ml-5 space-y-2 text-neutral-300">
              <li><b>Log in</b> with your name + PIN. The owner adds techs on the Admin tab.</li>
              <li><b>Details</b> — customer, vehicle (tap <b>VIN→</b> to auto-fill from the VIN), insurance if it's a claim, job area &amp; labor rate.</li>
              <li><b>Photos &amp; AI</b> — snap the damage or problem and hit <b>Analyze</b>. Claude drafts line items into a staging list. <b>Approve each line you agree with</b> — nothing hits the quote until you do. Diagnostic tips work the same way from photos + your gauge readings.</li>
              <li><b>Line Items</b> — quick-add from the service menu, set cost + markup (customer price calculates automatically), tap the magnifier for a ballpark cost. Always confirm real prices with your supplier before quoting.</li>
              <li><b>Customer View</b> — the branded estimate. Print / Save PDF from the bottom bar and get the customer's authorization.</li>
              <li><b>Invoice</b> — your approved lines flow in automatically. Set the service call and diagnostic credit, mark PAID when collected, print or save the PDF.</li>
              <li><b>Save</b> stamps the job to you and feeds the Dashboard. <b>Email</b> opens your mail app prefilled to the shop inbox.</li>
              <li><b>Media</b> — label photos, leave comments the customer reads, attach short videos, then <b>Download customer report</b> and text or email that one file. Works from phone, tablet, or computer.</li>
              <li><b>PartsTech &amp; backup</b> — the <b>PT</b> button on any line copies the vehicle + part and opens PartsTech (paste into its search after login). Dashboard's <b>Backup</b> downloads everything as one JSON file, and Save auto-emails each estimate to the shop inbox on the deployed site.</li>
              <li><b>Put it on your phone:</b> open the deployed site → browser menu → <b>Add to Home Screen</b>. It installs like an app, camera and all.</li>
            </ol>
            <div className="mt-3 text-[11px] text-neutral-500">Rules of the road: AI lines are drafts — you approve them. Ballpark prices are starting points — confirm before quoting. Photos and readings beat memory — take them.</div>
          </div>
        )}

        {/* ============ BOOKINGS TAB ============ */}
        {tab === "Bookings" && (
          <div className="space-y-3">
            {replyDraft && (
              <div className="rounded-md p-3" style={{ ...card, border: `1px solid ${C.green}` }}>
                <div className="text-sm font-bold mb-1">Drafted reply + ballpark — you edit, you send</div>
                <div className="text-[11px] text-neutral-500 mb-2">To: {replyDraft.name} · {replyDraft.pref === "email" ? (replyDraft.email || "no email on request") : replyDraft.phone} · customer prefers {replyDraft.pref === "email" ? "EMAIL ✉" : "TEXT 📱"}</div>
                <div className="text-xs mb-2"><b className="text-neutral-400">Probable causes (drafted — verify on inspection):</b> {replyDraft.causes.join(" · ")} <b className="text-neutral-400 ml-2">Ballpark:</b> <span style={{ color: "#9be3a0" }}>{money(replyDraft.lo)}–{money(replyDraft.hi)}</span></div>
                <textarea className={input + " w-full"} rows={5} value={replyDraft.msg} onChange={(e) => setReplyDraft({ ...replyDraft, msg: e.target.value })} />
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button onClick={() => sendTextSmart(replyDraft.phone, replyDraft.msg)} className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: C.green }}>Send by text</button>
                  <button onClick={sendDraftEmail} className="px-3 py-2 rounded-lg text-sm font-semibold border border-neutral-600">Send by email</button>
                  <button onClick={() => { const bk = bookings.find((b2) => b2.key === replyDraft.key); if (bk) bookingToEstimate(bk); }} className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: C.maroon }}>Open as estimate</button>
                  <button onClick={() => setReplyDraft(null)} className="px-3 py-2 rounded-lg text-sm border border-neutral-600">Close</button>
                </div>
                <div className="text-[10px] text-neutral-500 mt-1">Nothing sends until you tap send. The message keeps the STOP line; ballparks are drafted ranges, never quotes.</div>
              </div>
            )}
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-2">New booking</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input className={input} placeholder="Customer name" value={bkForm.name} onChange={(e) => setBkForm({ ...bkForm, name: e.target.value })} />
                <input className={input} placeholder="Phone" value={bkForm.phone} onChange={(e) => setBkForm({ ...bkForm, phone: e.target.value })} />
                <input className={input} placeholder="Vehicle" value={bkForm.vehicle} onChange={(e) => setBkForm({ ...bkForm, vehicle: e.target.value })} />
                <input className={input} type="date" value={bkForm.date} onChange={(e) => setBkForm({ ...bkForm, date: e.target.value })} />
                <input className={input} type="time" value={bkForm.time} onChange={(e) => setBkForm({ ...bkForm, time: e.target.value })} />
                <select className={input} value={bkForm.tech} onChange={(e) => setBkForm({ ...bkForm, tech: e.target.value })}>
                  <option value="">Assign tech…</option>
                  {techs.map((t, i) => <option key={i} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <input className={input + " mt-2"} placeholder="Notes (what's it doing, where's the vehicle)" value={bkForm.notes} onChange={(e) => setBkForm({ ...bkForm, notes: e.target.value })} />
              <button onClick={saveBooking} className="mt-2 w-full py-2 rounded text-sm font-semibold" style={{ background: C.green }}>Add booking</button>
              <div className="text-[10px] text-neutral-500 mt-1">This board is now self-sufficient: customers book straight from your customer portal (they land here as “Requested” — confirm to Scheduled and text them). Point your website's Book buttons at your deployed portal URL and Setmore becomes optional. Automated confirmation/reminder texts arrive with the Twilio upgrade (prompt #4).</div>
            </div>
            <div className="rounded-md p-3" style={{ background: C.panel, border: `2px solid ${C.green}` }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-black tracking-widest" style={{ color: "#9be3a0" }}>📅 SCHEDULE</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#262626", color: "#bbb" }}>{bookings.filter((b2) => b2.status !== "Done" && b2.status !== "Cancelled").length} open</span>
              </div>
              {bookings.length === 0 && <div className="text-sm text-neutral-500 py-2">No bookings yet — add one above, or they land here when customers book from your portal.</div>}
              {bookings.filter((b2) => b2.status === "Requested").map((bk) => (
                <div key={bk.key} className="rounded-lg p-3 mb-2" style={{ background: "#3a2c07", border: "1.5px solid #b8860b" }}>
                  <div className="text-sm font-bold text-amber-100">🌐 NEW REQUEST — {bk.name || "-"} · {bk.vehicle || "-"} {bk.verified && <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "#2E7D32", color: "#fff" }}>✓ VERIFIED</span>} <span className="text-[9px] text-neutral-400">{bk.pref === "email" ? "✉ prefers email" : "📱 prefers text"}</span></div>
                    {bk.photos && bk.photos.length > 0 && (
                      <div className="flex gap-1 mt-1">{bk.photos.map((p, pi) => <img key={pi} src={p} className="h-14 w-14 object-cover rounded" alt="customer" />)}</div>
                    )}
                    {bk.ball && <div className="text-[10px] text-neutral-500 mt-1">Customer saw first look: {bk.ball.causes.join(", ")} · {money(bk.ball.lo)}–{money(bk.ball.hi)}</div>}
                  <div className="text-xs mt-0.5" style={{ color: "#e8d5a0" }}>{bk.date} {bk.time} · {bk.phone || ""}{bk.notes ? " · " + bk.notes : ""}</div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setBookingStatus(bk.key, "Scheduled")} className="flex-1 py-2.5 rounded-lg text-sm font-bold" style={{ background: C.green }}>✓ Confirm booking</button>
                    <button onClick={() => autoDraft(bk)} className="px-3 py-2.5 rounded-lg text-sm font-bold" style={{ background: "#1a5fb4" }}>⚡ Draft reply</button>
                    <button onClick={() => setBookingStatus(bk.key, "Cancelled")} className="px-3 py-2.5 rounded-lg text-sm border border-neutral-600">Decline</button>
                  </div>
                </div>
              ))}
              {[...new Set(bookings.filter((b2) => b2.status !== "Requested").map((b2) => b2.date || ""))].map((d) => (
                <div key={d}>
                  <div className="text-[11px] font-black uppercase tracking-wider mt-3 mb-1.5 py-1.5 px-2 rounded" style={{ background: "#262626", color: d === todayStr() ? "#9be3a0" : "#999" }}>{d === todayStr() ? "⭐ TODAY — " + d : d}</div>
                  {bookings.filter((b2) => (b2.date || "") === d && b2.status !== "Requested").map((bk) => (
                    <div key={bk.key} className="rounded-lg p-3 mb-2" style={{ background: "#262626", borderLeft: `4px solid ${bk.status === "Done" ? "#666" : bk.status === "Cancelled" ? "#B3261E" : C.green}` }}>
                      <div className="flex items-center gap-2">
                        <b className="flex-1 text-sm">{bk.time ? bk.time + " · " : ""}{bk.name || "-"} — {bk.vehicle || "-"}</b>
                        <span className="text-[10px] font-black px-2 py-1 rounded-full" style={{ background: bk.status === "Scheduled" ? C.green : bk.status === "Done" ? "#555" : "#B3261E", color: "#fff" }}>{(bk.status || "Scheduled").toUpperCase()}</span>
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{bk.source === "portal" ? "🌐 online · " : ""}{bk.tech ? "Tech: " + bk.tech + " · " : ""}{bk.phone || ""}{bk.notes ? " · " + bk.notes : ""}</div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <button onClick={() => bookingToEstimate(bk)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: C.maroon }}>Start estimate</button>
                        {bk.status === "Scheduled" && <button onClick={() => bookingText(bk, "otw")} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "#1a5fb4" }}>🚗 On my way</button>}
                        {bk.status === "Scheduled" && <button onClick={() => bookingText(bk, "rem")} className="px-3 py-2 rounded-lg text-xs font-semibold border border-neutral-600">Remind</button>}
                        {bk.status === "Scheduled" && <button onClick={() => setBookingStatus(bk.key, "Done")} className="px-3 py-2 rounded-lg text-xs font-semibold border border-neutral-600">Mark done</button>}
                        {bk.status !== "Cancelled" && bk.status !== "Done" && <button onClick={() => setBookingStatus(bk.key, "Cancelled")} className="px-3 py-2 rounded-lg text-xs text-neutral-400 border border-neutral-700">Cancel</button>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============ PARTS TAB ============ */}
        {tab === "Parts" && (
          <div className="space-y-3">
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">My parts catalog — your negotiated prices</div>
              <div className="text-[11px] text-neutral-500 mb-2">Build your book here: every part you price through RepairLink, dealer wholesale, or a counter deal gets saved with YOUR cost and YOUR price — that's the parts margin for your parts guy. Straight talk: nobody can hand you "all OEM parts at discounted prices" in one database — OEM discounts come from your RepairLink + dealer wholesale accounts, and this catalog is where those wins accumulate.</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <input className={input} placeholder="Description" value={ptForm.desc} onChange={(e) => setPtForm({ ...ptForm, desc: e.target.value })} />
                <input className={input} placeholder="Part #" value={ptForm.part} onChange={(e) => setPtForm({ ...ptForm, part: e.target.value })} />
                <input className={input} placeholder="Source" value={ptForm.source} onChange={(e) => setPtForm({ ...ptForm, source: e.target.value })} />
                <input className={input} placeholder="Cost $" inputMode="decimal" value={ptForm.cost} onChange={(e) => setPtForm({ ...ptForm, cost: e.target.value })} />
                <input className={input} placeholder="Sell $ (opt)" inputMode="decimal" value={ptForm.price} onChange={(e) => setPtForm({ ...ptForm, price: e.target.value })} />
              </div>
              <button onClick={addMyPart} className="mt-2 w-full py-2 rounded text-sm font-semibold" style={{ background: C.green }}>Save to my catalog</button>
              {myParts.length > 0 && <div className="mt-3">
                {myParts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-neutral-800">
                    <span className="flex-1"><b>{p.desc}</b> {p.part && "· " + p.part} {p.source && "· " + p.source} {p.cost && "· cost $" + p.cost}{p.price && " · sell $" + p.price}</span>
                    <button onClick={() => partToEstimate(p)} className="px-2 py-1 rounded font-semibold" style={{ background: C.green }}>Add to estimate</button>
                    <button onClick={() => delMyPart(i)} className="text-neutral-500 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>}
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-2">Parts sources — one tap</div>
              {[["PartsTech", "https://app.partstech.com", "aftermarket, multi-supplier — free"],
                ["RepairLink", "https://repairlinkshop.com", "OEM dealer parts at wholesale/discount — free"],
                ["Nexpart", "https://nexpart.com", "WHI aftermarket network — free"],
                ["RockAuto", "https://www.rockauto.com", "online aftermarket, deep catalog"],
                ["Copart", "https://www.copart.com", "salvage/recycled — body panels & assemblies"],
                ["RepairPal", "https://repairpal.com", "market repair-price reference (sanity-check your quotes)"]].map(([nm, url, d]) => (
                <div key={nm} className="flex items-center gap-2 text-sm py-1.5 border-b border-neutral-800">
                  <span className="flex-1"><b>{nm}</b> <span className="text-[11px] text-neutral-500">— {d}</span></span>
                  <button onClick={() => window.open(url, "_blank")} className="px-3 py-1 rounded text-xs font-semibold" style={{ background: C.green }}>Open</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============ GUIDES TAB ============ */}
        {tab === "Guides" && (
          <div className="space-y-3">
            {!settings.guidesOn ? (
              <div className="rounded-md p-3 text-sm text-neutral-400" style={card}>The owner hasn't turned on the Guides page yet (Admin → Labor guides &amp; wiring).</div>
            ) : (
              <>
                <div className="rounded-md p-3" style={card}>
                  <div className="text-sm font-bold mb-2">Labor guides &amp; wiring schematics — your paid subscriptions</div>
                  {GUIDE_SOURCES.filter((g) => settings.guideSubs && settings.guideSubs[g.key]).length === 0 && (
                    <div className="text-xs text-neutral-500">No subscriptions marked yet — the owner checks them in Admin.</div>
                  )}
                  {GUIDE_SOURCES.filter((g) => settings.guideSubs && settings.guideSubs[g.key]).map((g) => (
                    <div key={g.key} className="flex items-center gap-2 text-sm py-1.5 border-b border-neutral-800">
                      <span className="flex-1">{g.name}</span>
                      <button onClick={() => window.open(g.url, "_blank")} className="px-3 py-1 rounded text-xs font-semibold" style={{ background: C.green }}>Open</button>
                    </div>
                  ))}
                </div>
                <div className="rounded-md p-3 text-[11px] text-neutral-400" style={card}>
                  Coverage map (every class that's legally coverable): MOTOR + ProDemand = US/Canada cars &amp; light trucks · ALLDATA = OEM procedures &amp; wiring · TruckSeries = Class 4–8 diesel · HaynesPro + Autodata = UK/EU and broad overseas · lawn &amp; equipment = manufacturer flat-rate guides. These open YOUR licensed portals — no guide content lives in this app, which is exactly what keeps it copyright-clean and sellable.
                </div>
              </>
            )}
          </div>
        )}

        {/* ============ FIXES TAB — PEACEFULLY ACCURATE ============ */}
        {tab === "Fixes & Times" && (
          <div className="space-y-3">
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">Peacefully Accurate — confirmed fixes from real jobs</div>
              <div className="text-[11px] text-neutral-500 mb-2">Your shop's own repair intelligence: symptom → cause → correction → real hours, customer information stripped automatically. At the cloud tier every subscribing shop's fixes join one searchable network — the database nobody can buy, only build. Community-generated: verify against the vehicle in front of you before relying on any entry.</div>
              <input className={input} placeholder="Search year/make/model or symptom… (e.g. Silverado no-start)" value={fixQ} onChange={(e) => setFixQ(e.target.value)} />
              {fixes.filter((f) => !fixQ.trim() || (f.ymm + " " + f.complaint + " " + f.cause + " " + f.correction).toLowerCase().includes(fixQ.toLowerCase())).map((f, i) => (
                <div key={i} className="py-2 border-b border-neutral-800 text-xs">
                  <div className="flex items-center gap-2"><b className="text-sm flex-1" style={{ color: "#9be3a0" }}>{f.ymm}{f.engine && " · " + f.engine}</b><span className="text-neutral-500">{f.ts} · {f.by}</span><button onClick={() => confirmFix(i)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: "#262626", color: "#9be3a0" }} title="I did this fix and it worked">👍 {f.confirms || 1}</button></div>
                  {f.complaint && <div className="mt-1"><b className="text-neutral-400">Complaint:</b> {f.complaint}</div>}
                  {f.cause && <div><b className="text-neutral-400">Cause:</b> {f.cause}</div>}
                  <div><b className="text-neutral-400">Correction:</b> {f.correction}</div>
                  <div className="text-neutral-500 mt-0.5">{f.hours && "Real hours: " + f.hours}{f.parts && " · Parts: " + f.parts}</div>
                </div>
              ))}
              {fixes.length === 0 && <div className="text-xs text-neutral-500 mt-2">Empty today, priceless in a year — publish your first fix with the ✅ button under Diagnosis on the Details tab after any job.</div>}
            </div>
            {fixDraft && (
              <div className="rounded-md p-3" style={{ ...card, border: `1px solid ${C.green}` }}>
                <div className="text-sm font-bold mb-2">Publish confirmed fix — review before it enters the library</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className={input} placeholder="Vehicle (Y/M/M)" value={fixDraft.ymm} onChange={(e) => setFixDraft({ ...fixDraft, ymm: e.target.value })} />
                  <input className={input} placeholder="Engine (opt)" value={fixDraft.engine} onChange={(e) => setFixDraft({ ...fixDraft, engine: e.target.value })} />
                  <input className={input} placeholder="Complaint / symptom" value={fixDraft.complaint} onChange={(e) => setFixDraft({ ...fixDraft, complaint: e.target.value })} />
                  <input className={input} placeholder="Root cause" value={fixDraft.cause} onChange={(e) => setFixDraft({ ...fixDraft, cause: e.target.value })} />
                </div>
                <textarea className={input + " w-full mt-2"} rows={2} placeholder="Correction (what fixed it)" value={fixDraft.correction} onChange={(e) => setFixDraft({ ...fixDraft, correction: e.target.value })} />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input className={input} placeholder="Real hours" inputMode="decimal" value={fixDraft.hours} onChange={(e) => setFixDraft({ ...fixDraft, hours: e.target.value })} />
                  <input className={input} placeholder="Parts used (names only)" value={fixDraft.parts} onChange={(e) => setFixDraft({ ...fixDraft, parts: e.target.value })} />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={publishFix} className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ background: C.green }}>Publish to library</button>
                  <button onClick={() => setFixDraft(null)} className="px-4 py-2 rounded-lg text-sm border border-neutral-600">Discard</button>
                </div>
                <div className="text-[10px] text-neutral-500 mt-1">No customer name, phone, address, or VIN is included — fixes describe vehicles, never people.</div>
              </div>
            )}
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">Peaceful Times — your real-world labor guide</div>
              <div className="text-[11px] text-neutral-500 mb-2">How it builds itself, in the open: finish a job → tap "Log this job's times" on the PAID invoice → entries land here → the guide shows LOW · TYPICAL · HIGH from real wrenches, not book estimates. At the cloud tier every shop's times merge, and the guide gets smarter every day.</div>
              <div className="flex gap-2 flex-wrap mb-2">
                <input className={input + " flex-1 min-w-[140px]"} placeholder="Search jobs… (brakes, alternator)" value={timeQ} onChange={(e) => setTimeQ(e.target.value)} />
                {timesG.some((t) => t.by === "SAMPLE")
                  ? <button onClick={clearTimeSamples} className="px-3 rounded-lg text-xs font-semibold border border-neutral-600 shrink-0">Remove samples</button>
                  : <button onClick={loadTimeSamples} className="px-3 rounded-lg text-xs font-semibold border border-neutral-600 shrink-0" title="See the layout with clearly-marked sample rows">See layout (samples)</button>}
              </div>
              {(() => {
                const groups = {};
                timesG.filter((t) => !timeQ.trim() || (t.job + " " + t.veh).toLowerCase().includes(timeQ.toLowerCase())).forEach((t) => { const k = t.job.trim().toLowerCase(); (groups[k] = groups[k] || []).push(t); });
                const keys = Object.keys(groups);
                if (!keys.length) return <div className="text-xs text-neutral-500">No entries yet — log a finished job from the Invoice tab, add one below, or tap "See layout" to preview with sample rows.</div>;
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-neutral-400 border-b border-neutral-700"><th className="py-1 pr-2">Job</th><th className="pr-2">Entries</th><th className="pr-2">Low</th><th className="pr-2">Typical</th><th className="pr-2">High</th><th>Vehicles</th></tr></thead>
                      <tbody>
                        {keys.map((k) => {
                          const g = groups[k]; const hs = g.map((t) => parseFloat(t.hours) || 0);
                          const lo = Math.min(...hs); const hi = Math.max(...hs); const av = hs.reduce((a2, b2) => a2 + b2, 0) / hs.length;
                          const sample = g.some((t) => t.by === "SAMPLE");
                          return (
                            <tr key={k} className="border-b border-neutral-800">
                              <td className="py-1.5 pr-2 font-semibold text-neutral-200">{g[0].job}{sample && <span className="ml-1 text-[9px] px-1 rounded" style={{ background: "#B8860B", color: "#fff" }}>SAMPLE</span>}</td>
                              <td className="pr-2">{g.length}</td>
                              <td className="pr-2">{lo.toFixed(1)}</td>
                              <td className="pr-2 font-bold" style={{ color: "#9be3a0" }}>{av.toFixed(1)}</td>
                              <td className="pr-2">{hi.toFixed(1)}</td>
                              <td className="text-neutral-500">{[...new Set(g.map((t) => t.veh).filter(Boolean))].slice(0, 3).join(", ")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                <input className={input} placeholder="Job (e.g. Water pump)" value={timeForm.job} onChange={(e) => setTimeForm({ ...timeForm, job: e.target.value })} />
                <input className={input} placeholder="Vehicle" value={timeForm.veh} onChange={(e) => setTimeForm({ ...timeForm, veh: e.target.value })} />
                <input className={input} placeholder="Hours" inputMode="decimal" value={timeForm.hours} onChange={(e) => setTimeForm({ ...timeForm, hours: e.target.value })} />
                <button onClick={addTimeEntry} className="py-2 rounded-lg text-sm font-semibold" style={{ background: C.green }}>Add entry</button>
              </div>
              <div className="text-[10px] text-neutral-500 mt-1">Observed times are guidance from real jobs — conditions vary; quote with judgment. SAMPLE rows are layout placeholders only, never real data.</div>
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">Free wiring &amp; repair info (legal sources)</div>
              <div className="text-[11px] text-neutral-500 mb-2">Genuinely free, each covering a slice — the OEM sites below stay the full-coverage source. Warning: sites offering "free" complete ALLDATA/Mitchell/OEM manual dumps are pirated; using them in a business risks everything. Never.</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[["Remy (BBB) wiring + TSBs", "https://www.remyautomotive.com/free-wiring-diagrams-technical-service-bulletins"], ["AutoZone repair guides", "https://www.autozone.com/diy/repair-guides/wiring-diagrams"], ["Chilton — free w/ library card", "https://www.slcl.org"], ["the12volt (accessory wiring)", "https://www.the12volt.com/installbay/vehiclewiring.asp"], ["NASTF — every OEM site", "https://wiki.nastf.org"], ["NHTSA recalls &amp; TSB refs", "https://www.nhtsa.gov/recalls"]].map(([n, u]) => (
                  <button key={n} onClick={() => window.open(u, "_blank")} className="py-2 rounded-lg text-xs font-semibold border border-neutral-600 text-neutral-200">{n}</button>
                ))}
              </div>
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">Official OEM service information (the legal source)</div>
              <div className="text-[11px] text-neutral-500 mb-2">Factory wiring diagrams and manuals come from the automakers' own technician sites — federal service-information rules require them to sell independents access, most with short-term passes. Opens in a new tab; nothing is copied into this app.</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[["Toyota/Lexus TIS", "https://techinfo.toyota.com"], ["Honda/Acura", "https://techinfo.honda.com"], ["Ford/Lincoln", "https://www.motorcraftservice.com"], ["GM ACDelco TDS", "https://www.acdelcotds.com"], ["Mopar TechAuthority", "https://www.techauthority.com"], ["Nissan/Infiniti", "https://www.nissan-techinfo.com"], ["Hyundai", "https://hyundaitechinfo.com"], ["NASTF (every OEM site)", "https://wiki.nastf.org"]].map(([n, u]) => (
                  <button key={n} onClick={() => window.open(u, "_blank")} className="py-2 rounded-lg text-xs font-semibold border border-neutral-600 text-neutral-200">{n}</button>
                ))}
              </div>
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">CARFAX reporting queue ({carfaxQ.length} waiting)</div>
              <div className="text-[11px] text-neutral-500 mb-2">Completed repairs queue here in CARFAX's standard shape: date · vehicle · VIN · odometer · services. They transmit automatically once the platform's CARFAX Service Network data agreement is in place — that's a partnership application, not a switch. Until then, this shop's own free Service Network account keeps repairs reporting, and the queue is export-ready either way.</div>
              {carfaxQ.slice(0, 6).map((q, i) => (
                <div key={i} className="text-xs py-1 border-b border-neutral-800">{q.ts} · {q.ymm} · {q.miles ? q.miles + " mi" : "odometer —"} · {q.services}</div>
              ))}
              {carfaxQ.length === 0 && <div className="text-xs text-neutral-500">Mark an invoice PAID, then tap "Queue for CARFAX" on it.</div>}
            </div>
          </div>
        )}

        {/* ============ COMMUNITY TAB ============ */}
        {tab === "Community" && (
          <div className="space-y-3">
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">Crew feed</div>
              <div className="text-[11px] text-neutral-500 mb-2">Ideas, wins, weird fixes — post it for the crew. The cross-shop network (every subscribed shop, one feed) switches on at the cloud tier.</div>
              <div className="flex gap-2">
                <input className={input} placeholder="Share something…" value={feedText} onChange={(e) => setFeedText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") postFeed(); }} />
                <button onClick={postFeed} className="px-4 rounded-lg font-semibold shrink-0" style={{ background: C.green }}>Post</button>
              </div>
              {feed.map((p, i) => (
                <div key={i} className="text-sm py-2 border-b border-neutral-800"><b style={{ color: "#9be3a0" }}>{p.by}</b> <span className="text-[10px] text-neutral-500">{p.ts}</span><div className="text-neutral-200">{p.text}</div></div>
              ))}
              {feed.length === 0 && <div className="text-xs text-neutral-500 mt-2">Nothing yet — first post takes the top spot.</div>}
            </div>
            {currentTech && currentTech.admin && (
              <div className="rounded-md p-3" style={card}>
                <div className="text-sm font-bold mb-1">Customer members ({membersAll.length}) — toggle off to pause anyone breaking the guidelines</div>
                {membersAll.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-neutral-800">
                    <span className="flex-1"><b>{m.name}</b> · {m.phone} · joined {m.ts} · signed "{m.signedName}"</span>
                    <button onClick={() => toggleDonor(m.phone)} className="px-2 py-1 rounded text-[10px] font-bold" title="Donor access — unlocks the Donor Room learning channel" style={{ background: m.donor ? "#B8860B" : "#262626", color: "#fff" }}>💠 {m.donor ? "Donor" : "Std"}</button>
                    <button onClick={() => openThread(m.phone)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: "#262626", color: "#9be3a0" }}>💬 Inbox</button>
                    <button onClick={() => toggleMember(m.phone)} className="px-2 py-1 rounded text-[10px] font-black" style={{ background: m.ok === false ? "#7a1f1f" : "#2E7D32", color: "#fff" }}>{m.ok === false ? "OFF" : "ON"}</button>
                  </div>
                ))}
                {membersAll.length === 0 && <div className="text-xs text-neutral-500">No members yet — the community button on the login screen is where they join.</div>}
                {inboxSel && (
                  <div className="rounded-md p-2 mt-2" style={{ background: "#161616" }}>
                    <div className="text-xs font-bold mb-1">Thread with {inboxSel} <button onClick={() => setInboxSel("")} className="text-neutral-500 underline ml-2">close</button></div>
                    {inboxThread.slice(-8).map((c, i) => (
                      <div key={i} className="text-xs py-0.5"><b style={{ color: c.from === "shop" ? "#9be3a0" : "#ddd" }}>{c.from === "shop" ? (c.by || "Shop") : "Member"}:</b> {c.text}</div>
                    ))}
                    <div className="flex gap-2 mt-1">
                      <input className={input} placeholder="Reply… (texts them too if they opted in)" value={inboxReply} onChange={(e) => setInboxReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") replyThread(); }} />
                      <button onClick={replyThread} className="px-3 rounded-lg text-xs font-bold shrink-0" style={{ background: C.green }}>Send</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">Parts swap</div>
              <div className="text-[11px] text-neutral-500 mb-2">Sell it, find it, trade it. Deals settle person-to-person — post honestly, meet safely, use your own payment method.</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <select className={input} value={swapForm.kind} onChange={(e) => setSwapForm({ ...swapForm, kind: e.target.value })}>{["SELL", "WANTED", "TRADE"].map((k) => <option key={k}>{k}</option>)}</select>
                <input className={input} placeholder="Part" value={swapForm.part} onChange={(e) => setSwapForm({ ...swapForm, part: e.target.value })} />
                <input className={input} placeholder="$ (opt)" inputMode="decimal" value={swapForm.price} onChange={(e) => setSwapForm({ ...swapForm, price: e.target.value })} />
                <input className={input} placeholder="Condition" value={swapForm.cond} onChange={(e) => setSwapForm({ ...swapForm, cond: e.target.value })} />
                <input className={input} placeholder="Contact" value={swapForm.contact} onChange={(e) => setSwapForm({ ...swapForm, contact: e.target.value })} />
              </div>
              <button onClick={postSwap} className="mt-2 w-full py-2 rounded-lg text-sm font-semibold" style={{ background: C.maroon }}>Post listing</button>
              {swap.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-neutral-800">
                  <span className="flex-1"><b style={{ color: l.kind === "WANTED" ? "#f0b356" : "#9be3a0" }}>{l.kind}</b> · <b>{l.part}</b>{l.price && " · $" + l.price}{l.cond && " · " + l.cond} · {l.by}{l.contact && " · " + l.contact} <span className="text-neutral-600">{l.ts}</span></span>
                  {currentTech && (currentTech.admin || currentTech.name === l.by) && <button onClick={() => delSwap(i)} className="text-neutral-500 hover:text-red-400"><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============ ACADEMY TAB ============ */}
        {tab === "Academy" && (
          <div className="space-y-3">
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">Shop Academy — training that lives in the truck</div>
              <div className="text-[11px] text-neutral-500 mb-2">Work each module, tap it done — your completion saves with the date. The owner sees the whole crew's matrix below. Annual refresher: owner clears and the crew runs it again.</div>
              {ACADEMY.map((m, i) => {
                const done = currentTech && acadDone[currentTech.name + ":" + i];
                return (
                  <div key={i} className="py-2 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <b className="flex-1 text-sm">{i + 1}. {m[0]}</b>
                      <button onClick={() => markModule(i)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: done ? C.green : "#262626", color: done ? "#fff" : "#9be3a0" }}>{done ? "✓ " + done : "Mark complete"}</button>
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">{m[1]}</div>
                  </div>
                );
              })}
            </div>
            {currentTech && currentTech.admin && (
              <div className="rounded-md p-3" style={card}>
                <div className="text-sm font-bold mb-2">Crew completion matrix (owner)</div>
                {techs.map((t, ti) => (
                  <div key={ti} className="flex items-center gap-1 text-xs py-1 border-b border-neutral-800">
                    <span className="flex-1">{t.name}</span>
                    {ACADEMY.map((_, mi) => (
                      <span key={mi} className="w-6 text-center" title={"Module " + (mi + 1)}>{acadDone[t.name + ":" + mi] ? "✅" : "▫️"}</span>
                    ))}
                  </div>
                ))}
                <div className="text-[10px] text-neutral-500 mt-2">Print this screen for the training file; module sign-offs pair with the paper Training Sheet.</div>
              </div>
            )}
          </div>
        )}

        {/* ============ INTEGRATIONS TAB ============ */}
        {tab === "Integrations" && (
          <div className="space-y-3">
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-1">API credentials — PartsTech &amp; RepairLink</div>
              <div className="text-[11px] text-neutral-500 mb-2">Enter your credentials when your API access comes through. They save to the app's storage and are used only by your own backend route (app/api/parts). Once live, move the secret keys into your host's environment variables.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={input} placeholder="PartsTech account / username" value={integr.ptAccount} onChange={(e) => setIntegr({ ...integr, ptAccount: e.target.value })} />
                <input className={input} placeholder="PartsTech API key" type="password" value={integr.ptKey} onChange={(e) => setIntegr({ ...integr, ptKey: e.target.value })} />
                <input className={input} placeholder="RepairLink username" value={integr.rlUser} onChange={(e) => setIntegr({ ...integr, rlUser: e.target.value })} />
                <input className={input} placeholder="RepairLink API key / password" type="password" value={integr.rlKey} onChange={(e) => setIntegr({ ...integr, rlKey: e.target.value })} />
              </div>
              <button onClick={saveIntegrations} className="mt-2 w-full py-2 rounded text-sm font-semibold" style={{ background: C.green }}>{integrMsg || "Save credentials"}</button>
              <div className="text-[10px] text-neutral-500 mt-2">Status: {integr.ptKey ? "PartsTech key saved ✓" : "PartsTech — not connected"} · {integr.rlKey ? "RepairLink key saved ✓" : "RepairLink — not connected"}. Live pricing switches on once each provider's API documentation lands in app/api/parts/route.js.</div>
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-2">Vendor launchers — one tap from any device</div>
              {[
                ["PartsTech", "https://app.partstech.com", "aftermarket parts, multi-supplier — free for shops"],
                ["RepairLink", "https://repairlinkshop.com", "OEM dealer parts — free for shops"],
                ["CCC ONE", "https://www.cccis.com", "insurance/DRP estimating platform — subscription, quote-based"],
                ["Nexpart", "https://nexpart.com", "WHI aftermarket network — free for shops"],
                ["Identifix Direct-Hit", "https://www.identifix.com", "diagnostics database you already use"],
                ["360 Payments", "https://www.360payments.com", "auto-shop payment processing — text-to-pay, interchange-plus, quote-based"],
                ["Advanced Payment Services", "https://www.advancedpaymentservices.com", "St. Peters MO, veteran-owned — dual pricing/cash discount, terminals, invoicing"],
              ].map(([name, url, desc]) => (
                <div key={name} className="flex items-center gap-2 text-sm py-1.5 border-b border-neutral-800">
                  <span className="flex-1"><b>{name}</b> <span className="text-[11px] text-neutral-500">— {desc}</span></span>
                  <button onClick={() => window.open(url, "_blank")} className="px-3 py-1 rounded text-xs font-semibold" style={{ background: C.green }}>Open</button>
                </div>
              ))}
            </div>
            <div className="rounded-md p-3 text-[11px] text-neutral-400" style={card}>
              <b className="text-neutral-200">How an integration gets added (the pattern):</b> 1. You get API access + documentation from the vendor. 2. Their documented call drops into app/api/parts/route.js at the marked spot. 3. Your credentials move to the host's environment variables. 4. The per-line buttons switch from open-and-paste to live in-app pricing. Nothing else in the app changes. CCC ONE is the exception — it's a closed platform with no public API; you subscribe and run it alongside for DRP/insurance work.
            </div>
          </div>
        )}

        {/* ============ DASHBOARD TAB ============ */}
        {tab === "Dashboard" && (
          <div className="space-y-3">
            <div className="flex gap-2 items-start rounded-md px-3 py-2 text-[13px]" style={{ background: "#3a2c07", border: "1px solid #6b520c" }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: C.amber }} />
              <span className="text-amber-100">This demo dashboard reads from this browser's saved estimates only. On your real deployment, swap this for a Supabase table so every tech's estimates roll up together.</span>
            </div>
            <button onClick={backupAll} className="w-full py-2.5 rounded font-bold flex items-center justify-center gap-2" style={{ background: C.green }}><Download size={16} /> Backup everything (one JSON file)</button>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md p-3 text-center" style={card}><div className="text-2xl font-black" style={{ color: "#9be3a0" }}>{dash.n}</div><div className="text-[10px] text-neutral-400 uppercase">Saved estimates</div></div>
              <div className="rounded-md p-3 text-center" style={card}><div className="text-2xl font-black" style={{ color: "#9be3a0" }}>{money(dash.avg)}</div><div className="text-[10px] text-neutral-400 uppercase">Avg repair order</div></div>
              <div className="rounded-md p-3 text-center" style={card}><div className="text-2xl font-black" style={{ color: "#9be3a0" }}>{dash.approvalRate}%</div><div className="text-[10px] text-neutral-400 uppercase">Approved+ rate</div></div>
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-2">By status</div>
              {STATUSES.map((s) => (
                <div key={s} className="flex justify-between text-xs py-1 border-b border-neutral-800"><span>{s}</span><span>{dash.byStatus[s] || 0}</span></div>
              ))}
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-2">Parts / labor mix</div>
              <div className="flex justify-between text-xs py-1"><span>Parts total</span><span>{money(dash.partsTotal)}</span></div>
              <div className="flex justify-between text-xs py-1"><span>Labor total</span><span>{money(dash.laborTotal)}</span></div>
            </div>
            <div className="rounded-md p-3" style={card}>
              <div className="text-sm font-bold mb-2">Estimate folders</div>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {["All", ...FOLDERS].map((f) => (
                  <button key={f} onClick={() => setDashFilter(f)} className="px-2.5 py-1 rounded text-xs font-semibold"
                    style={{ background: dashFilter === f ? C.green : "#262626", color: dashFilter === f ? "#fff" : "#bbb" }}>{f}</button>
                ))}
              </div>
              {savedEstimates.length === 0 && <div className="text-xs text-neutral-500">None saved yet — use Save from any tab.</div>}
              {savedEstimates.filter((e) => dashFilter === "All" || (e.folder || "New") === dashFilter).map((e, i) => (
                <div key={e.meta?.number || i} className="flex items-center gap-2 text-xs py-1.5 border-b border-neutral-800">
                  <span className="flex-1">{e.meta?.number} — {e.vehicle?.ymm || "-"} · {money(e.totals?.grand || 0)}</span>
                  <select className={input + " w-28"} value={e.folder || "New"} onChange={async (ev) => {
                    const upd = { ...e, folder: ev.target.value };
                    await store.set(`estimates:${e.meta?.number}`, upd);
                    setSavedEstimates((list) => list.map((x) => x.meta?.number === e.meta?.number ? upd : x));
                  }}>
                    {FOLDERS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky totals + actions */}
      <div className="fixed bottom-0 left-0 right-0 no-print" style={{ background: C.panel, borderTop: `2px solid ${C.maroon}`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-4xl lg:max-w-6xl mx-auto p-3">
          <button onClick={() => setShowAdj(!showAdj)} className="w-full text-left text-xs text-neutral-400 mb-1.5 py-1 flex items-center gap-1.5">
            <ChevronDown size={14} className={showAdj ? "rotate-180" : ""} /> Sublet · Supplies · Paint · Tax {showAdj ? "" : "— tap to adjust"}
          </button>
          {showAdj && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <label className="text-[11px] text-neutral-400">Sublet $<input className={input} inputMode="decimal" value={sublet} onChange={(e) => setSublet(e.target.value)} /></label>
            <label className="text-[11px] text-neutral-400">Supplies $<input className={input} inputMode="decimal" value={supplies} onChange={(e) => setSupplies(e.target.value)} /></label>
            <label className="text-[11px] text-neutral-400">Paint mat $<input className={input} inputMode="decimal" value={paintMat} onChange={(e) => setPaintMat(e.target.value)} /></label>
            <label className="text-[11px] text-neutral-400">Tax %<input className={input} inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></label>
          </div>
          )}
          <div className="flex items-center gap-4">
            <div className="text-xs text-neutral-400 leading-tight">Parts {money(totals.partsSub)} · Labor {money(totals.laborSub)} · Tax {money(totals.tax)}</div>
            <div className="ml-auto text-right"><div className="text-[10px] text-neutral-400 uppercase tracking-wide">Grand total</div><div className="text-2xl font-black" style={{ color: "#9be3a0" }}>{money(totals.grand)}</div></div>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <button onClick={copyText} className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]" style={{ background: C.maroon }}><Copy size={15} /> Copy</button>
            <button onClick={printView} className="py-2.5 px-3 rounded-lg text-sm border border-neutral-600 flex items-center gap-1.5 min-h-[44px]"><Printer size={15} /> Print / PDF</button>
            <button onClick={downloadCSV} className="py-2.5 px-3 rounded-lg text-sm border border-neutral-600 flex items-center gap-1.5 min-h-[44px]"><Download size={15} /> CSV</button>
            <button onClick={emailEstimate} className="py-2.5 px-3 rounded-lg text-sm border border-neutral-600 flex items-center gap-1.5 min-h-[44px]"><Mail size={15} /> Email</button>
            <button onClick={saveEstimate} className="py-2.5 px-3 rounded-lg text-sm border border-neutral-600 flex items-center gap-1.5 min-h-[44px]"><Save size={15} /> {saveMsg || "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
