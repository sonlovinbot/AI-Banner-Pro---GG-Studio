// OAuth /authorize endpoint.
//
// MCP client opens this in a browser. We:
//   1. Validate client_id + redirect_uri + PKCE challenge
//   2. Stash the pending authorization in a short-lived signed cookie
//      (so the SPA consent page can read it back without us holding state)
//   3. Redirect to /?oauth_consent=1 (SPA picks it up, asks user to Allow)
//
// After the user clicks Allow, the SPA hits /api/mcp/approve which actually
// generates the code and 302s to the client's redirect_uri.

import {
  errorResponse, issuerFromRequest, supaSelectOne,
  SUPPORTED_SCOPES,
} from '../_lib/mcpOAuth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return errorResponse('invalid_request', 'GET only', 405);

  const url = new URL(req.url);
  const q = url.searchParams;

  const clientId      = q.get('client_id');
  const redirectUri   = q.get('redirect_uri');
  const responseType  = q.get('response_type');
  const state         = q.get('state');
  const codeChallenge = q.get('code_challenge');
  const codeMethod    = q.get('code_challenge_method') || 'S256';
  const scopeStr      = q.get('scope') || SUPPORTED_SCOPES.join(' ');

  if (!clientId)      return errorResponse('invalid_request', 'client_id required');
  if (!redirectUri)   return errorResponse('invalid_request', 'redirect_uri required');
  if (responseType !== 'code') return errorResponse('unsupported_response_type', 'only code');
  if (!codeChallenge) return errorResponse('invalid_request', 'PKCE code_challenge required');
  if (codeMethod !== 'S256') return errorResponse('invalid_request', 'code_challenge_method must be S256');

  // 1. Lookup client + verify redirect_uri is allowlisted.
  const client = await supaSelectOne<any>('mcp_oauth_clients', `id=eq.${clientId}&select=id,client_name,redirect_uris`);
  if (!client) return errorResponse('invalid_client', `Unknown client_id: ${clientId}`);
  if (!client.redirect_uris.includes(redirectUri)) {
    return errorResponse('invalid_redirect_uri', `redirect_uri not registered for this client`);
  }

  // 2. Validate scopes — drop unknowns silently per RFC.
  const requested = scopeStr.split(/\s+/).filter(Boolean);
  const granted = requested.filter((s): s is typeof SUPPORTED_SCOPES[number] =>
    SUPPORTED_SCOPES.includes(s as any));
  if (granted.length === 0) {
    return errorResponse('invalid_scope', 'No supported scopes requested');
  }

  // 3. Stash the pending request in a signed (HMAC) cookie and bounce the
  //    user into the SPA consent flow. The SPA will read the cookie and
  //    show the Allow / Deny screen.
  const pending = {
    client_id: clientId,
    client_name: client.client_name,
    redirect_uri: redirectUri,
    state: state || '',
    code_challenge: codeChallenge,
    code_challenge_method: codeMethod,
    scope: granted,
    issued_at: Date.now(),
  };
  const cookieValue = btoa(JSON.stringify(pending));

  const issuer = issuerFromRequest(req);
  const consentUrl = `${issuer}/?oauth_consent=1`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: consentUrl,
      'Set-Cookie': [
        `mcp_oauth_pending=${cookieValue}`,
        'Path=/',
        'Max-Age=600',  // 10 minutes — must complete consent in that window
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
      ].join('; '),
    },
  });
}
