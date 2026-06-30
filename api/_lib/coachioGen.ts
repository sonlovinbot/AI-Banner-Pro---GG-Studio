// Server-side Coachio gen helper for MCP start_banner_gen / check_banner_gen.
//
// Two operations only — no polling inside (caller does poll across separate
// MCP calls to avoid Edge timeout):
//   1. submitCoachioTask  → returns Coachio task_id (~2s)
//   2. checkCoachioStatus → returns { status, urls? } (single call, ~1s)
//
// Image fetch + Bunny upload + banner_history insert happens in check tool
// when status === 'completed'. Each individual call stays under 25s.

const COACHIO_BASE_URL = 'https://api.coachio.ai/api/v1';

export interface CoachioSubmitArgs {
  apiKey: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  modelIdentifier: string;
  /** Optional reference image URLs — pass [] for text-only generation. */
  imageUrls?: string[];
}

export async function submitCoachioTask(args: CoachioSubmitArgs): Promise<string> {
  const body: Record<string, any> = {
    task_type: 'image',
    prompt: args.prompt,
    ai_model_config: {
      model_identifier: args.modelIdentifier,
      generation_mode: 'default',
      aspect_ratio: args.aspectRatio,
      resolution: args.resolution.toLowerCase(),
    },
  };
  if (args.imageUrls && args.imageUrls.length > 0) {
    body.media_inputs = { images_url: args.imageUrls };
  }

  const res = await fetch(`${COACHIO_BASE_URL}/task/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': args.apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid Coachio API key');
    if (res.status === 402) throw new Error('Insufficient Coachio credits — top up account');
    if (res.status === 429) throw new Error('Coachio rate limit — wait + retry');
    throw new Error(`Coachio submit failed (${res.status}): ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  return data.task_id;
}

export interface CoachioStatusResult {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputUrls?: string[];
  errorMessage?: string;
}

export async function checkCoachioStatus(taskId: string, apiKey: string): Promise<CoachioStatusResult> {
  const res = await fetch(`${COACHIO_BASE_URL}/task/status/${taskId}`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) {
    return { status: 'failed', errorMessage: `Status check ${res.status}` };
  }
  const data = await res.json();
  if (data.status === 'completed') {
    const urls = data.result_urls || data.result?.output_urls || [];
    return { status: 'completed', outputUrls: urls };
  }
  if (data.status === 'failed') {
    return { status: 'failed', errorMessage: data.message || 'Coachio reported failure' };
  }
  // 'pending' / 'processing' / queued / etc — normalize.
  return { status: data.status === 'processing' ? 'processing' : 'pending' };
}

// ─── Bunny upload (re-export pattern) ───

export interface BunnyUpload { url: string; path: string; size: number }

export async function uploadBytesToBunny(args: {
  userId: string;
  bytes: Uint8Array;
  mimeType: string;
  folder?: string;
}): Promise<BunnyUpload> {
  const ZONE = process.env.BUNNY_STORAGE_ZONE;
  const PASS = process.env.BUNNY_STORAGE_PASSWORD;
  const HOST = process.env.BUNNY_STORAGE_HOST;
  const PUB  = process.env.BUNNY_PUBLIC_URL;
  if (!ZONE || !PASS || !HOST || !PUB) {
    throw new Error('Bunny env vars not configured (ZONE/PASSWORD/HOST/PUBLIC_URL)');
  }
  const ext = args.mimeType === 'image/jpeg' ? 'jpg'
            : args.mimeType === 'image/webp' ? 'webp'
            : 'png';
  const folder = (args.folder || 'banners').replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'banners';
  const name = `${Date.now()}-${randomId(8)}.${ext}`;
  const objectPath = `users/${args.userId}/${folder}/${name}`;
  const putUrl = `https://${HOST}/${ZONE}/${objectPath}`;
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: { AccessKey: PASS, 'Content-Type': args.mimeType },
    body: args.bytes,
  });
  if (!putRes.ok) {
    throw new Error(`Bunny upload ${putRes.status}: ${await putRes.text().catch(() => '')}`);
  }
  return { url: `${PUB.replace(/\/+$/, '')}/${objectPath}`, path: objectPath, size: args.bytes.byteLength };
}

/** Fetch an image URL → Uint8Array. Used to mirror Coachio's output into our
 *  own Bunny CDN so banner URLs stay stable even if Coachio rotates theirs. */
export async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed ${res.status}`);
  const mimeType = res.headers.get('Content-Type') || 'image/png';
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), mimeType };
}

function randomId(len = 8): string {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, b => b.toString(36).padStart(2, '0')).join('').slice(0, len);
}
