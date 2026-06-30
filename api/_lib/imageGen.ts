// Server-side image generation + Bunny upload helper.
// Lives in api/_lib so any Edge function can call it (MCP create_banner today,
// future variation_generator tomorrow).
//
// Why a thin REST wrapper instead of @google/genai SDK:
//   - SDK bundles too much for Vercel Edge runtime (heavy gRPC layer).
//   - We only need POST /v1beta/models/{model}:generateImages → done in 30 LOC.
//   - One API key (GOOGLE_AI_API_KEY env on Vercel) covers all server-side
//     generation — students don't need to provide their own.

const IMAGEN_MODEL = 'imagen-4.0-fast-generate-001';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Aspect ratios Imagen accepts (mapped from our app's values). */
const ASPECT_MAP: Record<string, string> = {
  '1:1': '1:1',
  '4:3': '4:3',
  '3:4': '3:4',
  '16:9': '16:9',
  '9:16': '9:16',
};

export interface GeneratedImage {
  /** Raw bytes (base64 → Uint8Array) ready for upload. */
  bytes: Uint8Array;
  mimeType: string;
}

export async function generateImage(args: {
  prompt: string;
  aspectRatio?: string;
}): Promise<GeneratedImage> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Server thiếu GOOGLE_AI_API_KEY env — admin cần add ở Vercel project settings');
  }

  const aspect = ASPECT_MAP[args.aspectRatio || '1:1'] || '1:1';
  const url = `${GEMINI_BASE}/models/${IMAGEN_MODEL}:generateImages?key=${apiKey}`;
  const body = {
    prompt: args.prompt,
    sampleCount: 1,
    aspectRatio: aspect,
    // safetyFilterLevel defaults are fine; person/face gen on by default
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Imagen ${res.status}: ${text.slice(0, 300)}`);
  }

  const data: any = await res.json();
  // Response shape: { generatedImages: [{ image: { imageBytes (base64) } }] }
  const first = data?.generatedImages?.[0] || data?.images?.[0];
  const b64 = first?.image?.imageBytes || first?.bytesBase64Encoded;
  if (!b64) {
    throw new Error(`Imagen returned no image: ${JSON.stringify(data).slice(0, 200)}`);
  }

  // Decode base64 → Uint8Array (browser-equivalent in Edge runtime)
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType: 'image/png' };
}

// ─── Bunny CDN upload ───

export interface BunnyUpload {
  url: string;
  path: string;
  size: number;
}

/** PUT raw bytes to Bunny Storage, return public CDN URL. */
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

  return {
    url: `${PUB.replace(/\/+$/, '')}/${objectPath}`,
    path: objectPath,
    size: args.bytes.byteLength,
  };
}

function randomId(len = 8): string {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, b => b.toString(36).padStart(2, '0')).join('').slice(0, len);
}
