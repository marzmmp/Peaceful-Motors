# Peaceful OS — Build Package

Hand this whole folder to Claude Code and say:

> **"Read CLAUDE.md first, then follow it. Do not change the UI."**

That's it. `CLAUDE.md` contains the constraint, the verified state, the setup
steps, and the ordered task list.

---

## What's in here

```
CLAUDE.md          ← the instruction file. Claude Code reads this first.
START_HERE.md      ← this file, for you.
CHANGES.md         ← every change made, and why, in plain language.
project/           ← the app. Builds and runs as-is.
```

## What was done to your app

**The UI was not touched.** Out of 2,778 lines in `PeacefulEstimate.jsx`,
15 lines were removed and 50 added — all of it plumbing. The only
styling-adjacent line that changed was a missing `$` that was printing
`{BRAND.tagline}` literally on your customer reports. The style attribute
on that line is byte-for-byte identical.

Your theme, your colors, your tabs, your layout, your wording — untouched.
`project/components/PeacefulEstimate.jsx.backup` is your original, and
`node scripts/apply-patches.mjs --revert` puts it back.

**What got fixed underneath:**

- Every device now sees the same estimates, roster, and dashboard
- Photos and videos are actually saved (they were being lost on every reload)
- Six API routes that anyone on the internet could call now require a login
- The database no longer hands full access to anyone holding the browser key
- Phone verification is real instead of theater
- Next.js upgraded off a version with a critical security advisory

## Before you hand it over

You'll need three free accounts if you don't have them:

1. **Supabase** — the database. supabase.com
2. **Anthropic** — the photo analysis. console.anthropic.com (set a spend cap)
3. **Vercel** — the hosting. vercel.com

`CLAUDE.md` has the step-by-step. It's about 20 minutes of clicking.

## The honest part

This package makes the app **real** — shared, saved, and safe to put on the
internet. It does not make it a product you can sell yet. That still needs
billing, shop onboarding, and a month of you running your own jobs on it.

Those are listed in `CLAUDE.md` under "Later — not now," deliberately. The
fastest route to shop #2 is thirty days of Peaceful Motors invoices, not
more features.
