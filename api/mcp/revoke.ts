// RFC 7009 — Token Revocation.
// MCP client (or Settings → Connected apps) calls this to invalidate a
// token. We accept either access_token or refresh_token; both stamp the
// row as revoked.

import { errorResponse, supaUpdate } from '../_lib/mcpOAuth';

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

  const contentType = (req.headers.get('Content-Type') || '').toLowerCase();
  let params: Record<string, string>;
  try {
    if (contentType.includes('application/json')) {
      params = await req.json();
    } else {
      params = Object.fromEntries(new URLSearchParams(await req.text()));
    }
  } catch {
    return errorResponse('invalid_request', 'Could not parse body');
  }

  const token = params.token;
  const hint = params.token_type_hint;  // optional: 'access_token' | 'refresh_token'
  if (!token) return errorResponse('invalid_request', 'token required');

  const filter = hint === 'refresh_token'
    ? `refresh_token=eq.${token}`
    : `access_token=eq.${token}`;

  try {
    await supaUpdate('mcp_oauth_tokens', filter, {
      revoked_at: new Date().toISOString(),
    });
  } catch {
    // Per RFC 7009 §2.2 we respond 200 even on unknown tokens — don't leak
    // which tokens exist.
  }

  return new Response(null, {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
