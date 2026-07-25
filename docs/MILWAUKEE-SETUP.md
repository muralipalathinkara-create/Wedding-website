# Milwaukee Meet & Greet — Setup

A second, standalone page at `/milwaukee/` for the Milwaukee Meet & Greet (Sunday, April 25,
2027). It shares the main site's fonts/colors but is otherwise independent: **no password
gate**, no pre-loaded guest list. Anyone with the link RSVPs with their own name, and can add
however many guests they're bringing.

It has its own Google Sheet and its own Apps Script deployment — Milwaukee RSVPs never mix
with the main wedding RSVP data.

## 1. Create a new Google Sheet

1. Go to sheets.google.com → Blank spreadsheet. Name it something like **"Milwaukee Meet & Greet RSVPs"**.
2. You don't need to add any tabs or headers yourself — the script creates `RSVP Summary` and
   `RSVP Log` automatically on the first RSVP.
3. Make sure you're signed into whichever Google account should own this (e.g. the same
   `murali.shivani.wedding@gmail.com` account used for the main site, so confirmation emails
   send from a consistent address).

## 2. Add the Apps Script (container-bound to this new sheet)

1. In that spreadsheet: **Extensions → Apps Script**.
2. Create two script files, `lib.gs` and `Code.gs`; paste the contents from this repo's
   `milwaukee/apps-script/` folder (not the main `apps-script/` folder — different files).
3. Save (⌘S).
4. **Deploy → New deployment** → type **Web app** → Execute as **Me** → Who has access
   **Anyone**.
5. Authorize when prompted (Sheets + Gmail permissions).
6. Copy the Web app **`/exec` URL**. Opening it in a browser should show
   `{"ok":true,"service":"milwaukee-rsvp"}`.

> To change backend behavior later: edit `milwaukee/apps-script/*.gs` in this repo, paste over
> the matching files in the Apps Script editor, save, then **Deploy → Manage deployments** →
> edit the existing deployment → **New version** (keeps the same `/exec` URL — don't use "New
> deployment" for updates).

## 3. Wire the URL into the page

In `milwaukee/index.html`, find:

```js
window.MILWAUKEE_SHEETS_URL = 'PASTE_YOUR_MILWAUKEE_EXEC_URL_HERE';
```

Replace the placeholder with the `/exec` URL from step 2.

## 4. Add real photos (optional)

`milwaukee/index.html` currently reuses a few photos from the main site's `images/` folder as
placeholders (`../images/sunset.jpg`, `hero.jpg`, `proposal.jpg`, `seated.jpg`) so the page
works immediately. To swap in Milwaukee-specific photos:

1. Drop image files into `milwaukee/images/`.
2. Update the `src="../images/..."` paths in the hero and gallery sections of
   `milwaukee/index.html` to `images/your-file.jpg`.
3. Add or remove `<div class="gp reveal">...</div>` blocks in the gallery section for however
   many photos you have — the grid (`auto-fit`) reflows automatically.

## 5. Fill in the venue

The Details section currently says "Venue details to follow." Once the venue/hotel is booked,
update the `.info-card` "Where" block and the `venue-note` paragraph in `milwaukee/index.html`,
and update the venue line in `milwaukee/apps-script/Code.gs`'s confirmation email text if you
want it included there too.

## 6. Publish

Since this lives inside the same repo/GitHub Pages site as the main wedding site, no extra
hosting setup is needed — just commit and push `milwaukee/` like any other change. It will be
live at:

`https://muralipalathinkara-create.github.io/Wedding-website/milwaukee/`

## 7. Smoke test before sharing the link

1. Open the page, fill out the RSVP form (your own name/email), add a guest, submit.
2. Check the new Google Sheet's `RSVP Summary` and `RSVP Log` tabs got the row.
3. Confirm the confirmation email arrived.
4. Submit again with the same email — it should **update** the existing Summary row rather
   than create a duplicate (upsert key is email address, lowercased).
5. Delete your test row(s) when done.

## Notes

- **Not password-protected** — anyone with the link can RSVP. That's intentional per the
  "no gating" request; don't rely on this page for anything requiring guest verification.
- **Tests:** `npm test` (from the repo root) runs both the main site's and Milwaukee's unit
  tests — `milwaukee/js/logic.test.js` and `milwaukee/apps-script/lib.test.js` are picked up
  automatically by Node's test runner alongside the existing ones.
