# Mapwise scheduled platform sync — run ~2x/day via Windows Task Scheduler.
#
# Prerequisites on this machine:
#   - The BookingPal VPN is connected (edb3.bookingpal.org must resolve).
#   - Node.js is installed and on PATH.
#   - ..\.env (one level above the repo) holds MYSQL_USER / MYSQL_PASS / MYSQL_DATABASE,
#     plus the two values below:
#       MAPWISE_SYNC_URL   = https://mapwise-channel-mapping.bookingpal.workers.dev/api/sync
#       MAPWISE_SYNC_TOKEN = <the Worker SYNC_TOKEN secret you set with `wrangler secret put`>
#
# The runner posts redacted listings straight into Mapwise's /api/sync — it never writes
# raw tax numbers, addresses, or coordinates.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot          # ...\mapwise-channel-mapping
Set-Location $repo

# Load ..\.env (KEY=VALUE lines) into this process's environment.
$envFile = Join-Path (Split-Path -Parent $repo) ".env"
if (-not (Test-Path $envFile)) { throw "Missing env file: $envFile" }
Get-Content $envFile | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } | ForEach-Object {
  $pair = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1].Trim(), 'Process')
}

$logDir = Join-Path $repo 'sync\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

"Mapwise sync starting $(Get-Date -Format o)" | Tee-Object -FilePath $log
# --limit controls scope (newest-by-version). See docs/SCHEDULING.md — the right scope
# for the worklist is still being tuned; adjust the number or switch to a targeted filter.
node sync/extract-listings.mjs --limit 500 --post *>&1 | Tee-Object -FilePath $log -Append
"Mapwise sync finished $(Get-Date -Format o)" | Tee-Object -FilePath $log -Append
