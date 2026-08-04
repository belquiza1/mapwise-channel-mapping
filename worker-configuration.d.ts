/// <reference types="@cloudflare/workers-types" />

// Runtime bindings exposed to route handlers via `import { env } from
// "cloudflare:workers"`. `@cloudflare/workers-types` types that `env` as the
// (empty, augmentable) `Cloudflare.Env` interface; we augment it here so
// `tsc --noEmit` sees the real binding shape used across the app.
declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    // Shared secret for the VPN-local sync runner to authenticate to /api/sync.
    // Set as a Worker secret in production; a dev value is injected via vite.config.ts.
    SYNC_TOKEN?: string;
    // Cloudflare Access config for employee auth. ACCESS_TEAM_DOMAIN is the team
    // hostname (e.g. "bookingpal.cloudflareaccess.com"); ACCESS_AUD is the Access
    // application's audience tag. Both are set at build/deploy time; when either is
    // absent, production auth fails closed (see app/access-auth.ts).
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    IMAGES: {
      input(stream: ReadableStream): {
        transform(options: Record<string, unknown>): {
          output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
        };
      };
    };
  }
}
