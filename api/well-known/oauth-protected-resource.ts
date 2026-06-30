// OAuth 2.0 Protected Resource Metadata (RFC 9728 / draft).
// Some MCP clients hit this first to learn which Authorization Server
// guards the resource at /api/mcp.

import { issuerFromRequest, jsonResponse, SUPPORTED_SCOPES } from '../_lib/mcpOAuth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });

  const issuer = issuerFromRequest(req);
  return jsonResponse({
    resource: `${issuer}/api/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: [...SUPPORTED_SCOPES],
  }, 200, corsHeaders());
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=300',
  };
}
