# Wedding Site — Setup & Maintenance

The site is a static page (`index.html` + `js/` + `images/`) plus a Google Apps Script
that reads/writes one Google Spreadsheet. Per-guest passwords gate the site; RSVPs are
written back to the spreadsheet.

## 1. The spreadsheet (reuse Murali's existing one)

You do **not** need a new spreadsheet — write on top of the existing one.

1. Open the existing spreadsheet (you need **edit** access).
2. The guest master-list tab must be named exactly **`Guests`**. (Already renamed from
   `Sheet 1` → `Guests`.) If you ever name it something else, change the `GUESTS_TAB`
   constant in `Code.gs` to match.
3. The `Guests` tab needs this header row (exact names; extra columns are ignored):
   `Primary Guest First Name, Last Name, Email Address, Phone Number, Events Invited,
   Extra Guest? (Y/N), How many Guests?, Names of Extra Guests, Password`
   - `Events Invited`: comma list drawn from `Sangeet, Wedding, Reception`.
   - `How many Guests?`: number of **extra** guests allowed (the cap).
   - `Names of Extra Guests`: comma-separated, up to the cap.
   - `Password`: **unique** per guest. Convention: `FirstnameLastname`, add a number on
     collision (`RohitSingh`, `RohitSingh2`). A blank password means that guest can't log
     in yet.
4. The site **creates two more tabs automatically** on the first RSVP — you don't make them:
   - **`RSVP Summary`** — one row per guest, the current answer. **This is the tab you read.**
   - **`RSVP Log`** — append-only history (a safety net you can ignore).

   If the sheet already has tabs literally named `RSVP Summary` or `RSVP Log` from the old
   flow with unrelated data, rename or clear them first (the script will append to whatever
   it finds under those names).

### Check for duplicate passwords before sending invites

Passwords must be unique (they're the login + the row key). Select the `Password` column →
Format → Conditional formatting → Custom formula `=AND(I1<>"",COUNTIF(I:I,I1)>1)` (replace
`I` with the actual password column letter) → pick a fill color. Resolve any highlighted
duplicates. Finalize passwords **before** invites go out — changing one after a guest has
RSVP'd orphans their `RSVP Summary` row.

## 2. The Apps Script (container-bound to that spreadsheet)

"Container-bound" just means the script is attached to this specific spreadsheet, so it
operates on it automatically (no IDs or extra sharing to configure — that's why `Code.gs`
has `SPREADSHEET_ID = ''`).

1. In the **same spreadsheet**: Extensions → Apps Script.
2. Create three script files, `lib.gs`, `Code.gs`, and `logo.gs`; paste the contents from this
   repo's `apps-script/` folder. (`logo.gs` is the base64 logo embedded for the confirmation
   email — it's a long one-line file; paste it whole.)
3. (Optional) tweak the constants at the top of `Code.gs`: `GUESTS_TAB`, `SUMMARY_TAB`,
   `LOG_TAB`, `COUPLE`.
4. Deploy → New deployment → type **Web app** → Execute as **Me**, Who has access **Anyone**.
5. Authorize when prompted (first run asks for Sheets + Gmail permissions — Gmail is for the
   confirmation email).
6. Copy the Web app **`/exec` URL**. Opening it in a browser should show
   `{"ok":true,"service":"wedding-rsvp"}`.

> Re-deploy note: after editing the script, use Deploy → Manage deployments → edit the
> existing deployment → **New version**, so the same `/exec` URL keeps working.

## 3. The website

1. Paste the `/exec` URL into `window.SHEETS_URL` in `index.html` (replace
   `PASTE_EXEC_URL_HERE`).
2. Deploy `index.html`, the `js/` folder, and the `images/` folder **together** (e.g. GitHub
   Pages). They must stay alongside each other.

## 4. Smoke test before sharing

1. Add yourself as a test guest in `Guests` with a known password and a couple of allowed
   extras.
2. Open the site, log in with that password.
3. Confirm only your invited events show; run the two-step RSVP; submit.
4. Check `RSVP Summary` / `RSVP Log` got the row, and that the confirmation email arrived.
5. Log in again — the wizard should pre-fill your last answer; re-submitting overwrites the
   Summary row (no duplicate).
6. Remove the test guest/rows when done.

## Notes & limitations

- **Passwords are a soft gate, not security.** They keep out casual visitors but are
  guessable and the site returns a guest's invite to anyone with the right code. Fine for a
  wedding; don't put anything truly sensitive in the sheet.
- **Regenerate images** (only if you start from a fresh embedded `index.html`):
  `python3 scripts/extract_images.py`.
- **Tests:** `npm test` runs the Node unit tests for the pure logic in `apps-script/lib.gs`
  and `js/logic.js` (no install needed; requires Node 18+).
