// Sync per-user API keys from frontend localStorage to Supabase, so the
// MCP server can read them server-side when Claude triggers a banner gen.
//
// GET   /api/user-keys → returns {coachio_api_key} (or null)
// POST  /api/user-keys → upserts the row
// DELETE /api/user-keys → clears the row
//
// All routes require the user's Supabase JWT.

export const config = { runtime: 'edge' };

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bad(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function verifyUser(token: string): Promise<{ id: string } | null> {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return null;
  const res = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supaKey },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.id) return null;
  return { id: data.id };
}

function svcHeaders(): HeadersInit {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

export default async function handler(req: Request): Promise<Response> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return bad('Missing Bearer token', 401);

  const user = await verifyUser(token);
  if (!user) return bad('Invalid session', 401);

  const supaUrl = process.env.SUPABASE_URL!;
  const tableUrl = `${supaUrl}/rest/v1/user_api_keys`;

  if (req.method === 'GET') {
    const res = await fetch(
      `${tableUrl}?user_id=eq.${user.id}&select=coachio_api_key,firecrawl_api_key&limit=1`,
      { headers: svcHeaders() },
    );
    if (!res.ok) return bad(`Read failed ${res.status}`, 500);
    const arr = await res.json();
    return json({
      coachio_api_key:   arr[0]?.coachio_api_key   || null,
      firecrawl_api_key: arr[0]?.firecrawl_api_key || null,
    });
  }

  if (req.method === 'POST') {
    let body: any;
    try { body = await req.json(); } catch { return bad('Body must be JSON'); }

    // Build patch: only include fields the caller specified. This lets clients
    // update Coachio key WITHOUT clobbering an existing Firecrawl key (and vice
    // versa), and lets either field be cleared explicitly by passing null.
    const patch: Record<string, any> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (Object.prototype.hasOwnProperty.call(body, 'coachio_api_key')) {
      patch.coachio_api_key = typeof body.coachio_api_key === 'string' ? body.coachio_api_key.trim() : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'firecrawl_api_key')) {
      patch.firecrawl_api_key = typeof body.firecrawl_api_key === 'string' ? body.firecrawl_api_key.trim() : null;
    }
    if (Object.keys(patch).length <= 2) return bad('No key field provided');

    const res = await fetch(tableUrl, {
      method: 'POST',
      headers: { ...svcHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return bad(`Upsert failed ${res.status}: ${await res.text()}`, 500);
    return json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const res = await fetch(`${tableUrl}?user_id=eq.${user.id}`, {
      method: 'DELETE',
      headers: { ...svcHeaders(), Prefer: 'return=minimal' },
    });
    if (!res.ok) return bad(`Delete failed ${res.status}`, 500);
    return json({ ok: true });
  }

  return bad('Method not allowed', 405);
}
