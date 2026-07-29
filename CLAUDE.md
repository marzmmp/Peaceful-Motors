# CLAUDE.md — Peaceful OS

Read this before touching anything.

---

## The one rule

**Do not change the UI. Not the theme, not the layout, not the pages, not the copy, not the tab order, not a single class name or hex value.**

The owner built this interface deliberately and it is not up for redesign. Your job is the backend: make the app real, shared, and safe. If a task seems to require a visual change, it doesn't — find the data-layer way to do it, or stop and ask.

This applies with particular force to `components/PeacefulEstimate.jsx`. That file is 2,778 lines and renders every screen. Treat it as **read-mostly**.

### What "don't change the UI" means concretely

| Never | Instead |
|---|---|
| Split the component into smaller files | Leave it. It compiles clean; the size is not your problem to solve |
| Reformat, re-indent, or run Prettier on it | Exact-anchor edits only |
| Rename a variable "for clarity" | Leave it |
| Change a `className`, a color, a label, a button | Leave it |
| Reorder or rename tabs | Leave it |
| "Modernize" the JSX | Leave it |
| Add a UI library or component kit | Leave it |

The backend has already been written to make this possible. `lib/store.js` exposes the **exact same three methods** the old localStorage object did, and `lib/media.js` returns the **exact same object shape** the Media tab already renders. That is deliberate — it is why the whole rewire cost 50 added lines in a 2,778-line file.

---

## Verified state of this package

Everything below was run, not assumed.

```
✓ npm install            117 packages, no errors
✓ node scripts/apply-patches.mjs    8/8 anchors matched and applied
✓ node scripts/selfcheck.mjs        all 64 checks passed
✓ npx next build                    13 routes, middleware active, 0 warnings
✓ npx next start + live requests:
      GET  /              → 307 redirect to /login     (was: open)
      GET  /login         → 200
      POST /api/sms       → 401 "Sign in first."       (was: processed)
      POST /api/phone     → 401 "Sign in first."       (was: processed)
      POST /api/email     → 401 "Sign in first."       (was: processed)
```

Component diff against the original: **15 lines removed, 50 added, out of 2,778.** The only styling-adjacent line that changed is a missing `$` in a template literal — the `style` attribute on it is byte-identical.

**The patches are already applied in this package.** `components/PeacefulEstimate.jsx.backup` holds the untouched original. `node scripts/apply-patches.mjs --revert` restores it.

---

## What was built, and why

### The problem this package solves

The app worked — for one person, on one phone, with data that never left that phone. Six API routes had no caller check at all: an anonymous POST to `/api/phone` bought Twilio numbers on the shop's account, and an anonymous POST to `/api/email` sent attacker-authored HTML from the shop's verified domain. Photos and videos were never saved anywhere. The database policy was `using (true)`, which granted the browser key full read/write on every record.

### New files

| File | What it does |
|---|---|
| `supabase/01_schema.sql` | Tables. `shop_id` is filled by a **database default** from the session — the browser never sends it and cannot spoof it |
| `supabase/02_policies.sql` | RLS. Replaces `using (true)`. You only see rows for your own shop |
| `supabase/03_storage.sql` | Media bucket, scoped by shop folder |
| `supabase/04_seed_owner.sql` | Creates the first shop, attaches the owner. Run once |
| `lib/store.js` | Shared record store. **Identical interface** to the old one, plus offline queue and legacy migration |
| `lib/media.js` | Photo/video persistence. **Returns the shape the UI already renders** |
| `lib/guard.js` | The front door. Sign-in + role + rate limit for every API route |
| `lib/ratelimit.js` | Postgres-backed limiter that survives serverless cold starts |
| `lib/supabase-browser.js` / `-server.js` / `-admin.js` | The three client layers |
| `middleware.js` | Refreshes the session; bounces signed-out visitors to `/login` |
| `app/login/page.js` | New page. Styled from the existing PIN gate's exact tokens |
| `app/auth/callback/route.js` | Completes email confirm / password reset |
| `app/api/verify/route.js` | Real phone verification — code hashed and compared server-side |

### Deleted, on purpose

- `supabase-schema.sql` — contained the `using (true)` policy. Dangerous to leave lying around where someone might run it.
- `lib/supabase-store.js` — superseded by `lib/store.js`.

---

## Setup — run in this order

### 1. Supabase

1. supabase.com → New project (free tier is fine)
2. SQL Editor → run **in order**: `01_schema.sql`, `02_policies.sql`, `03_storage.sql`
3. Authentication → Providers → make sure **Email** is enabled
4. Project Settings → API → copy the Project URL, the `anon` key, and the `service_role` key

### 2. Environment

Copy `.env.example` to `.env.local` and fill in. Minimum to boot:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix on purpose — that prefix is what would bundle it into the browser. **Never add one.**

### 3. First owner

```bash
npm install
npm run dev
```

Open the app → it redirects to `/login` → **Create an account** with the owner's email → confirm via the emailed link.

Then edit `supabase/04_seed_owner.sql`, put that same email in, and run it in the SQL Editor. That creates the shop and attaches the owner.

Sign in again. You'll land on the app's own first-run screen, which asks for the owner name and PIN exactly as it always did.

### 4. Verify

```bash
npm run check      # 64 checks
npm run build      # must be clean
```

---

## Work remaining

> **Status — July 2026:** Tasks 1–5 below are **done** in this repo's first build
> (76/76 checks, clean production build, live 307/401 gate probes — see README.md).
> The descriptions are kept because they document the intended behavior. New API
> routes: `/api/roster`, `/api/pin/verify`, `/api/pin/set`, `/api/pin/reset`; new
> libs: `lib/pin.js`, `lib/customers.js`. The next real work is "Later — not now",
> which stays blocked on partnerships/approvals — don't start it.

Ordered. Each item unblocks the next.

### Task 1 — Add techs from the Admin tab

The Admin roster still writes to `techs:roster` in the store, which now means the shared database — so the roster already syncs across devices. What's missing is that adding a tech there doesn't create a **login** for them.

Build a `POST /api/roster` route that:
- Requires `guard(req, { role: "owner" })`
- Uses `supabaseAdmin().auth.admin.inviteUserByEmail(email)`
- Inserts the `shop_users` row with the chosen role

Then wire the existing "Add tech" button to call it **in addition to** what it already does. Do not change the button, its label, or its position.

### Task 2 — Retire plaintext PINs

PINs are currently stored as cleartext in the roster and shown in an input on the Admin tab. Now that they live in a shared database, that's a credential list.

Keep the PIN screen exactly as it looks. Change only what's behind it:
- Store `pinHash` (bcrypt or `crypto.scryptSync`) instead of `pin`
- Verify through a `POST /api/pin/verify` route, never in the browser
- On the Admin roster, render `••••` and offer "Set new PIN" — same input box, same styling, just no longer displaying a stored secret

### Task 3 — Feature switches default off

Ten of the sixteen tabs aren't reachable value yet: Bookings, Parts, Fixes & Times, Guides, Community, Academy, Integrations, Dashboard. Six are needed to estimate, document, approve, and invoice a job: **Details · Photo Estimate · Line Items · Media · Customer View · Invoice** (plus Admin and Help).

`tabEnabled()` and `settings.features.*` already exist. Set the defaults so the extras are off. **Do not delete the tabs or their code** — this is a settings default, one boolean each, reversible.

### Task 4 — Consent gate on every send

`/api/sms` now checks `customers.notify_ok` before sending. Make sure the app actually writes customer records to that table when a customer is added, so the gate has something to check. Right now customers live only inside estimate JSON.

### Task 5 — Backup that includes media

The Dashboard's backup button dumps store records to JSON. It does not include the media files now in Storage. Extend it to fetch and inline them, or to emit a manifest of signed URLs.

### Later — not now

Stripe billing · multi-shop onboarding · CARFAX · PartsTech · A2P 10DLC registration · Capacitor wrap. All of these are blocked on either a partnership, an approval, or a second paying shop. Don't start them.

---

## House rules

Carried forward from `DEVELOPER_NOTES.md`, still binding:

1. **Exact-anchor edits.** Never mass-reformat.
2. **`npm run check` must pass before any deploy.** It now really parses the code, rather than counting braces.
3. **Schema changes are additive only.** New columns, new tables. Never drop or rename.
4. **No scraped labor-guide or OEM data. Ever.**
5. **Every outbound customer message passes a consent gate.**
6. **All secrets in env vars.** Never in a component, never in the repo.
7. **`lib/supabase-admin.js` is server-only.** It bypasses RLS. Use it for `phone_verifications` and `rate_hits` and nothing else. Never import it from a component — `npm run check` fails the build if you do.

## Things that will bite you

- **RLS with no policies denies everything silently.** `phone_verifications` and `rate_hits` have no policies on purpose; only the service key touches them. If a new table returns empty rows for no reason, this is why.
- **`shop_id` is never sent from the browser.** If you find yourself passing it in an insert, stop — the database default handles it, and supplying it manually reopens the spoofing hole.
- **Signed media URLs expire** (8 hours). Anything downloadable must inline the bytes — `embedMediaForReport()` in `lib/media.js` does this.
- **`middleware.js` passes everything through when Supabase env vars are missing.** That's deliberate so a missing variable doesn't lock the owner out of his own app — but it means a misconfigured deploy is an *open* deploy. Check the env vars are actually set in production.
