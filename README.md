# Peaceful Motors OS

**The operating system for Peaceful Motors** — a mobile auto-repair shop. Photos in, approved
lines out, invoice printed: estimating, job documentation, customer approval, invoicing, tech
accountability, and consent-gated customer texting, in one installable web app.

> *An Ease of Mind is Simply Divine.*

| | |
|---|---|
| **Stack** | Next.js 15.5 · React 18 · Supabase (Postgres + RLS, Auth, Storage) · Tailwind |
| **Services** | Anthropic (photo estimating) · Twilio (texts) · Resend (email) · Stripe payment links |
| **Form factor** | PWA — "Add to Home Screen" installs it with the shop icon, camera works |
| **Tenancy** | Multi-shop ready: every row is scoped to a `shop_id` the browser never sends |

## Verified state of this build

Everything below was run against this exact tree, not assumed.

```
✓ npm install                          clean
✓ node scripts/selfcheck.mjs           76/76 checks passed
✓ npx next build                       17 routes, middleware active, 0 warnings
✓ npx next start + live requests:
      GET  /                → 307 redirect to /login
      GET  /login           → 200
      POST /api/sms         → 401 "Sign in first."
      POST /api/phone       → 401 "Sign in first."
      POST /api/roster      → 401 "Sign in first."
      POST /api/pin/verify  → 401 "Sign in first."
✓ lib/pin.js scrypt round-trip         hash format, verify, reject, unique salts
```

## What's in this build

The app arrived as a finished single-device tool with a hardened backend already wired in
(see [`docs/CHANGES.md`](docs/CHANGES.md)). This build completes the five tasks that were
left on the list in [`CLAUDE.md`](CLAUDE.md) — all data-layer, zero UI changes:

1. **Techs get real logins** — the Admin tab's existing "Add technician" button now also calls
   `POST /api/roster`, which emails the tech a Supabase invite and attaches them to the shop
   with their role. Same button, same label, one more wire.
2. **Plaintext PINs retired** — PINs are stored as scrypt hashes (`pinHash`) and verified through
   `POST /api/pin/verify`, never in the browser. The Admin roster renders `••••` and takes a new
   PIN in the same input box. "Forgot your PIN?" now generates, hashes, and emails the temporary
   PIN entirely server-side. Legacy plaintext rosters upgrade themselves on first login.
3. **Lean tab defaults** — a fresh shop boots with the eight tabs a job needs: **Details ·
   Photo Estimate · Line Items · Media · Customer View · Invoice · Admin · Help**. The other
   eight (Bookings, Parts, Fixes & Times, Guides, Community, Academy, Integrations, Dashboard)
   ship built but switched off — each is one reversible checkbox in Admin → FEATURE SWITCHES.
   Shops with saved settings keep exactly what they had.
4. **Consent gate has data** — saving an estimate (or sending a status text) upserts the customer
   into the `customers` table with `notify_ok` + a consent timestamp, so the server-side check in
   `/api/sms` has a row to enforce. STOP always wins; the shop-wide switch can never override a
   customer's own opt-out.
5. **Backups include media** — the Dashboard's "Backup everything" now pulls each estimate's
   photos and videos back out of Storage and inlines them as bytes, so the backup file still
   works long after the 8-hour signed URLs expire.

## Wireframe

Every screen, with the backend wiring called out: open
[`docs/WIREFRAME.html`](docs/WIREFRAME.html) in a browser. It is drawn from the code — real
tab names, real button copy, real routes.

## Repository layout

```
components/PeacefulEstimate.jsx   the whole UI — every screen, one file. Read-mostly; see CLAUDE.md
app/login/                        Supabase sign-in (the real account boundary)
app/auth/callback/                email confirm / password reset landing
app/api/                          claude · email · sms · phone · parts · carfax · verify
                                  roster · pin/verify · pin/set · pin/reset   ← all behind guard()
lib/guard.js                      sign-in + role + rate limit — first statement of every route
lib/store.js                      shared record store (offline outbox, legacy migration)
lib/media.js                      photo/video persistence + inline export for reports & backups
lib/customers.js                  consent-record upsert (matched by phone digits)
lib/pin.js                        scrypt PIN hashing (server-only)
lib/supabase-*.js                 browser / server / admin client layers
middleware.js                     session refresh; bounces signed-out visitors to /login
supabase/01…04_*.sql              schema · RLS policies · storage bucket · first-owner seed
scripts/selfcheck.mjs             the 76-check maintenance gate (runs in CI on every push)
docs/                             wireframe · technical audit · build plan · change log · original README
CLAUDE.md                         working rules for anyone (human or agent) touching this code
```

## Setup — about 20 minutes

### 1. Supabase

1. [supabase.com](https://supabase.com) → New project (free tier is fine)
2. SQL Editor → run **in order**: `supabase/01_schema.sql`, `02_policies.sql`, `03_storage.sql`
3. Authentication → Providers → make sure **Email** is enabled
4. Project Settings → API → copy the Project URL, `anon` key, and `service_role` key

### 2. Environment

```bash
cp .env.example .env.local
```

Minimum to boot:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` has **no** `NEXT_PUBLIC_` prefix on purpose — that prefix is what
would bundle it into the browser. Never add one. Optional: `RESEND_API_KEY` (email + PIN
resets), `TWILIO_*` (texting), `SHOP_INBOX`, `EMAIL_FROM`.

### 3. First owner

```bash
npm install
npm run dev
```

Open the app → it redirects to `/login` → **Create an account** with the owner's email →
confirm via the emailed link. Then put that same email into `supabase/04_seed_owner.sql` and
run it in the SQL Editor — that creates the shop and attaches the owner. Sign in again and
the app's own first-run screen asks for the owner name and PIN, as it always did.

### 4. Verify & deploy

```bash
npm run check     # 76 checks — must pass before any deploy
npm run build     # must be clean
```

Deploy to Vercel (import the repo, set the env vars, deploy). Check the env vars are actually
set in production: `middleware.js` deliberately passes everything through when Supabase vars
are missing, so a misconfigured deploy is an *open* deploy.

## The security model, in one breath

Signed-out visitors bounce to `/login`. Every API route opens with `guard()` — sign-in, role,
and a Postgres-backed rate limit that survives cold starts. Every tenant row carries a
`shop_id` filled in by a **database default** from the session; the browser never sends it, so
it cannot spoof it, and RLS rejects everything else. PINs are scrypt hashes verified
server-side. Secrets live in env vars only. Every outbound customer text passes a consent
check against the customer's own record, server-side, per send.

## House rules

Read [`CLAUDE.md`](CLAUDE.md) before touching anything. The short version: **do not change the
UI** (the data layer is where all work happens), exact-anchor edits only, `npm run check` must
pass, schema changes are additive-only, no scraped labor-guide or OEM data ever, and
`lib/supabase-admin.js` never gets imported by a component.

## Deliberately not started

Stripe billing · multi-shop onboarding · CARFAX · PartsTech API · A2P 10DLC registration ·
Capacitor app-store wrap. Each is blocked on a partnership, an approval, or a second paying
shop — see "Later — not now" in [`CLAUDE.md`](CLAUDE.md). The fastest route to shop #2 is
thirty days of Peaceful Motors invoices, not more features.
