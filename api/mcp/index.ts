// Banner Ads Pro MCP server — JSON-RPC over HTTP (Streamable HTTP transport).
//
// Sprint C ships only:
//   - initialize         → handshake
//   - tools/list         → empty stub (real tools come in Sprint D)
//   - notifications/initialized → ack
//
// Sprint D will add the real `list_banners`, `create_banner` etc tool
// implementations. The transport + auth scaffolding lives here permanently.

import {
  errorResponse, jsonResponse, supaSelectOne, supaUpdate,
} from '../_lib/mcpOAuth';
import { getTool, toolListResponse } from './tools';

export const config = { runtime: 'edge' };

const SERVER_INFO = {
  name: 'Banner Ads Pro',
  version: '0.12.0',
};

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: any;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id',
      },
    });
  }

  // Streamable HTTP supports GET for SSE (server-initiated streams) — we
  // don't push anything yet, so return 405 with a hint.
  if (req.method === 'GET') {
    return new Response('SSE stream not implemented (Sprint C scaffold)', {
      status: 405,
      headers: { Allow: 'POST, OPTIONS' },
    });
  }

  if (req.method !== 'POST') return errorResponse('invalid_request', 'POST only', 405);

  // ─── Auth: validate Bearer access token ───
  const authHeader = req.headers.get('Authorization') || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Authentication required' },
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="banner-ads-pro-mcp"',
      },
    });
  }

  const tokenRow = await supaSelectOne<any>(
    'mcp_oauth_tokens',
    `access_token=eq.${accessToken}&select=user_id,scope,expires_at,revoked_at`,
  );
  if (!tokenRow) return rpcError(null, -32001, 'Invalid access token', 401);
  if (tokenRow.revoked_at) return rpcError(null, -32001, 'Token revoked', 401);
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return rpcError(null, -32001, 'Token expired', 401);
  }

  // Update last_used (fire-and-forget — don't block on this).
  supaUpdate('mcp_oauth_tokens', `access_token=eq.${accessToken}`, {
    last_used_at: new Date().toISOString(),
  }).catch(() => {});

  // ─── Parse JSON-RPC request ───
  let rpc: JsonRpcRequest;
  try { rpc = await req.json(); } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  if (rpc.jsonrpc !== '2.0' || !rpc.method) {
    return rpcError(rpc.id ?? null, -32600, 'Invalid request');
  }

  // ─── Dispatch ───
  switch (rpc.method) {
    case 'initialize':
      return rpcResult(rpc.id ?? null, {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
      });

    case 'notifications/initialized':
      // Notifications have no id — return 202 with no body per spec.
      return new Response(null, { status: 202 });

    case 'tools/list':
      // Return only tools the granted scope covers — narrower scope = fewer tools.
      return rpcResult(rpc.id ?? null, toolListResponse(tokenRow.scope || []));

    case 'tools/call': {
      const name = rpc.params?.name;
      const args = rpc.params?.arguments || {};
      if (!name) return rpcError(rpc.id ?? null, -32602, 'Missing tool name');
      const tool = getTool(name);
      if (!tool) return rpcError(rpc.id ?? null, -32601, `Unknown tool: ${name}`);

      // Scope enforcement — refuse if granted scope misses any required scope.
      const grantedScope: string[] = tokenRow.scope || [];
      const missing = tool.requiredScopes.filter(s => !grantedScope.includes(s));
      if (missing.length > 0) {
        return rpcError(rpc.id ?? null, -32001,
          `Token missing required scope(s): ${missing.join(', ')}`, 403);
      }

      try {
        const result = await tool.handler(args, {
          userId: tokenRow.user_id,
          scope: grantedScope,
          accessToken,
        });
        return rpcResult(rpc.id ?? null, result);
      } catch (e: any) {
        return rpcResult(rpc.id ?? null, {
          content: [{ type: 'text', text: `Tool ${name} error: ${e?.message || String(e)}` }],
          isError: true,
        });
      }
    }

    case 'ping':
      return rpcResult(rpc.id ?? null, {});

    default:
      return rpcError(rpc.id ?? null, -32601, `Method not found: ${rpc.method}`);
  }
}

function rpcResult(id: any, result: any, status = 200): Response {
  return jsonResponse(
    { jsonrpc: '2.0', id, result },
    status,
    { 'Access-Control-Allow-Origin': '*' },
  );
}

function rpcError(id: any, code: number, message: string, httpStatus = 200): Response {
  return jsonResponse(
    { jsonrpc: '2.0', id, error: { code, message } },
    httpStatus,
    { 'Access-Control-Allow-Origin': '*' },
  );
}
