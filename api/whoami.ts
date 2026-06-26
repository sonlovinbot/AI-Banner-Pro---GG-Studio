// Diagnostic Edge function: returns the verified Supabase user info.
// Use this to isolate auth issues from Bunny upload issues.
//
// Test: curl https://your-app.vercel.app/api/whoami -H "Authorization: Bearer <token>"

export const config = { runtime: 'edge' };

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_ANON_KEY;

  // Tell the caller exactly what is missing
  const envStatus = {
    SUPABASE_URL: !!supaUrl,
    SUPABASE_ANON_KEY: !!supaKey,
    BUNNY_STORAGE_ZONE: !!process.env.BUNNY_STORAGE_ZONE,
    BUNNY_STORAGE_PASSWORD: !!process.env.BUNNY_STORAGE_PASSWORD,
    BUNNY_STORAGE_HOST: !!process.env.BUNNY_STORAGE_HOST,
    BUNNY_PUBLIC_URL: !!process.env.BUNNY_PUBLIC_URL,
  };

  if (!supaUrl || !supaKey) {
    return json({
      ok: false,
      step: 'env-check',
      message: 'Server thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY',
      envStatus,
    }, 500);
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return json({
      ok: false,
      step: 'extract-token',
      message: 'Authorization header thiếu Bearer token',
      envStatus,
    }, 401);
  }

  const res = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supaKey },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return json({
      ok: false,
      step: 'verify-token',
      message: 'Supabase /auth/v1/user reject token',
      status: res.status,
      supabaseBody: body,
      envStatus,
    }, 401);
  }

  return json({
    ok: true,
    user: { id: body.id, email: body.email },
    envStatus,
  });
}
