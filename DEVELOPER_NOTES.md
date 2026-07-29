# Developer Notes — for whoever works on this next

## Architecture in one paragraph
One React component (components/PeacefulEstimate.jsx) renders every screen; a `store`
abstraction (localStorage now, lib/supabase-store.js for shared cloud) holds all data
under prefixed keys; per-shop behavior lives in `settings` flags, shop identity in the
`BRAND` const. API routes: /api/claude (vision drafting), /api/email (Resend),
/api/sms (Twilio), /api/parts (supplier stub). Code and data never mix — updates
can't touch shop records.

## The patch protocol (how changes get made safely)
1. Find your target in Code_Map.txt (page/system → line).
2. Edit by exact-anchor replacement; never mass-reformat.
3. Run `node scripts/selfcheck.mjs` — it must pass before any deploy.
4. Push → the GitHub Action re-runs the check; the host builds a PREVIEW url.
5. Thumb-test the preview (Instructions PDF §7) → promote. Rollback = redeploy prior commit.

## Store keys
estimates: | bookings: | catalog:parts | locations: | consent:loc: | techs:roster |
terms:accepted | shoplog:entries | forum:posts | swap:listings | settings:app

## Settings flags (per shop)
features.{bookings,parts,ai,media,portal,community} · guidesOn+guideSubs · locationOn ·
msgMaster (restrict-only; never overrides a customer opt-out) · assistantPro ·
requireSig · defaultRate/defaultMarkup/zipMarkups · stripeLink/altPay*/reviewLink

## Known next steps (in order)
Supabase Auth multi-tenant → Stripe billing → Twilio inbound webhook (STOP/START) +
/api/reminders on a Vercel cron (auto day-before texts) → cross-shop community/swap
feeds (move forum:/swap: to shared tables w/ shop_id) → MOTOR labor API → Capacitor.

## Rules that protect the business
Schema changes additive-only. No scraped labor-guide/OEM data ever. Every outbound
customer message passes a consent gate. Version numbers stay out of customer-facing
docs. All secrets in env vars, never in the component.
