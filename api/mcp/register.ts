// RFC 7591 — Dynamic Client Registration.
// MCP clients (Claude Desktop / ChatGPT) call this without auth to register
// themselves and receive a client_id. We keep client registration open
// (anyone can register) but bind issued tokens to real Supabase users at
// authorize time, so a stray client_id alone can't do anything.

import {
  errorResponse, generateClientId, jsonResponse, supaInsert,
} from '../_lib/mcpOAuth';

export const config = { runtime: 'edge' };

interface RegistrationRequest {
  redirect_uris?: string[];
  client_name?: string;
  grant_types?: string[];
  token_endpoint_auth_method?: string;
  software_id?: string;
  software_version?: string;
  scope?: string;  // space-separated, optional
}

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

  let body: RegistrationRequest;
  try { body = await req.json(); } catch {
    return errorResponse('invalid_request', 'Body must be valid JSON');
  }

  // redirect_uris is the only field we actually need to validate — everything
  // else has sensible defaults.
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    return errorResponse('invalid_redirect_uri', 'redirect_uris required (array)');
  }
  for (const uri of body.redirect_uris) {
    try {
      const parsed = new URL(uri);
      // Allow https://, http://localhost (dev), and custom schemes (claude://, cursor://)
      if (
        parsed.protocol !== 'https:' &&
        !(parsed.protocol === 'http:' && parsed.hostname === 'localhost') &&
        !parsed.protocol.match(/^[a-z][a-z0-9+\-.]*:$/)
      ) {
        return errorResponse('invalid_redirect_uri', `Unsupported scheme: ${uri}`);
      }
    } catch {
      return errorResponse('invalid_redirect_uri', `Malformed URI: ${uri}`);
    }
  }

  const clientId = generateClientId();
  const grantTypes = body.grant_types && body.grant_types.length > 0
    ? body.grant_types
    : ['authorization_code', 'refresh_token'];

  try {
    await supaInsert('mcp_oauth_clients', {
      id: clientId,
      client_name: body.client_name || 'Unnamed MCP client',
      redirect_uris: body.redirect_uris,
      grant_types: grantTypes,
      token_endpoint_auth_method: body.token_endpoint_auth_method || 'none',
      software_id: body.software_id || null,
      software_version: body.software_version || null,
    });
  } catch (e: any) {
    return errorResponse('server_error', `Could not persist client: ${e?.message || e}`, 500);
  }

  // Per RFC 7591 §3.2.1 the response echoes back the registration metadata
  // plus the generated client_id (+ optional client_secret, omitted for public clients).
  return jsonResponse({
    client_id: clientId,
    client_name: body.client_name || 'Unnamed MCP client',
    redirect_uris: body.redirect_uris,
    grant_types: grantTypes,
    token_endpoint_auth_method: body.token_endpoint_auth_method || 'none',
    client_id_issued_at: Math.floor(Date.now() / 1000),
  }, 201, { 'Access-Control-Allow-Origin': '*' });
}
