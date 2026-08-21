# Scheduled platform sync (~2×/day)

Mapwise reads its own synced copy of the platform data; a scheduled job on a
VPN-connected machine keeps that copy fresh. This sets up that job on Windows so
listings load automatically twice a day and reps can look any of them up by ID.

The script `sync/run-sync.ps1` does the work; Task Scheduler just runs it on a cadence.

---

## 1. One-time setup

**a. Create a Cloudflare Access service token** (lets the automated runner past Access —
the app hostname is Access-protected, and a script can't do the browser login):
- Zero Trust → **Access → Service Auth → Service Tokens → Create Service Token**. Name it
  `mapwise-sync`. Copy the **Client ID** and **Client Secret** (shown once).
- Add a policy so `/api/sync` accepts it: Zero Trust → **Access → Applications** →
  **Add an application → Self-hosted** → domain `mapwise-channel-mapping.bookingpal.workers.dev`,
  **path `api/sync`** → policy **Action: Service Auth**, Include → **Service Token** →
  `mapwise-sync`. (Path-scoped, so it only affects `/api/sync`; the rest of the app stays
  behind normal login.) This preserves the in-app paste dialog *and* enables the runner.

**b. Add the Mapwise values to `..\.env`** (the file one level above the repo that
already holds `MYSQL_USER` / `MYSQL_PASS` / `MYSQL_DATABASE`). It is gitignored — never
commit it:

```
MAPWISE_SYNC_URL=https://mapwise-channel-mapping.bookingpal.workers.dev/api/sync
MAPWISE_SYNC_TOKEN=<the SYNC_TOKEN you set with `wrangler secret put`>
CF_ACCESS_CLIENT_ID=<service token Client ID>
CF_ACCESS_CLIENT_SECRET=<service token Client Secret>
```

`MAPWISE_SYNC_TOKEN` must match the Worker secret (authenticates to the Worker); the
`CF_ACCESS_*` pair is the service token (gets the request past Access).

**b. Confirm the script runs by hand first** (VPN connected):

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\byrdm\OneDrive\EDB3\mapwise-channel-mapping\sync\run-sync.ps1"
```

It writes a timestamped log under `sync\logs\` and prints how many listings it posted.
Then open the app and **Look up ID** one of them to confirm it landed.

## 2. Create the scheduled task

**Task Scheduler → Create Task** (not "Basic Task"):

- **General:** name it `Mapwise Platform Sync`. Choose **"Run only when user is logged on"**
  (the VPN is usually only up while you're signed in — see the note below).
- **Triggers:** add **two** daily triggers, e.g. **7:00 AM** and **7:00 PM**.
- **Actions:** New → Start a program:
  - Program: `powershell.exe`
  - Arguments: `-NoProfile -ExecutionPolicy Bypass -File "C:\Users\byrdm\OneDrive\EDB3\mapwise-channel-mapping\sync\run-sync.ps1"`
- **Settings:** enable "Run task as soon as possible after a scheduled start is missed" so a
  sync that was skipped (laptop asleep) catches up when you're back.

## 3. Notes

- **VPN dependency.** If the VPN isn't connected when the task fires, the extract can't
  reach the DB and the run fails (logged, harmless — the next run recovers). Keeping the
  task to "when logged on" avoids firing during times the VPN is down. If you later move
  this to an always-on box with a persistent VPN, switch to "run whether logged on or not."
- **Freshness.** Twice a day means data can be up to ~12h old. For an urgent listing,
  use the in-app **Sync platform listings** paste dialog, or run
  `node sync/extract-listings.mjs --ids <id> --post` to push just that one immediately.
- **Scope (open item).** `run-sync.ps1` currently pulls the newest 500 by version
  (`--limit 500`). That's a starting point, not the final worklist — newest-by-version is
  known to surface test rows. Decide the real scope (e.g. a filter for listings not yet
  live on Booking.com / Vrbo / Expedia, or a larger/targeted pull) and adjust the runner
  call. Flagged in the build status doc as a decision.
- **Logs** accumulate in `sync\logs\` (gitignored). Prune periodically.
