/// <reference types="vite/client" />
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Employee identity via Cloudflare Access (Google Workspace IdP, gated to
// @bookingpal.com). Access authenticates the user at the edge and forwards the
// request with a signed JWT in the `Cf-Access-Jwt-Assertion` header. We VERIFY
// that JWT (signature against the team JWKS, plus aud/iss/exp) and take the email
// only from verified claims — the header alone is never trusted, so the gate holds
// even if a request reaches the Worker without passing through Access.
//
// Local dev has no Access in front of it, so the identity check is bypassed with a
// fixed dev user. That bypass is guarded by `import.meta.env.DEV`, which Vite inlines
// to `false` in the production build — it cannot ship to production.

export type AppUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

// BookingPal employees sign in under either domain (a legacy Google Workspace split
// that was never consolidated). The Cloudflare Access policy allows both; the app
// must match, or one domain's users would clear Access and then be rejected here.
const EMPLOYEE_DOMAINS = ["@bookingpal.com", "@mybookingpal.com"];

export function isEmployee(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  return EMPLOYEE_DOMAINS.some((domain) => normalized.endsWith(domain));
}

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";
const DEV_USER_EMAIL = "dev@bookingpal.com";

// Vite replaces import.meta.env.DEV with a literal at build time (false in prod).
const DEV_BYPASS = import.meta.env?.DEV === true;

export async function getUser(): Promise<AppUser | null> {
  if (DEV_BYPASS) {
    return { displayName: DEV_USER_EMAIL, email: DEV_USER_EMAIL, fullName: null };
  }

  const requestHeaders = await headers();
  const token = requestHeaders.get(ACCESS_JWT_HEADER);
  if (!token) return null;

  const claims = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  if (!claims?.email) return null;

  return {
    displayName: claims.name ?? claims.email,
    email: claims.email,
    fullName: claims.name ?? null,
  };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (user) return user;
  // Unauthenticated requests should not reach the origin behind Access; if one does
  // (or the JWT is missing/invalid), bounce through Access logout to force re-auth.
  redirect(ACCESS_LOGOUT_PATH);
}

export function signOutPath(): string {
  return ACCESS_LOGOUT_PATH;
}

// ---- Cloudflare Access JWT verification -------------------------------------

type AccessClaims = { email?: string; name?: string };

type Jwk = JsonWebKey & { kid?: string };

let jwksCache: { domain: string; keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(teamDomain: string): Promise<Jwk[] | null> {
  if (jwksCache && jwksCache.domain === teamDomain && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  let res: Response;
  try {
    res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = data.keys ?? [];
  jwksCache = { domain: teamDomain, keys, fetchedAt: Date.now() };
  return keys;
}

async function verifyAccessJwt(
  token: string,
  teamDomain: string | undefined,
  aud: string | undefined,
): Promise<AccessClaims | null> {
  // Missing config => fail closed (no one is authenticated).
  if (!token || !teamDomain || !aud) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; email?: string; name?: string };
  try {
    header = JSON.parse(b64urlToString(parts[0]));
    payload = JSON.parse(b64urlToString(parts[1]));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const keys = await getJwks(teamDomain);
  const jwk = keys?.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  } catch {
    return null;
  }

  const signed = new Uint8Array(new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const signature = b64urlToBytes(parts[2]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
  if (!valid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) return null;
  if (payload.iss !== `https://${teamDomain}`) return null;
  const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
  if (!audOk) return null;

  return { email: payload.email, name: payload.name };
}

function b64urlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlToString(input: string): string {
  return new TextDecoder().decode(b64urlToBytes(input));
}
