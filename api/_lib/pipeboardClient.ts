// Pipeboard MCP client — JSON-RPC 2.0 over HTTP.
// Lets the Edge function push to Meta Ads via Pipeboard's hosted MCP
// server, bypassing the Meta App tier / App Review nightmare. Pipeboard
// has its own Standard Access Marketing App and acts as a managed proxy.
//
// Auth: Bearer token from https://pipeboard.co/api-tokens (free plan
// allows 30 tool calls/week — enough for ~6 full pushes).
//
// Endpoint:
//   POST https://meta-ads.mcp.pipeboard.co/
//   Authorization: Bearer pk_xxx
//   body: { jsonrpc, id, method: 'tools/call', params: { name, arguments } }

const PIPEBOARD_BASE = 'https://meta-ads.mcp.pipeboard.co/';

export class PipeboardError extends Error {
  constructor(public toolName: string, public code: number, message: string, public detail?: any) {
    super(`Pipeboard ${toolName} error ${code}: ${message}`);
    this.name = 'PipeboardError';
  }
}

/** Call a Pipeboard MCP tool. Returns the parsed tool output. */
export async function callPipeboardTool<T = any>(
  toolName: string,
  args: Record<string, any>,
  token: string,
): Promise<T> {
  const reqId = Math.floor(Math.random() * 1e9);
  const body = {
    jsonrpc: '2.0',
    id: reqId,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };

  let res: Response;
  try {
    res = await fetch(PIPEBOARD_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    throw new PipeboardError(toolName, -1, `network: ${e?.message || e}`);
  }

  const text = await res.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch {
    throw new PipeboardError(toolName, res.status, `non-JSON response: ${text.slice(0, 200)}`);
  }

  if (payload.error) {
    throw new PipeboardError(
      toolName,
      payload.error.code || res.status,
      payload.error.message || 'unknown',
      payload.error.data,
    );
  }

  // MCP tools/call result has shape { content: [{type:'text', text:'<json>'}], isError? }
  const result = payload.result;
  if (result?.isError) {
    const errText = result?.content?.[0]?.text || 'tool reported error';
    throw new PipeboardError(toolName, res.status, errText);
  }
  const content = result?.content?.[0];
  let parsed: any;
  if (content?.type === 'text' && content.text) {
    try { parsed = JSON.parse(content.text); } catch {
      return { text: content.text } as any;
    }
  } else {
    parsed = result ?? payload;
  }

  // Pipeboard often wraps the actual tool output in { data: "<json string>" }.
  // When Meta returned an error (e.g. "Unsupported post request"), Pipeboard
  // packages it inside `data` rather than the top-level `error` field, so we
  // have to unwrap and re-check before treating the response as success.
  if (parsed && typeof parsed.data === 'string') {
    let inner: any;
    try { inner = JSON.parse(parsed.data); } catch { inner = { raw: parsed.data }; }
    if (inner && inner.error) {
      // Drill into nested error shapes Pipeboard/Meta layer on top of each other
      const flatten = (e: any): string => {
        if (!e) return '';
        if (typeof e === 'string') return e;
        if (e.message) return e.message + (e.details ? ` — ${flatten(e.details)}` : '');
        if (e.error) return flatten(e.error);
        return JSON.stringify(e).slice(0, 300);
      };
      throw new PipeboardError(toolName, res.status, flatten(inner.error), inner);
    }
    parsed = inner;
  }
  return parsed as T;
}
