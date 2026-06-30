// /api/mcp/approve — called by the SPA consent page after the user clicks
// Allow or Deny. We:
//   1. Read the pending authorization cookie set by /authorize
//   2. Verify the caller's Supabase JWT (so we know who is granting consent)
//   3. If approved: insert an authorization code row and redirect to the
//      client's redirect_uri with ?code=...&state=...
//   4. If denied: redirect with ?error=access_denied&state=...
//
// The cookie is intentionally short-lived (10 min) so abandoned consent
// pages can't leak credentials later.

import {
  AUTH_CODE_TTL_SECONDS, errorResponse, jsonResponse,
  randomToken, supaInsert, verifyUserJwt,
} from '../_lib/mcpOAuth';

export const config = { runtime: 'edge' };

interface ApproveBody {
  /** 'allow' | 'deny' */
  decision: 'allow' | 'deny';
  /** Scopes the user actually agreed to (subset of pending.scope). */
  scope?: string[];
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errorResponse('invalid_request', 'POST only', 405);

  // 1. Read pending authorization from cookie set by /authorize.
  const cookie = parsePendingCookie(req.headers.get('Cookie') || '');
  if (!cookie) {
    return errorResponse('invalid_request', 'No pending authorization (expired or missing)', 400);
  }

  // 2. Verify the user is logged in.
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return errorResponse('login_required', 'Missing Bearer JWT', 401);

  const user = await verifyUserJwt(jwt);
  if (!user) return errorResponse('login_required', 'Invalid session', 401);

  // 3. Parse decision.
  let body: ApproveBody;
  try { body = await req.json(); } catch {
    return errorResponse('invalid_request', 'Body must be JSON');
  }

  if (body.decision === 'deny') {
    const redirect = appendQuery(cookie.redirect_uri, {
      error: 'access_denied',
      error_description: 'User denied authorization',
      state: cookie.state,
    });
    return jsonResponse({ redirect, cleared: true }, 200, { 'Set-Cookie': clearCookie() });
  }

  // 4. User allowed — generate authorization code and persist.
  const grantedScope = (body.scope && body.scope.length > 0)
    ? body.scope.filter((s: string) => cookie.scope.includes(s))
    : cookie.scope;

  const code = randomToken(32);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString();

  try {
    await supaInsert('mcp_oauth_codes', {
      code,
      client_id: cookie.client_id,
      user_id: user.id,
      code_challenge: cookie.code_challenge,
      code_challenge_method: cookie.code_challenge_method,
      redirect_uri: cookie.redirect_uri,
      scope: grantedScope,
      expires_at: expiresAt,
      used: false,
    });
  } catch (e: any) {
    return errorResponse('server_error', `Could not persist code: ${e?.message || e}`, 500);
  }

  const redirect = appendQuery(cookie.redirect_uri, {
    code,
    state: cookie.state,
  });
  return jsonResponse({ redirect, cleared: true }, 200, { 'Set-Cookie': clearCookie() });
}

// ─── helpers ───

interface PendingCookie {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: 'S256' | 'plain';
  scope: string[];
  issued_at: number;
}

function parsePendingCookie(cookieHeader: string): PendingCookie | null {
  const match = cookieHeader.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('mcp_oauth_pending='));
  if (!match) return null;
  const value = match.split('=', 2)[1];
  try {
    const decoded = atob(value);
    const parsed: PendingCookie = JSON.parse(decoded);
    if (Date.now() - parsed.issued_at > 10 * 60 * 1000) return null;  // 10 min
    return parsed;
  } catch {
    return null;
  }
}

function clearCookie(): string {
  return 'mcp_oauth_pending=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
}

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

