import { LibraryImage, UploadedImage } from '../types';

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Resizes (preserving aspect ratio) and re-encodes as JPEG so library entries fit in localStorage.
export async function compressForLibrary(
  file: File,
  maxDimension = 1280,
  quality = 0.82
): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await readFileAsDataURL(file);
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { base64: dataUrl, mimeType: file.type };
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', quality);
    return { base64: out, mimeType: 'image/jpeg' };
  } catch {
    return { base64: dataUrl, mimeType: file.type };
  }
}

export function extractImageFiles(items: DataTransferItemList | DataTransferItem[] | null | undefined): File[] {
  if (!items) return [];
  const out: File[] = [];
  for (const item of items as any) {
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f && f.type.startsWith('image/')) out.push(f);
    }
  }
  return out;
}

export function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  return dt.files;
}

export async function fileToUploadedImage(file: File): Promise<UploadedImage> {
  const base64 = await readFileAsDataURL(file);
  return {
    id: Math.random().toString(36).substring(7),
    url: base64,
    file,
    base64,
    mimeType: file.type || 'image/png',
  };
}

export async function dataUrlOrUrlToUploadedImage(
  src: string,
  fileName = 'voted-banner.png',
): Promise<UploadedImage | null> {
  try {
    let dataUrl = src;
    let blob: Blob;
    if (src.startsWith('data:')) {
      blob = dataURLToBlob(src);
    } else {
      const res = await fetch(src);
      blob = await res.blob();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
    const mimeType = blob.type || 'image/png';
    const file = new File([blob], fileName, { type: mimeType });
    return {
      id: Math.random().toString(36).substring(7),
      url: dataUrl,
      file,
      base64: dataUrl,
      mimeType,
    };
  } catch (e) {
    console.warn('dataUrlOrUrlToUploadedImage failed', e);
    return null;
  }
}

function dataURLToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(header)?.[1] || 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function libraryItemToUploadedImage(item: LibraryImage): UploadedImage {
  const blob = dataURLToBlob(item.base64);
  const file = new File([blob], item.fileName || `library-${item.id}.jpg`, { type: item.mimeType || blob.type });
  return {
    id: Math.random().toString(36).substring(7),
    url: item.base64,
    file,
    base64: item.base64,
    mimeType: item.mimeType || file.type,
  };
}
