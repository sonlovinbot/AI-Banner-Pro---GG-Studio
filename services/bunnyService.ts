import { getSupabase, isSupabaseConfigured } from './supabaseClient';

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

export async function uploadToBunny(file: File, folder: BunnyFolder = 'misc'): Promise<UploadResult> {
  const auth = await getAuthHeader();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', folder);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: auth },
    body: fd,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);

  return data as UploadResult;
}

// Helper: convert a data URL (e.g. Gemini output) to File, then upload.
export async function uploadDataUrlToBunny(
  dataUrl: string,
  fileName: string,
  folder: BunnyFolder = 'banners',
): Promise<UploadResult> {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  return uploadToBunny(file, folder);
}
