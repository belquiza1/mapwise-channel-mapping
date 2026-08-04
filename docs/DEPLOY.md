# Deploying Mapwise to Cloudflare

Mapwise runs as a Cloudflare Worker (built by `@cloudflare/vite-plugin`) with a D1
database and **Cloudflare Access** in front for employee sign-in. Access authenticates
each user against **Google Workspace** and only lets `@bookingpal.com` addresses reach the
app; the Worker independently verifies the Access JWT, so the gate holds even if a request
somehow reaches the origin directly.

This runbook is a one-time setup plus a repeatable deploy. Steps marked **[you]** require
the Cloudflare dashboard or an interactive login and can't be scripted from the repo.

---

## 0. Prerequisites

- **[you]** A Cloudflare account (free tier is fine to start) and a Google Workspace admin
  who can approve the Access ↔ Google integration.
- Authenticate the CLI once:

```bash
npx wrangler login
```

## 1. Create the D1 database

```bash
npx wrangler d1 create mapwise
```

Copy the `database_id` it prints — you'll pass it to the build in step 4.

## 2. Apply the schema

The migrations are plain SQL under `drizzle/`. Apply them to the remote D1 in order:

```bash
npx wrangler d1 execute mapwise --remote --file drizzle/0000_special_nomad.sql
npx wrangler d1 execute mapwise --remote --file drizzle/0001_add_platform_sync.sql
```

Verify the table exists:

```bash
npx wrangler d1 execute mapwise --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

## 3. Set up Cloudflare Access **[you]** — yields `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD`

In the Cloudflare dashboard → **Zero Trust**:

1. **Settings → Authentication → Login methods → Add → Google Workspace.** Follow the
   prompts (your Google admin approves it). This lets employees sign in with their
   existing BookingPal Google account.
2. Note your **team domain** under **Settings → Custom Pages** (or the Zero Trust
   overview) — it looks like `bookingpal.cloudflareaccess.com`. This is `ACCESS_TEAM_DOMAIN`.
3. **Access → Applications → Add an application → Self-hosted.**
   - Application domain: the hostname the app will serve on (in step 4 that's the
     `*.workers.dev` URL; move to a custom domain later).
   - Identity providers: enable **Google Workspace** only.
   - After creating it, open the application and copy its **Application Audience (AUD)
     tag** — this is `ACCESS_AUD`.
4. **Add a policy** to the application:
   - Action: **Allow**
   - Include → **Emails ending in** → `@bookingpal.com`

Anyone outside `@bookingpal.com` is now blocked at the edge before the Worker runs.

## 4. Build and deploy

Pass the D1 id and Access values as build env vars so the plugin bakes them into the
Worker config, then deploy:

```bash
D1_DATABASE_NAME=mapwise \
D1_DATABASE_ID=<database_id-from-step-1> \
ACCESS_TEAM_DOMAIN=<your-team>.cloudflareaccess.com \
ACCESS_AUD=<aud-tag-from-step-3> \
npm run build

npx wrangler deploy
```

`wrangler deploy` prints the live `*.workers.dev` URL. If you set the Access application
domain to that URL in step 3, sign-in works immediately.

## 5. Set the sync token secret

The VPN-local extract runner authenticates to `/api/sync` with a bearer token. Generate a
strong one, store it in the team password manager, and set it as a Worker secret:

```bash
npx wrangler secret put SYNC_TOKEN
# paste the generated token when prompted
```

The runner then uses the same value as `MAPWISE_SYNC_TOKEN` (see `docs/SYNC.md`).

> The production build omits the dev `SYNC_TOKEN` var, so this secret is not overwritten on
> redeploy. Do **not** also pass `SYNC_TOKEN=` to `npm run build` — that would bake it in as
> a plaintext var and shadow the secret.

## 6. Smoke test (do this on first deploy)

The Access JWT verification can only be exercised against a live Access setup, so confirm:

1. **Employee access** — open the URL in a browser, sign in with a `@bookingpal.com`
   Google account. You should reach the Mapwise dashboard.
2. **Outsider blocked** — try a non-BookingPal Google account (or incognito). Access should
   refuse before the app loads.
3. **Manual sync** — signed in, open **Sync platform listings**, paste a runner JSON file,
   confirm it ingests.
4. **Runner auth** — `POST /api/sync` with `Authorization: Bearer <SYNC_TOKEN>` succeeds;
   the same request with a wrong/absent token returns **403**.

If step 1 fails (you're bounced or see "Access restricted"), the first suspects are
`ACCESS_AUD` / `ACCESS_TEAM_DOMAIN` — confirm they match the Access application exactly and
rebuild.

## 7. Custom domain (optional, later)

Once proven on `*.workers.dev`, add a route for `mapwise.bookingpal.com`
(**Workers → your worker → Settings → Domains & Routes**), then update the Access
application domain to the custom hostname. No code change required.

---

### What lives where

| Value | Where it's set | Sensitive? |
|---|---|---|
| `D1_DATABASE_ID` | build env → Worker config | no |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | build env → Worker vars | no |
| `SYNC_TOKEN` | `wrangler secret put` | **yes** — password manager |
| Google Workspace link | Cloudflare Zero Trust dashboard | n/a |
