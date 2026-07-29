# Peaceful OS — From Code to Working System

**Companion to:** `Peaceful_OS_Technical_Audit.md`
**Prepared:** 28 July 2026

---

## First, the good news — verified, not assumed

I installed the dependencies, ran a full production build, started the server, and hit it with a browser request.

```
✓ Compiled successfully
✓ Generating static pages (10/10)
GET /  →  200 · 8,039 bytes · renders the owner-setup screen
```

**It builds. It runs. It serves.** 52 kB page, 139 kB first load. No errors, no warnings, no code changes needed. You are much closer than the audit's length suggests.

I also tested the upgrade path, because `next@14.2.15` ships with a critical advisory:

| Path | Build | Vulnerabilities left | Code changes |
|---|---|---|---|
| Stay on 14.2.15 | ✓ | 28+, several critical | — |
| Bump to 14.2.35 | ✓ | 4 (2 high, 2 low) | none |
| **Bump to 15.5.22** | **✓** | **3, all in `sharp`** | **none** |

The remaining `sharp` advisories are in Next's image optimizer, which you don't use. This is the verified-working dependency set:

```json
{
  "@supabase/supabase-js": "^2.111.0",
  "lucide-react": "0.383.0",
  "next": "^15.5.22",
  "react": "18.3.1",
  "react-dom": "18.3.1"
}
```

Zero source edits required. I built and served the app on it.

---

## The honest reframe

Peaceful OS is not an unfinished app. It is **a finished single-device app** that needs a spine.

Everything works — for one person, on one phone, with data that never leaves that phone. The moment a second person needs to see the same job, or the same person picks up a tablet instead, the illusion breaks. That is not a bug list. That is one missing layer.

There is a second pattern worth naming, because it will shape how you spend the next month. The archive contains a great deal of **anticipatory plumbing** — a CARFAX partner route awaiting an agreement that doesn't exist, a PartsTech route awaiting credentials that haven't been issued, affiliate terms for a program that isn't running, a $249/mo Enterprise tier with no billing behind it. That's real work and it's honestly labeled as plumbing throughout, which is to your credit.

But underneath it, the load-bearing floor — shared storage, real login, tenant separation — isn't poured yet. The next stretch of work is rebalancing that. Less reach, more foundation.

---

## The keystone

Five critical findings. **Four of them are the same decision.**

```
        ┌──────────────────────────────────────────┐
        │  Supabase Auth + shop_id on every row    │
        └──────────────────────────────────────────┘
                          │
        ┌─────────────┬───┴────┬──────────────┐
        ▼             ▼        ▼              ▼
   C2 tenant     C3 PIN    C1 route     multi-tenancy
   isolation     hashing    auth         (shop #2)
```

Do not patch these separately. `auth.uid()` is simultaneously the identity your RLS policies need, the thing that replaces plaintext PINs, and the session your API routes check. One correct implementation retires four findings and unlocks the entire Phase-1 roadmap.

Everything else in this plan is small by comparison. This is the work.

---

## The cut list

Sixteen tabs ship today:

> Details · Bookings · Photo Estimate · Line Items · Parts · Fixes & Times · Customer View · Invoice · Media · Guides · Community · Academy · Integrations · Dashboard · Admin · Help

**Six of them are needed to estimate, document, approve, and invoice a brake job:**

> **Details · Photo Estimate · Line Items · Media · Customer View · Invoice**

Plus Admin and Help as support. The other eight — Bookings, Parts, Fixes & Times, Guides, Community, Academy, Integrations, Dashboard — are either future, dependent on partnerships you don't have, or premium features nobody is paying for yet.

You already built the mechanism to handle this: `settings.features.*` and `tabEnabled()`. **Switch the eight off.** Not delete — switch off. Every one of them is currently a surface that can break, confuse a tech, or leak data, in exchange for value you cannot collect this month.

Turning them back on later costs one boolean each.

---

## The sequence

Effort is in **sessions** — a focused block of a few hours. Adjust to your own pace; the ordering is what matters, because each stage removes a blocker for the next.

### Stage 0 · Lock the foundation — 1 session

Cheap, and everything after it is safer.

- `npm install next@15.5.22 @supabase/supabase-js@2.111.0` — verified above, no code changes
- Add a `.gitignore` (`node_modules`, `.next`, `.env*`) — this one prevents the mistake where a real key reaches a public repo
- Commit `package-lock.json` — without it your host builds different code than you tested
- Replace the brace-count in `selfcheck.mjs` with a real parse:

```js
import { transformSync } from "esbuild";
try { transformSync(src, { loader: "jsx" }); checks.push(["parses", true]); }
catch (e) { checks.push([`parses — ${e.message}`, false]); }
```

- Deploy to Vercel with Deployment Protection **on**, and confirm the live URL loads

At the end of Stage 0 you have a real, private, deployable system with a build you can trust. That is a genuine milestone — take it.

### Stage 1 · The keystone — 3–5 sessions

The big one. Do not rush it and do not split it.

1. **Redesign the storage table.** `pm_store` is `key → jsonb` with nowhere to put a tenant. Add `shop_id uuid not null` and make the primary key `(shop_id, key)`. This is the single most important line of SQL in the project.
2. **Turn on Supabase Auth.** Email + password is fine. Owner signs up first; owner invites techs.
3. **Write real RLS policies.** Replace `using (true)` with `using (shop_id = (select shop_id from shop_users where user_id = auth.uid()))`. Test it by logging in as a second user and confirming you see nothing.
4. **Swap the store.** Delete the `localStorage` object at line 35, `import { store } from "../lib/supabase-store"`. The interface already matches — this part is genuinely a drop-in.
5. **Retire PINs** as the security boundary. Keep them if you like as the fast in-app "who is this job stamped to" switch, but the thing standing between the internet and your customer records is now a real session.

At the end of Stage 1, every device sees the same data, and only the right people see it. This is the moment it becomes a shop system rather than an app.

### Stage 2 · Stop losing data — 1–2 sessions

- Persist media under `media:<estimateNumber>` and restore it when an estimate opens (audit H1)
- Downscale stills on save, using the exact path the portal already uses at line 644 — 900px, JPEG 0.7
- Put videos in **Supabase Storage**, not the key-value table, and keep only the URL in the record

Do these together. Persistence without downscaling will throw `QuotaExceededError` on the first two-photo job.

### Stage 3 · Safe to expose — 1–2 sessions

Only needed when something must be publicly reachable. But do it *before* that day, not on it.

- Session check as the first statement in all six API routes
- Shared rate limiter (Upstash Redis free tier) applied to all six, not just `/api/claude`
- `/api/phone` requires owner role — it provisions billable resources
- Server-side SMS verification (audit H2) — generate, store with TTL, compare server-side
- `SHOP_INBOX` env var replacing the hardcoded BCC (audit H3)
- Escape `html` in `/api/email`, allowlist `to`

**Live proof this is needed:** I sent an unauthenticated POST to `/api/sms` on the running server. It was accepted and processed all the way to the Twilio config check. With credentials set, that request would have sent a text on your account. There is nothing in front of it.

### Stage 4 · One month of real jobs — the actual validation

Not a coding stage. The most important one.

Run Peaceful Motors on it. Every job, every estimate, every invoice, for thirty days. Six tabs. Two or three real users.

You will learn more in that month about what shop #2 needs than in any amount of further building. You will also find the things no audit finds — the tab order that's wrong on a phone in a driveway, the field nobody fills in, the button that's two taps too far when your hands are dirty.

And it produces the one asset that actually sells this: *"I run my own shop on it. Here are thirty days of invoices."*

### Stage 5 · Shop #2 — after Stage 4, not before

- Stripe billing against the `subscriptions` table already in your schema
- Every hardcoded brand string reads from `BRAND`, warranty terms included (audit M2)
- **Line 1915 especially** — the authorization checkbox currently names Peaceful Motors. A reseller's customer would be signing authorization naming your LLC. That is a contract defect, not a cosmetic one.
- Onboarding: a new shop needs to go from signup to first estimate without you on the phone
- Support: decide now what happens when a shop texts you at 7pm on a Saturday

---

## What to say no to, for now

Each of these is a real opportunity. None is reachable this quarter, and each one consumes the time Stage 1 needs.

| Deferred | Blocked on | Revisit |
|---|---|---|
| CARFAX reporting | A partnership agreement that hasn't started | After 10 shops give it weight |
| PartsTech / RepairLink | Credentials they issue to partners | After revenue proves the volume |
| Twilio A2P texting | Brand + campaign registration, days of approval | Stage 3, if the portal ships |
| Community · Swap · Academy | A userbase that doesn't exist | After Stage 5 |
| Enterprise $249/mo tier | Anything to bill for | After shop #2 pays |
| Capacitor / app stores | A web app that works first | After Stage 4 |

The pattern to watch for: **integrations are exciting and foundations are boring, and the foundation is what's actually blocking you.** The archive shows the pull of the exciting side clearly. Naming it is most of the defense against it.

---

## Where this actually stands

| | |
|---|---|
| **Builds and runs** | ✓ verified live |
| **One mechanic, one phone, real work** | ✓ today, minus media persistence |
| **A crew sharing one set of records** | Stage 1 |
| **Safe on the public internet** | Stage 3 |
| **A second shop paying for it** | Stage 5 |

Realistically: **6–10 focused sessions** gets you from here to the end of Stage 3 — a real, shared, protected system running your own shop. Stage 4 is a calendar month of using it. Stage 5 depends on what that month teaches you.

The thing worth holding onto: the hard part of software is usually the part that makes it work at all, and that part is done. What remains is the part that makes it *hold* — and that work is far more mechanical, far better understood, and far shorter than what you've already finished.

---

## Appendix — what I ran

| Test | Result |
|---|---|
| `npm install` on stated deps | 118 packages · `next@14.2.15` flagged with a critical advisory |
| `next build` as shipped | ✓ compiled, 10/10 static pages, 139 kB first load |
| Upgrade to `next@14.2.35` | ✓ builds, 28+ vulns → 4, zero code changes |
| Upgrade to `next@15.5.22` + `supabase-js@2.111.0` | ✓ builds, → 3 (all `sharp`, unused), zero code changes |
| `next start` + `GET /` | 200 · 8,039 bytes · owner-setup screen rendered |
| Unauthenticated `POST /api/sms` | Accepted and processed to the Twilio config check — **no auth gate exists** |
