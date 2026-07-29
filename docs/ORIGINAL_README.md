> **NOTE — this file describes the ORIGINAL single-device build.**
> The backend has since been rewired: records are shared across devices via
> Supabase, media is persisted, and every API route requires a login.
> **Read `../CLAUDE.md` for current setup.** The sections below on
> per-device storage and the `store` object no longer apply.

# Peaceful OS — Deploy Guide

Complete estimate + invoice system for Peaceful Motors. Photos in, approved
lines out, invoice printed — with tech PIN logins and a built-in Help tab.

## Deploy (about 15 minutes, no command line needed)

1. **GitHub**: create a free account → New repository → "uploading an
   existing file" → drag this whole folder's contents in → Commit.
2. **Pick a host** (both free):
   - **Cloudflare**: dash.cloudflare.com → Workers & Pages → Create →
     Pages → Connect to Git → pick the repo → Framework preset: Next.js.
   - **Vercel** (fallback if Cloudflare's Next.js build fights you):
     vercel.com → Add New → Project → import the repo.
3. **Environment variables** (in the host's project settings):
   - `ANTHROPIC_API_KEY` — required, from console.anthropic.com
     (powers photo analysis, diagnostics, price lookups). Set a monthly
     spend cap in the Anthropic console.
   - `RESEND_API_KEY` — optional, from resend.com (free), for auto-email.
4. **Deploy.** You get a live URL in ~2 minutes.
5. **Your domain**: project settings → Custom domains →
   `estimate.peacefulmotors.com` → add the DNS record it shows you.
6. **Protect it**: turn on your host's deployment/password protection so
   only your crew can reach the site. (PIN login inside the app is an
   accountability layer, not real security — this setting is.)

## First run

Open the site → it asks the FIRST person to create the **owner login**
(name + PIN). The owner then adds techs on the **Admin** tab. Everyone
else picks their name + PIN to work. The **Help** tab has the full
walkthrough for your techs.

## Phone app (today)

Open the deployed site on any phone → browser menu → **Add to Home
Screen**. Installs with the Peaceful Motors icon, opens full screen,
camera works. App Store / Google Play come later via a Capacitor wrap
once developer accounts clear (Apple ~1–2 wks, Google ~3–4 wks for new
accounts).

## What's per-device vs shared (important)

Tech roster, saved estimates, and the Dashboard live in EACH device's
browser storage. One phone = one set of records. When you're ready for
every tech's estimates to roll into one shared dashboard, the upgrade is
a Supabase table replacing the three functions in the `store` object at
the top of `components/PeacefulEstimate.jsx` — a contained change, not a
rebuild.

## Files

- `components/PeacefulEstimate.jsx` — the whole app (8 tabs)
- `app/api/claude/route.js` — holds your Anthropic key server-side
- `app/api/email/route.js` — optional auto-email via Resend
- `app/layout.js`, `app/page.js`, `app/globals.css` — Next.js shell
- `public/manifest.json`, `public/icon-*.png` — phone-app install
- `tailwind.config.js`, `postcss.config.js` — styling build

## "Everything saved to something for me" — three layers

1. **Auto-email on Save** (deployed + RESEND_API_KEY): every saved estimate
   lands in peacefulmotors@outlook.com automatically.
2. **Backup button** (Dashboard tab): downloads every estimate + the tech
   roster as one JSON file, any time, any device.
3. **Shared database** (the real answer): follow `lib/supabase-store.js` —
   ~10 minutes, free — and every device reads/writes the SAME records: one
   roster, one dashboard, every tech's estimates in one place you own.

## PartsTech

The **PT** button on any parts line copies "vehicle + part" to the clipboard
and opens app.partstech.com — log in, paste, price. A true behind-the-scenes
integration requires API credentials that PartsTech issues to its partners;
if you request/receive API access from PartsTech, the integration route can
be added to this project without touching the rest of the app.

## Customer media

The **Media** tab takes photos AND short videos with labels + comments, and
"Download customer report" produces one self-contained HTML file to text or
email. Videos embed into that file — keep them short (under ~20 MB) or send
long ones by text directly.
