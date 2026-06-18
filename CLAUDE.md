# CLAUDE.md

Wedding RSVP site for Shivani & Murali: static `index.html` + `js/` + `images/`, with a
Google Apps Script backend that reads/writes one Google Sheet. This documents the
**non-obvious** parts — things you can't tell just by reading the code. (For first-time
setup, see `docs/SETUP.md`.)

## The backend is NOT deployed from this repo

`apps-script/lib.gs`, `apps-script/Code.gs`, and `apps-script/logo.gs` are **source copies**.
The code that actually runs lives in a **container-bound Apps Script project attached to the
Google Sheet** (you get there via Extensions → Apps Script *from inside the spreadsheet*).
Editing the files in this repo changes nothing live until you copy them into that editor and
redeploy. There is no clasp/CI sync.

### To change backend behavior (email, validation, sheet logic)
1. Edit the file(s) under `apps-script/` here.
2. Open the spreadsheet → **Extensions → Apps Script**.
3. Paste the changed file(s) over the matching `.gs` files (`lib.gs`, `Code.gs`, `logo.gs`) and
   **Save** (⌘S).
4. **Deploy → Manage deployments** → click the **✏️** on the existing **Web app** deployment →
   set **Version → New version** → **Deploy**.
   - This keeps the **same `/exec` URL**. Do **not** use "New deployment" — that mints a new URL
     and would require updating `index.html`.
5. Live immediately; no static-site redeploy needed for backend-only changes.

The `/exec` URL is hard-coded in `index.html` as `window.SHEETS_URL`. It is a public endpoint
(safe to expose). The only URL that belongs there is the one ending in **`/exec`** (a
`/macros/library/...` URL is a different deployment type and will not work).

## The Google Sheet contract (one spreadsheet, three tabs)

- **`Guests`** — hand-maintained invite list; the site only **reads** it. Column order is
  irrelevant — columns are matched **by header name** (case-insensitive; parenthetical notes are
  ignored, so `Names of Extra Guests (separated by commas)` matches `names of extra guests`).
  Headers used: Primary Guest First Name, Last Name, Email Address, Phone Number, Events Invited,
  Extra Guest? (Y/N), How many Guests?, Names of Extra Guests, Password.
- **`RSVP Summary`** — auto-created on first RSVP; one row per guest, **upserted by Password**
  (the current answer — this is the tab to read).
- **`RSVP Log`** — auto-created; append-only history.
- `Password` must be **unique** — it's both the login lookup and the upsert key. Convention:
  `FirstnameLastname`, add a number on collision. A blank password means that guest can't log in.
- Add/change a guest = just edit the `Guests` tab. No code change.

## Non-obvious implementation notes

- **CORS / why `text/plain`:** the browser POSTs with `Content-Type: text/plain` on purpose —
  that makes it a CORS "simple request", so there's no preflight (Apps Script can't answer a
  preflight `OPTIONS`) **and** the JSON response is readable. Do not switch to
  `application/json` (adds a preflight → breaks) or `mode:'no-cors'` (response becomes
  unreadable → the form would always claim success, the original bug we removed).
- **Images:** `index.html` references `images/*`, which were extracted from inline base64 by
  `scripts/extract_images.py` (one-shot; dedups by content hash, names by first appearance). If
  images ever get re-embedded as base64, re-run that script to regenerate `images/` and rewrite
  the `<img src>` paths.
- **Email logo:** `apps-script/logo.gs` is only `var LOGO_B64 = "<base64>"` — a *resized* PNG of
  the logo, embedded so the confirmation email can attach it **inline (CID)**. Inline is
  required because Gmail blocks remote `<img src>` and strips `data:` URIs. To change the logo:
  `sips -Z 480 images/logo.png --out /tmp/x.png`, base64 it, replace the constant.
- **Email fonts (Gmail-first):** the email is designed to render in **Georgia** because Gmail —
  the majority client — strips web fonts. The `@import` of Playfair/Cormorant is a progressive
  bonus for clients that support it (Apple Mail, iOS Mail). Don't assume the web fonts render.
- **Email quota:** `MailApp.sendEmail` is free but capped (~100 recipients/day on free
  `@gmail.com`, 1,500 on Workspace) — fine for this guest count. Send failures are caught and
  non-fatal: the RSVP still records even if the email doesn't go out.

## Tests

`npm test` (Node 18+, no install) runs `node:test`. The pure logic in `apps-script/lib.gs` is
loaded into Node via `vm` (see `apps-script/lib.test.js`) — that's why `lib.gs` carries the
`typeof module !== 'undefined'` export guard and must stay **ES5** and free of Google services.
Google services (`SpreadsheetApp`, `MailApp`, `LockService`, `ContentService`) live only in
`Code.gs`, which is not unit-tested (verify it by sending a real test RSVP). Frontend pure logic
is tested in `js/logic.test.js`; `js/app.js` (DOM wiring) is verified in the browser.
