// Firecrawl proxy — scrapes a public URL and returns markdown content the
// frontend can feed into Coachio LLM for summary + brief generation.
//
// Key resolution:
//   - Admin (son@lovinbot.ai) → server-side env FIRECRAWL_API_KEY
//   - Non-admin user           → their personal key from user_api_keys.firecrawl_api_key
//
// Why server-side proxy: keeps the admin key out of the frontend bundle and
// lets us share it across student accounts without leaking it.

export const config = { runtime: 'edge' };

const ADMIN_EMAILS = ['son@lovinbot.ai'];
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bad(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function verifyUser(token: string): Promise<{ id: string; email?: string } | null> {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return null;
  const res = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supaKey },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.id) return null;
  return { id: data.id, email: data.email };
}

async function getUserFirecrawlKey(userId: string): Promise<string | null> {
  const supaUrl = process.env.SUPABASE_URL;
  const supaSrv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaSrv) return null;
  const res = await fetch(
    `${supaUrl}/rest/v1/user_api_keys?user_id=eq.${userId}&select=firecrawl_api_key&limit=1`,
    { headers: { apikey: supaSrv, Authorization: `Bearer ${supaSrv}` } },
  );
  if (!res.ok) return null;
  const arr = await res.json();
  return arr[0]?.firecrawl_api_key || null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return bad('Method not allowed', 405);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return bad('Missing Bearer token', 401);

  const user = await verifyUser(token);
  if (!user) return bad('Invalid session', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('Body must be JSON'); }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return bad('url required');
  try { new URL(url); } catch { return bad('Invalid URL format'); }

  // Resolve Firecrawl key per user.
  let apiKey: string | undefined;
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) return bad('Server thiếu FIRECRAWL_API_KEY — admin add ở Vercel env vars', 500);
  } else {
    apiKey = (await getUserFirecrawlKey(user.id)) || undefined;
    if (!apiKey) {
      return bad(
        'Bạn chưa nhập Firecrawl API key. Mở Settings → API Keys → Firecrawl → add key.',
        402,
      );
    }
  }

  // Call Firecrawl
  let scrapeRes: Response;
  try {
    scrapeRes = await fetch(FIRECRAWL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        onlyMainContent: true,
        maxAge: 172800000,   // 48h cache
        parsers: ['pdf'],
        formats: ['markdown'],
      }),
    });
  } catch (e: any) {
    return json({ error: `Firecrawl network error: ${e?.message || e}` }, 502);
  }

  const rawText = await scrapeRes.text();
  let data: any;
  try { data = JSON.parse(rawText); } catch {
    return json({ error: `Firecrawl returned non-JSON (${scrapeRes.status})`, raw: rawText.slice(0, 300) }, 502);
  }

  if (!scrapeRes.ok) {
    return json({
      error: data?.error || `Firecrawl ${scrapeRes.status}`,
      detail: data,
    }, scrapeRes.status);
  }

  // Firecrawl v2 returns { success: true, data: { markdown, metadata, ... } }
  const markdown = data?.data?.markdown || data?.markdown || '';
  const metadata = data?.data?.metadata || data?.metadata || {};
  if (!markdown) {
    return json({ error: 'Firecrawl OK nhưng không có markdown', raw: data }, 502);
  }

  return json({
    url,
    markdown,
    metadata: {
      title: metadata.title,
      description: metadata.description,
      ogTitle: metadata.ogTitle,
      ogDescription: metadata.ogDescription,
      sourceURL: metadata.sourceURL,
    },
    bytes: markdown.length,
  });
}
