// OAuth 2.0 Authorization Server Metadata (RFC 8414).
// Published at /.well-known/oauth-authorization-server (vercel.json rewrite).
//
// MCP clients (Claude Desktop / ChatGPT) fetch this first to discover where
// to register / authorize / exchange tokens — we just return JSON.

import { issuerFromRequest, jsonResponse, SUPPORTED_SCOPES } from '../_lib/mcpOAuth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });

  const issuer = issuerFromRequest(req);
  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/api/mcp/authorize`,
    token_endpoint:         `${issuer}/api/mcp/token`,
    registration_endpoint:  `${issuer}/api/mcp/register`,
    revocation_endpoint:    `${issuer}/api/mcp/revoke`,

    response_types_supported: ['code'],
    grant_types_supported:    ['authorization_code', 'refresh_token'],

    // PKCE is REQUIRED for MCP clients (public clients).
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],

    scopes_supported: [...SUPPORTED_SCOPES],

    // MCP-specific hints
    service_documentation: `${issuer}/docs/mcp`,
  };

  return jsonResponse(metadata, 200, corsHeaders());
}

function corsHeaders(): HeadersInit {
  // OAuth metadata must be readable cross-origin so the MCP client can
  // fetch it before any user interaction.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300',
  };
}
