import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    // Dev-only sync token so /api/sync is exercisable locally. A production build is
    // identified by a real D1_DATABASE_ID being supplied; there the default is omitted
    // so /api/sync ships with no token until the Worker secret is set via `wrangler
    // secret put SYNC_TOKEN`, and that secret is not clobbered on redeploy. Never commit
    // a real token.
    ...(process.env.SYNC_TOKEN
      ? { SYNC_TOKEN: process.env.SYNC_TOKEN }
      : process.env.D1_DATABASE_ID
        ? {}
        : { SYNC_TOKEN: "dev-sync-token" }),
    // Cloudflare Access config, supplied at build/deploy time from the Access
    // application (see docs/DEPLOY.md). Empty locally, where auth uses the dev
    // bypass that Vite compiles out of the production build.
    ACCESS_TEAM_DOMAIN: process.env.ACCESS_TEAM_DOMAIN ?? "",
    ACCESS_AUD: process.env.ACCESS_AUD ?? "",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: process.env.D1_DATABASE_NAME ?? "site-creator-d1",
          database_id: process.env.D1_DATABASE_ID ?? SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
