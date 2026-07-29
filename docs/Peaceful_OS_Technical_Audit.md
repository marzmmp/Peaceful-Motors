# Peaceful OS — "EVERYONE" Platform · Technical Audit

**Archive:** `Peaceful_OS_EVERYONE_PLATFORM.zip` · 71 files · 1.26 MB
**Reviewed:** 28 July 2026
**Scope:** Next.js app (`/project`), 6 API routes, Supabase schema, marketing site, 15 PDFs, 2 DOCX

Every finding below was verified by execution or AST inspection, not by reading alone. Method notes are in the appendix.

---

## Verdict

The code is **structurally sound and cleanly written** — it compiles without a single warning on two independent parsers, has zero React hooks-rule violations across 138 hook calls, and contains no hardcoded secrets in any of the 71 files. That is not typical for a solo build of this size.

The problems are not sloppiness. They are **three architectural decisions that are safe for one password-gated shop and unsafe the moment the product does what it is marketed to do** — serve a public customer portal and multiple tenants. The gap between "works for Peaceful Motors today" and "sellable to shop #2" is where nearly every serious finding sits.

There is also one silent data-loss bug that affects the headline feature today, on the current single-shop deployment.

---

## CRITICAL

### C1 · Three unauthenticated routes that spend money or send mail

| Route | Auth | Rate limit | What an anonymous POST does |
|---|---|---|---|
| `/api/phone` | none | none | Buys Twilio numbers on your account. In a loop. |
| `/api/sms` | none | none | Sends arbitrary SMS to arbitrary numbers from your registered A2P brand |
| `/api/email` | none | none | Sends arbitrary email, with attacker-supplied HTML, from your verified domain |
| `/api/claude` | none | 20/min/IP | Burns Anthropic credit (best of the four — the limiter is real) |

`/api/email` is the worst of them. Both `to` and `html` are caller-controlled, and `html` is interpolated straight into `corpWrap()` and shipped. Once `EMAIL_FROM` points at a domain you've verified in Resend, that is attacker-authored phishing leaving your domain with valid SPF and DKIM. The reputational and deliverability damage outlives the incident.

**The conflict that makes this urgent:** the README's answer is Vercel Deployment Protection, and that would work — it gates API routes along with pages. But the customer portal cannot be password-gated; a customer booking a repair has no password. And `sendVerify()` (line 668) calls `/api/sms` *from that public portal*. So the product cannot function as designed and stay protected at the same time. Deployment Protection is not a fix here, it is a delay.

**Fix — before any public exposure:**
- A shared-secret header check as the first statement in all four routes, then a real session check when Auth lands.
- Move `/api/claude`'s limiter into a shared module and apply it everywhere; swap the `Map` for Upstash Redis (the route's own comment already calls for this).
- `/api/phone` should require an owner role, full stop. It provisions billable resources.
- Escape or strip `html` in `/api/email`, and allowlist `to` against saved customers.

### C2 · Supabase policy grants the world full access to every record

```sql
create policy "shop access" on pm_store for all using (true) with check (true);
```

Paired with `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which by design ships inside the browser bundle. Anyone holding that key — any tech's phone, any browser cache, any bundle that leaks once — can read, rewrite, or delete **every** record: customer names, phones, addresses, estimates, bookings, and the PIN roster.

`lib/supabase-store.js` flags this honestly in its header comment. The comment understates it in one specific way: it frames the risk as "not for a public site," but the anon key escapes through devices, not just through public pages.

The deeper issue is structural. `pm_store` is one flat `key → jsonb` table with no `shop_id`. **There is no place to put a tenant boundary.** Part B of the schema designs proper multi-tenancy, but the layer that actually holds data has no isolation and no room for it. Phase 1 is not a policy change on top of this — it is a migration of the store abstraction itself.

### C3 · PINs stored, displayed, and emailed in cleartext

Tech PINs (line 2144) and customer member PINs (line 1049) are written to the store as plain strings, rendered in an editable input on the Admin roster, and mailed in the clear by `resetPinByEmail()` (line 255).

On its own, defensible — the README is upfront that PIN login is "an accountability layer, not real security." Layered on C2 it becomes a credential dump with customer phone numbers attached.

**Fix:** hash with bcrypt or Argon2 server-side; compare server-side; never render a stored PIN; send a single-use reset token rather than the credential.

---

## HIGH

### H1 · Photos and videos are never saved — the headline feature loses data today

`custPhotos` exists only in React state. It appears at exactly seven lines in the file, and **not one of them is a `store.set`**. Meanwhile `saveEstimate()` (line 1157) persists:

```js
{ meta, vehicle, category, totals, rows, folder, tech, savedAt }
```

No media. Reload the tab, or open a different estimate, and every photo and video is gone.

This matters more than a normal bug because the whole product rests on it. The README leads with "Photos in, approved lines out." The Academy's estimating standard is "Photograph cause AND correction." The customer report builder at line 1108 maps over `custPhotos` — so a report generated after a reload silently emits `(no media attached)`.

**Fix:** persist media per estimate under its own key (`media:<estimateNumber>`), and restore it when an estimate is opened. See M6 first — this fix will hit the storage ceiling immediately without it.

### H2 · Phone verification verifies nothing

```js
const code = String(Math.floor(100000 + Math.random() * 900000));
setPvSent(code);                              // line 662 — generated in the browser
...
if (pvCode && pvSent && pvCode === pvSent)    // line 670 — compared in the browser
```

The code the user must "prove" they received is sitting in React state, readable in devtools. Worse than useless: the booking record then carries `verified: pvOK` (line 681), which looks like evidence in a dispute and is not.

**Fix:** generate the code server-side, store it against the phone with a short TTL, compare server-side, return only a boolean. Same route needs the rate limiting from C1 or it is also an SMS-pumping faucet.

### H3 · Every customer email BCCs to a hardcoded inbox

```js
const SHOP = "peacefulmotors@outlook.com";        // route.js line 9
bcc: to === SHOP ? undefined : [SHOP],           // line 41
```

Correct and useful today. The instant Peaceful OS is sold to a second shop, that shop's customer correspondence is copied to your personal inbox — without their knowledge and against your own Privacy draft.

This one will be found in acquisition diligence, and it reads badly there. Make it `process.env.SHOP_INBOX` now, while it costs one line.

---

## MEDIUM

### M1 · Broken interpolation in every customer report — line 1118

```js
<div style="...">{BRAND.tagline}</div>      // inside a template literal, missing the $
```

Prints the literal text `{BRAND.tagline}` on every downloaded customer report. Line 449 does it correctly (`${BRAND.tagline}`), so this is a single slip. I scanned all template literals in the file via AST — **this is the only one**.

### M2 · White-label leaks, including a legal one

The BRAND block promises "one edit, whole app rebrands." Four places ignore it:

- Line 1117 — `PEACEFUL MOTORS` hardcoded in the report header
- Line 1119 — phone, email, and site hardcoded
- Line 1123 — phone and the 12mo/12k warranty hardcoded
- **Line 1915 — the authorization checkbox reads "Customer authorizes Peaceful Motors to perform the work described above"**

The last one is not cosmetic. A reseller's customer would be signing authorization naming *your* LLC. Every one of these should read from `BRAND`, and the warranty terms should join it as a config field, since a buyer's warranty will differ.

### M3 · `selfcheck.mjs` gives false confidence

It passed cleanly on a file containing M1 and H1. Two reasons:

- Brace balance via `src.split("{").length === src.split("}").length` counts braces inside strings, comments, and regex. Balanced-but-wrong passes.
- "tab renders" only tests substring presence — it proves the string exists, not that the tab works.

Given DEVELOPER_NOTES makes this the gate before every deploy, it is worth more than it currently delivers. Replacing the brace check with a real parse is roughly this:

```js
import { transformSync } from "esbuild";
try { transformSync(src, { loader: "jsx" }); checks.push(["parses", true]); }
catch (e) { checks.push([`parses — ${e.message}`, false]); }
```

Add `eslint-plugin-react-hooks` and it would also cover the class of bug this file has so far avoided.

### M4 · Part B tables will silently return nothing

Five tables get `enable row level security` and zero policies. In Postgres that is deny-all. Harmless while empty — but on the day Auth ships, every query returns `[]` with no error, which is a miserable thing to debug. Leave a comment on each table, or ship the `auth.uid()` policies now.

### M5 · `/api/claude` rate limiter is close to decorative on serverless

An in-process `Map` resets on cold start and isn't shared across instances. The route's own comment says exactly this. Worth acting on now rather than later, since it is also the pattern the other three routes need.

### M6 · Media storage will blow the browser quota

The portal path downscales properly — 900px, JPEG 0.7 (line 644). The Media tab does not: `readAsDataURL` on the original file, videos included (line 334). Base64 inflates by ~33%, and `localStorage` caps near 5 MB. Two phone photos exceed it.

This is invisible today only because of H1 — nothing is being saved. Fix H1 without fixing this and the app starts throwing `QuotaExceededError` on save. Downscale stills on the same path the portal uses, and put videos in Supabase Storage rather than the key-value table.

---

## LOW

- **Model ID.** `claude-sonnet-4-6` (route.js line 54) is valid — dateless IDs are canonical pinned snapshots, not stale aliases. It is simply a generation behind; `claude-sonnet-5` is current. No action required, just an upgrade you may want.
- **Unescaped report interpolation.** Captions and comments go into raw HTML at line 1112 with no escaping. Low severity — the file is local — but a customer name containing markup would corrupt the report. Escape it.
- **No `.gitignore`, no lockfile.** The README's "drag this folder in" flow means no reproducible builds and no protection against a stray `.env` reaching the repo. Both are one-minute fixes with real payoff.

---

## What is genuinely strong

Worth stating plainly, because the list above is long and the work underneath it is not weak.

- **2,778 lines, clean compile**, zero warnings, on both esbuild and Babel independently.
- **138 hook calls, zero conditional hooks, zero redeclarations.** In a 109-`useState` component that is real discipline.
- **No secrets anywhere** across all 71 files. Every credential correctly behind `process.env`.
- **No `eval`, no `innerHTML`, no `dangerouslySetInnerHTML`.** React's escaping is intact throughout the app.
- **`/api/claude` is well built** — server-side key, model pinned, `max_tokens` capped at 1500 so a modified front end can't run up the bill, and honest comments about its own limits. The comments in this file are better engineering documentation than most teams write.
- **TCPA consent is modeled at the schema level** with `notify_ok` defaulting false and a `consent_at` timestamp that `tech_locations` cannot be inserted without. The 24-hour location purge is written down. That is thinking that usually shows up only after a lawsuit.
- **"No scraped labor-guide/OEM data ever"** in DEVELOPER_NOTES, and `Free_Wiring_Sources.pdf` documenting the legal alternatives. Correct call, and the expensive one to make early.
- **The documentation set is unusually complete** — 15 PDFs covering disclaimers, tiers, compliance, and a prior audit response with findings tracked to resolution.

---

## Fix order

Sequenced by risk exposed per hour spent.

**Before the portal is publicly reachable**
1. Shared-secret + rate limit on all four API routes (C1) — half a day
2. `SHOP_INBOX` env var replacing the hardcoded BCC (H3) — one line
3. Server-side SMS verification (H2) — a few hours

**This week**
4. Persist media, with downscaling (H1 + M6) — the data-loss bug, and the one your customers would notice
5. Hash PINs server-side (C3)
6. Real parse check in `selfcheck.mjs` (M3) — cheap, and it protects everything after it

**Before shop #2**
7. `shop_id` on the storage layer + Supabase Auth policies (C2) — the largest item here, and the true gate on multi-tenancy
8. Every hardcoded brand string reads from `BRAND`, warranty terms included (M2)
9. Line 1118 (M1), plus a `.gitignore` and a lockfile

C2 is the one to plan for rather than patch. Everything else on this list is contained; that one touches the store abstraction that all data flows through, and it is genuinely easier to do before there is a second shop's data in the table than after.

---

## Appendix — verification method

| # | Test | Tool | Result |
|---|---|---|---|
| 1 | JSX compiles | esbuild 0.25 transform | PASS · 0 warnings · 272,867 B out |
| 2 | Independent parse | `@babel/parser` AST | PASS |
| 3 | Hooks rules | custom AST walker | PASS · 0/138 conditional |
| 4 | Redeclarations | AST, component scope | PASS · 33 bindings, 0 dupes |
| 5 | Secret scan | regex, all 71 files | PASS · 0 hits |
| 6 | Config review | manual | PASS |
| 7 | Injection surface | grep | PASS · 0 `eval`/`innerHTML`/`dangerouslySetInnerHTML` |
| 8 | Template interpolation | AST quasi scan | **FAIL · 1** → M1 |
| 9 | White-label leaks | grep vs `BRAND` | **FAIL · 4** → M2 |
| 10 | Media persistence | call-graph trace | **FAIL** → H1 |
| 11 | Route auth/rate limit | per-route audit | **FAIL · 3 of 4** → C1 |
| 12 | RLS policy coverage | SQL count | **FAIL · 6 enabled, 1 policy** → C2, M4 |
| 13 | Model ID currency | Claude Platform docs | PASS · valid, one generation behind |

Two false positives were caught and discarded during the pass: a "rate limit present" match in `/api/email` that was the word *corporate*, and a suspected invalid model ID that the docs confirmed is legitimate. Both are reported above as verified-clean rather than dropped silently.
