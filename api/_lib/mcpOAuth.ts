// Shared helpers for the Banner Ads Pro MCP OAuth flow.
// Imported by every endpoint in api/mcp/* and api/well-known/*.
//
// Why a shared helper:
//   - Issuer URL must match exactly across discovery / authorize / token —
//     compute once from the incoming request and reuse.
//   - Supabase service-role access centralized (writes to mcp_oauth_* tables
//     skip user JWT because OAuth endpoints are pre-auth).
//   - Random ID / token generation kept in one place so we can swap
//     algorithms (e.g. tie tokens to a Vault key) without scattering changes.

export const ACCESS_TOKEN_TTL_SECONDS  = 60 * 60;            // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;  // 30 days
export const AUTH_CODE_TTL_SECONDS     = 60 * 10;            // 10 min

/** Scopes the MCP server understands. Keep tight + human-readable so the
 *  consent screen reads naturally. */
export const SUPPORTED_SCOPES = [
  'banners:read',
  'banners:write',
  'drafts:read',
  'drafts:write',
  'brand:read',
] as const;
export type Scope = typeof SUPPORTED_SCOPES[number];

/** Derive the issuer URL from the incoming request — works across
 *  bannerads.coachio.ai, *.vercel.app preview, and localhost dev. */
export function issuerFromRequest(req: Request): string {
  const url = new URL(req.url);
  // Vercel forwards the original host in this header when behind their proxy.
  const host = req.headers.get('x-forwarded-host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

// ─── Token / ID generation ───
// Uses Web Crypto API (available in Vercel Edge runtime).

function base64url(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLen = 32): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export function generateClientId(): string {
  return 'bap_client_' + randomToken(8);
}

// ─── PKCE S256 verification ───
export async function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: 'S256' | 'plain',
): Promise<boolean> {
  if (method === 'plain') return codeVerifier === codeChallenge;
  // S256: BASE64URL(SHA256(verifier)) === challenge
  const encoded = new TextEncoder().encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  const computed = base64url(new Uint8Array(hash));
  return computed === codeChallenge;
}

// ─── Supabase REST helpers (service role) ───
//
// Edge runtime can't use @supabase/supabase-js cleanly, and OAuth endpoints
// run pre-authentication. Service role bypasses RLS to insert/read rows in
// mcp_oauth_* tables. Never expose this token to the client.

function supabaseHeaders(): HeadersInit {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

export async function supaInsert<T = any>(table: string, row: any): Promise<T> {
  const supaUrl = process.env.SUPABASE_URL!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table} ${res.status}: ${await res.text()}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

export async function supaSelectOne<T = any>(table: string, filter: string): Promise<T | null> {
  const supaUrl = process.env.SUPABASE_URL!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}?${filter}&limit=1`, {
    headers: supabaseHeaders(),
  });
  if (!res.ok) throw new Error(`Supabase select ${table} ${res.status}: ${await res.text()}`);
  const arr = await res.json();
  return arr[0] || null;
}

export async function supaUpdate(table: string, filter: string, patch: any): Promise<void> {
  const supaUrl = process.env.SUPABASE_URL!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase update ${table} ${res.status}: ${await res.text()}`);
}

// ─── Verify a user's Supabase JWT (for the consent / authorize step) ───
export async function verifyUserJwt(jwt: string): Promise<{ id: string; email?: string } | null> {
  const supaUrl = process.env.SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: supaKey },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.id) return null;
  return { id: data.id, email: data.email };
}

// ─── JSON helper ───
export function jsonResponse(body: any, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

export function errorResponse(error: string, description: string, status = 400): Response {
  return jsonResponse({ error, error_description: description }, status);
}
