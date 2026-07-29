# What Changed — plain language

Every item was tested. Nothing here is theoretical.

---

## Your interface: untouched

| | |
|---|---|
| Lines in the component | 2,778 |
| Lines removed | 15 |
| Lines added | 50 |
| Colors changed | 0 |
| Class names changed | 0 |
| Tabs added, removed, or renamed | 0 |
| Buttons or labels changed | 0 |

One line touched anything visual, and only to add a missing `$`:

```
before   <div style="...color:#2E7D32...">{BRAND.tagline}</div>
after    <div style="...color:#2E7D32...">${BRAND.tagline}</div>
```

Without the `$`, every customer report you downloaded printed the literal
text `{BRAND.tagline}` where your tagline should have been.

---

## The seven edits inside your component

All data-layer. All reversible with one command.

1. **Shared storage** — records now go to a real database instead of one
   phone's browser. The replacement has the identical three methods, which
   is why this was a two-line change instead of a rewrite.
2. **The `$` fix** above.
3. **Photos save.** `saveEstimate()` was storing everything except your
   photos and videos.
4. **Photos come back.** Nothing ever loaded them. Also replays anything
   written while you had no signal, and lifts old per-phone records into
   the cloud once.
5. **Verification codes generated on the server**, not in the customer's
   browser where they could be read.
6. **Verification checked on the server**, with a 10-minute expiry and a
   5-try limit.
7. **Customer reports embed their photos** so the file still works when
   opened next week.

---

## What's new around it

**Login.** A new sign-in page, styled from your existing PIN screen's exact
colors and classes. Your PIN screen still runs behind it and still stamps
each job to the right tech — that's what it was always for. The login is
what actually protects the records.

**The front door.** Six API routes had no caller check whatsoever. Tested
live against your running app: an anonymous request to `/api/sms` was
accepted and processed all the way to the Twilio step. With credentials
set, that would have sent a text on your account. Same for `/api/phone`,
which buys phone numbers — an attacker could have looped it.

All six now answer `401 Sign in first.` Buying phone numbers additionally
requires owner access.

**The database boundary.** The old policy was `using (true)` — anyone
holding the browser key could read, rewrite, or delete every record you
had. Now every row carries a `shop_id` that the **database** fills in from
your login. The browser never sends it, so it can't fake it.

**Photos in proper storage.** Base64 images in browser storage would have
hit the ~5 MB ceiling on your second photo. They now go to real file
storage, downscaled with the same settings your customer portal already
used.

**Real rate limiting.** The old limiter reset every time the server went
cold. The new one counts in the database, so it holds.

**Next.js upgraded** from 14.2.15 (critical advisory) to 15.5.22. Zero code
changes needed — tested.

**A self-check that works.** The old one counted `{` against `}`, which
also counts braces inside text and comments. It passed your file while it
contained both the `$` bug and the photo data loss. The new one actually
compiles every file. 64 checks.

---

## Deleted

- `supabase-schema.sql` — held the wide-open database policy. Removed so
  nobody runs it by accident. Your original ZIP still has it.
- `lib/supabase-store.js` — replaced by `lib/store.js`.

---

## Proof

```
npm install                      117 packages, clean
node scripts/apply-patches.mjs   8/8 anchors matched
node scripts/selfcheck.mjs       64/64 passed
npx next build                   13 routes, 0 warnings
npx next start + live requests:
  GET  /            307 → /login          (was: open)
  GET  /login       200
  POST /api/sms     401 Sign in first.    (was: processed)
  POST /api/phone   401 Sign in first.    (was: processed)
  POST /api/email   401 Sign in first.    (was: processed)
```
