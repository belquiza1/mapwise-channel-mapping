# Platform Listing Sync

This replaces the temporary "Import supplier JSON" flow with a two-step sync from the
BookingPal platform MySQL database. The hosted Mapwise app never holds MySQL
credentials or reaches the VPN — extraction happens on a VPN-connected machine and the
result is posted into Mapwise.

```
 VPN machine                              public internet            Cloudflare
┌─────────────────────────┐   read-only  ┌──────────────┐  HTTPS   ┌──────────────┐
│ sync/extract-listings.mjs│ ───────────▶ │ platform JSON │ ───────▶ │ POST /api/sync│──▶ D1
│  (mysql2, .env creds)    │   SELECTs    │  {listings:[]}│  Bearer  │  (record_kind │
└─────────────────────────┘              └──────────────┘  token   │   = platform) │
        edb3.bookingpal.org                                          └──────────────┘
```

## 1. Extract (runs on the VPN machine)

`sync/extract-listings.mjs` reuses the same `.env` and dependencies as `db-tools.js`
(`mysql2`, `dotenv`; `MYSQL_USER`, `MYSQL_PASS`, `MYSQL_DATABASE`). It runs the read-only
queries from `sql/platform_listing_extract.sql` per `product.State = 'Created'` listing
and emits the normalized `PlatformListing` shape.

```bash
# newest 50 Created listings -> file
node sync/extract-listings.mjs --limit 50 --out listings.json

# specific products
node sync/extract-listings.mjs --ids 123,456 --out listings.json
node sync/extract-listings.mjs --ids-from ids.txt --out listings.json

# extract and push straight to Mapwise (needs MAPWISE_SYNC_URL + MAPWISE_SYNC_TOKEN)
node sync/extract-listings.mjs --limit 200 --post
```

It only ever issues `SELECT`s (guarded by `assertSelectOnly`) and never writes raw tax
numbers, addresses, or coordinates into its output — only presence/consistency flags.

## 2. Ingest — `POST /api/sync`

Accepts `{ listings: PlatformListing[], syncedAt?, source? }`. Two authenticated callers:

- **The runner** — `Authorization: Bearer <SYNC_TOKEN>`. It does not pass through the
  ChatGPT employee proxy, so it cannot carry an employee session. Set `SYNC_TOKEN` as a
  Worker secret in production (`wrangler secret put SYNC_TOKEN`); a dev value is injected
  by `vite.config.ts` for local testing.
- **A signed-in BookingPal employee** — for a manual sync from the UI (paste the runner's
  JSON into the "Sync platform listings" dialog).

Only `State = 'Created'` listings are ingested (see `LISTING_STATE.md`); others are
skipped and reported in the response. Each row is stored with `record_kind = 'platform'`,
`product_state`, `structure`, `source_version` (`product.version`), and `synced_at`.

## Schema-vs-extract reconciliation (verified against the live DB, 2026-08-03)

The `table-info/` docs disagreed with the extract SQL on three columns. `--describe` runs
against the live read-only DB resolved ALL THREE: the **extract SQL is correct** and the
docs were stale. No change to `sql/platform_listing_extract.sql` is required.

1. `product_bedroom.PrivateBathroom` — CONFIRMED present (`tinyint(1) NOT NULL default 0`).
   The extract's `pb.PrivateBathroom` is correct; the doc's `PrivatBathroom` was a typo.
2. `product.BpValidation` — CONFIRMED present (`tinyint(1) NOT NULL default 1`). The extract's
   `p.BpValidation` is correct; the doc simply omitted the column. (Also noted: `product.Bathroom`
   is a `double`, so fractional bath counts are real data — already modeled as a number.)
3. `attribute_mapping.ignore` — CONFIRMED present (`tinyint(1) NOT NULL default 0`). The
   extract's `WHERE \`ignore\` = 0` is correct; the doc omitted this reserved-word column.
