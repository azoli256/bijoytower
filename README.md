# Bijoy Tower

Bengali flat-owner directory and monthly income/expense ledger for 27 flats.

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
Older browser-storage backups are supported; old browser records are not
automatically imported. Keep backups private. No records are prefilled.

Install dependencies with `npm install`. The public build contains only the HTML;
API code reads the private file. Production uses the connected Vercel Blob store.
Validation:

```sh
npm test
npm run build
```
