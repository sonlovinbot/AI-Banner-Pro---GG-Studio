// OAuth /token endpoint — RFC 6749 §3.2 + RFC 7636 (PKCE).
//
// Handles two grant types:
//   - authorization_code:  exchange code + verifier → access + refresh token
//   - refresh_token:       exchange refresh_token → new access + refresh
//
// Public-client only (token_endpoint_auth_method = "none") — security comes
// from PKCE + redirect_uri match + single-use codes.

import {
  ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS,
  errorResponse, jsonResponse, randomToken, supaInsert, supaSelectOne,
  supaUpdate, verifyCodeChallenge,
} from '../_lib/mcpOAuth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (req.method !== 'POST') return errorResponse('invalid_request', 'POST only', 405);

  // Token endpoint accepts application/x-www-form-urlencoded (per spec) AND
  // application/json (some MCP clients use it). Handle both.
  const contentType = (req.headers.get('Content-Type') || '').toLowerCase();
  let params: Record<string, string>;
  try {
    if (contentType.includes('application/json')) {
      params = await req.json();
    } else {
      const text = await req.text();
      params = Object.fromEntries(new URLSearchParams(text));
    }
  } catch {
    return errorResponse('invalid_request', 'Could not parse body');
  }

  const grantType = params.grant_type;
  if (grantType === 'authorization_code') return exchangeCode(params);
  if (grantType === 'refresh_token')      return refreshAccess(params);
  return errorResponse('unsupported_grant_type', `Unknown grant_type: ${grantType}`);
}

// ─── authorization_code → access + refresh ───
async function exchangeCode(p: Record<string, string>): Promise<Response> {
  const code         = p.code;
  const codeVerifier = p.code_verifier;
  const clientId     = p.client_id;
  const redirectUri  = p.redirect_uri;

  if (!code)         return errorResponse('invalid_request', 'code required');
  if (!codeVerifier) return errorResponse('invalid_request', 'code_verifier required (PKCE)');
  if (!clientId)     return errorResponse('invalid_request', 'client_id required');
  if (!redirectUri)  return errorResponse('invalid_request', 'redirect_uri required');

  // 1. Look up code + validate.
  const row = await supaSelectOne<any>('mcp_oauth_codes', `code=eq.${code}&select=*`);
  if (!row)        return errorResponse('invalid_grant', 'Code not found');
  if (row.used)    return errorResponse('invalid_grant', 'Code already used');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return errorResponse('invalid_grant', 'Code expired');
  }
  if (row.client_id !== clientId)      return errorResponse('invalid_grant', 'client_id mismatch');
  if (row.redirect_uri !== redirectUri) return errorResponse('invalid_grant', 'redirect_uri mismatch');

  // 2. PKCE verification.
  const ok = await verifyCodeChallenge(codeVerifier, row.code_challenge, row.code_challenge_method);
  if (!ok) return errorResponse('invalid_grant', 'PKCE verification failed');

  // 3. Mark code used (single use — defense against replay).
  await supaUpdate('mcp_oauth_codes', `code=eq.${code}`, { used: true });

  // 4. Issue access + refresh tokens.
  return issueTokens({ clientId: row.client_id, userId: row.user_id, scope: row.scope });
}

// ─── refresh_token → new access (+ rotated refresh) ───
async function refreshAccess(p: Record<string, string>): Promise<Response> {
  const refreshToken = p.refresh_token;
  const clientId     = p.client_id;
  if (!refreshToken) return errorResponse('invalid_request', 'refresh_token required');
  if (!clientId)     return errorResponse('invalid_request', 'client_id required');

  const row = await supaSelectOne<any>(
    'mcp_oauth_tokens',
    `refresh_token=eq.${refreshToken}&select=*`,
  );
  if (!row)               return errorResponse('invalid_grant', 'Refresh token not found');
  if (row.revoked_at)     return errorResponse('invalid_grant', 'Refresh token revoked');
  if (row.client_id !== clientId) return errorResponse('invalid_grant', 'client_id mismatch');
  if (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() < Date.now()) {
    return errorResponse('invalid_grant', 'Refresh token expired');
  }

  // Revoke the old row (rotation) and issue fresh tokens.
  await supaUpdate('mcp_oauth_tokens', `access_token=eq.${row.access_token}`, {
    revoked_at: new Date().toISOString(),
  });
  return issueTokens({ clientId: row.client_id, userId: row.user_id, scope: row.scope });
}

// ─── shared issuer ───
async function issueTokens(args: {
  clientId: string;
  userId: string;
  scope: string[];
}): Promise<Response> {
  const accessToken  = randomToken(32);
  const refreshToken = randomToken(32);
  const now = Date.now();
  const expiresAt        = new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

  try {
    await supaInsert('mcp_oauth_tokens', {
      access_token: accessToken,
      refresh_token: refreshToken,
      client_id: args.clientId,
      user_id: args.userId,
      scope: args.scope,
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
    });
  } catch (e: any) {
    return errorResponse('server_error', `Could not persist token: ${e?.message || e}`, 500);
  }

  return jsonResponse({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: args.scope.join(' '),
  }, 200, { 'Access-Control-Allow-Origin': '*' });
}
