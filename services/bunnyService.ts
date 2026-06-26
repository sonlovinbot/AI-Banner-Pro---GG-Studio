import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { compressForUpload } from './imageUtils';

export type BunnyFolder = 'banners' | 'refs' | 'products' | 'face' | 'logo' | 'misc';

export interface UploadResult {
  url: string;     // public CDN URL
  path: string;    // object path inside the storage zone
  size: number;
  mime: string;
}

async function getAuthHeader(): Promise<string> {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình');
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Chưa đăng nhập — không có session');
  return `Bearer ${token}`;
}

const VERCEL_BODY_LIMIT = 4_000_000; // ~4MB, stay under 4.5MB Vercel Hobby limit
const COMPRESS_TARGET = 1_500_000;   // try to keep under 1.5MB after compression

export async function uploadToBunny(file: File, folder: BunnyFolder = 'misc'): Promise<UploadResult> {
  const auth = await getAuthHeader();

  let toSend: File | Blob = file;
  let sendName = file.name;
  let sendType = file.type;

  // Compress images that are too big to fit Vercel's request body limit.
  if (file.type.startsWith('image/') && file.size > COMPRESS_TARGET) {
    try {
      const { blob, mimeType } = await compressForUpload(file, 1920, 0.88);
      console.info(`[bunny] compressed image ${file.size} -> ${blob.size} bytes`);
      toSend = blob;
      sendType = mimeType;
      sendName = file.name.replace(/\.[a-zA-Z0-9]+$/, '') + '.jpg';
    } catch (e) {
      console.warn('[bunny] compression failed, sending original', e);
    }
  }

  if (toSend.size > VERCEL_BODY_LIMIT) {
    throw new Error(
      `File quá lớn sau khi nén (${(toSend.size / 1024 / 1024).toFixed(2)}MB). Vercel Hobby giới hạn 4.5MB body.`,
    );
  }

  const fd = new FormData();
  fd.append('file', toSend instanceof File ? toSend : new File([toSend], sendName, { type: sendType }));
  fd.append('folder', folder);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: auth },
    body: fd,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[bunny] upload failed', res.status, data);
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }

  return data as UploadResult;
}

// Helper: convert a data URL (e.g. Gemini output) to File, then upload.
export async function uploadDataUrlToBunny(
  dataUrl: string,
  fileName: string,
  folder: BunnyFolder = 'banners',
): Promise<UploadResult> {
  // Pre-compress data URL via canvas. This dodges the original PNG (which
  // Gemini often returns at 3-5MB) and converts to JPEG that fits Vercel limit.
  try {
    const { blob, mimeType } = await compressForUpload(dataUrl, 1920, 0.88);
    console.info(`[bunny] data URL compressed to ${blob.size} bytes`);
    const file = new File([blob], fileName.replace(/\.\w+$/, '') + '.jpg', { type: mimeType });
    return uploadToBunny(file, folder);
  } catch (e) {
    console.warn('[bunny] data URL compress failed, sending raw', e);
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });
    return uploadToBunny(file, folder);
  }
}
