// GET /api/mcp/pending — SPA consent page reads pending authorization details
// (client name + scopes) from the cookie set by /authorize, so it can render
// "Claude wants permission to ... — Allow / Deny".

import { errorResponse, jsonResponse } from '../_lib/mcpOAuth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return errorResponse('invalid_request', 'GET only', 405);

  const cookieHeader = req.headers.get('Cookie') || '';
  const match = cookieHeader.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('mcp_oauth_pending='));
  if (!match) return errorResponse('not_found', 'No pending authorization', 404);

  try {
    const value = match.split('=', 2)[1];
    const decoded = atob(value);
    const parsed = JSON.parse(decoded);
    if (Date.now() - parsed.issued_at > 10 * 60 * 1000) {
      return errorResponse('expired', 'Pending authorization expired', 410);
    }
    // Echo only the user-visible fields.
    return jsonResponse({
      client_id: parsed.client_id,
      client_name: parsed.client_name,
      redirect_uri: parsed.redirect_uri,
      scope: parsed.scope,
    });
  } catch {
    return errorResponse('invalid_request', 'Could not parse pending cookie', 400);
  }
}
