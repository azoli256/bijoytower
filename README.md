# Bijoy Tower

Bengali and English flat-owner directory and monthly billing, collection, garage-rent and
expense ledger for 27 flats. The cashier uses a PIN; registered owners use their
phone number for read-only access. Other owners' phone numbers are hidden from
resident API responses.

Use the **English / বাংলা** button on the login screen or in the signed-in header
to change the interface language. The choice is remembered in that browser.
Owner names and original source descriptions remain stored exactly as recorded.

Open https://bijoytower.vercel.app, use the cashier PIN provided in the private
access file, and add real owners under the flat list. Firebase is no longer used.

Records now save to a JSON file through the server API, not browser storage.
Run `npm start` and open http://localhost:3000 to use a real local file at
`data/database.json`. The first start creates a random cashier PIN in
`data/PRIVATE-ACCESS.txt`. Later starts reuse the file and PIN. The local server
listens on this computer only. Run one server per database file.

The live website uses a separate private `database.json` in Vercel Blob storage.
All live users share that file. The local copy and live copy do not sync with
one another. The API checks cashier permissions and rejects conflicting saves.
Local writes are atomic and retain the previous file as `database.json.bak`.
The live adapter uses consistent reads and conditional writes.

The cashier PIN is hashed on the server, and sessions use signed HTTP-only
cookies. Residents retain mobile-number-only read access to the building ledger;
this does not verify ownership of a phone number. Residents cannot write data.
Names, other owners' phone numbers, and authentication details are not returned
to unauthenticated visitors. Never publish `data/` or environment files.

Use **ব্যাকআপ ডাউনলোড** regularly. Restore with **ব্যাকআপ ফিরিয়ে আনুন** replaces
the current records after confirmation and keeps the current cashier PIN.
Use the version-2 full backups from this system so bills, source references and
review notes are retained. Keep backups private.

Monthly bills and receipts are distinct. Generating a month creates invoices,
not income. Payments can be partial; old dues and advance payments carry forward.
Changing a flat's monthly rates does not change past invoices. Receipts retain
both their report month and actual date, matching the source sheets' convention.
Outside garage receipts remain individual records even when names repeat.

The image import is private database content, not public source code. Source
filenames, printed monthly totals and printed due snapshots are retained for
comparison. The reports calculate balances from recorded entries; discrepancies
and missing phone numbers remain visible for review rather than being silently
filled with invented transactions. Source transcriptions, import staging files,
pre-import backups, and the owner list remain under the ignored `data/` folder.

`web/accounting.js` contains shared calculation logic. `web/app.js` provides the
screens; `lib/schema.cjs` validates complete saves; `/api/database` enforces roles
and revisions. The public build contains only HTML, CSS and browser JavaScript.

Install dependencies with `npm install`. The public build contains only the HTML;
API code reads the private file. Production uses the connected Vercel Blob store.
Validation:

```sh
npm test
npm run build
```
