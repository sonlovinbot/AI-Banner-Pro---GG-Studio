// Vercel Edge function — uploads a file to Bunny.net Storage and returns the
// CDN URL. Validates a Supabase session JWT in Authorization header so only
// signed-in users can upload.
//
// Required env vars (Vercel project settings):
//   BUNNY_STORAGE_ZONE      e.g. ai-banner-pro-uploads
//   BUNNY_STORAGE_PASSWORD  the API password from Bunny Storage zone
//   BUNNY_STORAGE_HOST      e.g. sg.storage.bunnycdn.com
//   BUNNY_PUBLIC_URL        e.g. https://ai-banner-pro-cdn.b-cdn.net
//   SUPABASE_URL            shared with frontend
//   SUPABASE_ANON_KEY       shared with frontend

export const config = { runtime: 'edge' };

const ALLOWED_CONTENT_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

const MAX_BYTES = 50 * 1024 * 1024; // 50MB hard cap

function jsonErr(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function verifySupabaseToken(token: string): Promise<{ userId: string } | null> {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return null;

  const res = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supaKey,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.id) return null;
  return { userId: data.id };
}

function randomId(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, len);
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/webp': 'webp', 'image/gif': 'gif',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'weba',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  };
  return map[mime] || 'bin';
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonErr('Method not allowed', 405);

  // ---- env check
  const ZONE = process.env.BUNNY_STORAGE_ZONE;
  const PASS = process.env.BUNNY_STORAGE_PASSWORD;
  const HOST = process.env.BUNNY_STORAGE_HOST;
  const PUB  = process.env.BUNNY_PUBLIC_URL;
  if (!ZONE || !PASS || !HOST || !PUB) {
    return jsonErr('Bunny env vars not configured on server', 500);
  }

  // ---- auth
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonErr('Missing Authorization bearer token', 401);

  const session = await verifySupabaseToken(token);
  if (!session) return jsonErr('Invalid or expired session', 401);

  // ---- parse multipart
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonErr('Body must be multipart/form-data', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return jsonErr('Missing "file" field', 400);
  if (file.size > MAX_BYTES) return jsonErr(`File too large (>${MAX_BYTES / 1024 / 1024}MB)`, 413);

  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_CONTENT_TYPES.has(mime)) {
    return jsonErr(`Unsupported content type: ${mime}`, 415);
  }

  // Optional folder hint from client (banners/refs/products/...). Sanitize.
  const folderRaw = (form.get('folder') as string | null) || 'misc';
  const folder = folderRaw.replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'misc';

  const ext = extFromMime(mime);
  const name = `${Date.now()}-${randomId(8)}.${ext}`;
  const objectPath = `users/${session.userId}/${folder}/${name}`;

  // ---- upload to Bunny
  const putUrl = `https://${HOST}/${ZONE}/${objectPath}`;
  const buf = await file.arrayBuffer();

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      AccessKey: PASS,
      'Content-Type': mime,
    },
    body: buf,
  });

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    return jsonErr(`Bunny upload failed (${putRes.status}): ${text}`, 502);
  }

  const url = `${PUB.replace(/\/+$/, '')}/${objectPath}`;
  return new Response(JSON.stringify({ url, path: objectPath, size: file.size, mime }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
