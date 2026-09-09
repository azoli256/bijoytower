# Bijoy Tower

Bengali flat-owner directory and monthly income/expense ledger for 27 flats.

Open https://bijoytower.vercel.app, set a cashier PIN, and add real owners under
the flat list. No owner records are prefilled. Firebase is no longer used.

Records save in this browser's localStorage, including after a page reload.
They do not automatically sync across devices, browser profiles or site URLs.
The PIN is a convenience lock; local data and JSON backups are not encrypted.

Use **ব্যাকআপ ডাউনলোড** regularly. Clearing browser data or using private browsing
can remove records. To move records, open the site in the destination browser
and choose **ব্যাকআপ ফিরিয়ে আনুন**. Restore replaces its current records after
confirmation and uses the PIN in the backup. Keep backups private.

No build step or database service is required. Validation:

```sh
node --test tests/local-storage.test.cjs
```
