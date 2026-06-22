import { UploadedImage } from '../types';

const COACHIO_BASE_URL = 'https://api.coachio.ai/api/v1';
const COACHIO_API_KEY_STORAGE = 'coachio_api_key';
const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 300000; // 5 minutes

export function getCoachioApiKey(): string {
  return localStorage.getItem(COACHIO_API_KEY_STORAGE) || '';
}

export function setCoachioApiKey(key: string): void {
  localStorage.setItem(COACHIO_API_KEY_STORAGE, key);
}

export function removeCoachioApiKey(): void {
  localStorage.removeItem(COACHIO_API_KEY_STORAGE);
}

async function uploadImageToCoachio(file: File, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${COACHIO_BASE_URL}/upload/image`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid Coachio API key');
    if (response.status === 413) throw new Error('Image exceeds 15MB limit');
    if (response.status === 415) throw new Error('Unsupported image format. Use JPG/PNG/WebP');
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.url;
}

async function submitTask(
  prompt: string,
  imageUrls: string[],
  aspectRatio: string,
  resolution: string,
  modelIdentifier: string,
  apiKey: string
): Promise<string> {
  const body: Record<string, any> = {
    task_type: 'image',
    prompt,
    ai_model_config: {
      model_identifier: modelIdentifier,
      generation_mode: 'default',
      aspect_ratio: aspectRatio,
      resolution: resolution.toLowerCase(),
    },
  };

  if (imageUrls.length > 0) {
    body.media_inputs = { images_url: imageUrls };
  }

  const response = await fetch(`${COACHIO_BASE_URL}/task/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid Coachio API key');
    if (response.status === 402) throw new Error('Insufficient credits. Please top up your Coachio account');
    if (response.status === 429) throw new Error('Rate limit exceeded. Please wait and try again');
    const body = await response.text();
    throw new Error(`Task submit failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.task_id;
}

async function pollTaskStatus(
  taskId: string,
  apiKey: string,
  onProgress?: (status: string) => void
): Promise<string[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME) {
    const response = await fetch(`${COACHIO_BASE_URL}/task/status/${taskId}`, {
      headers: { 'X-API-Key': apiKey },
    });

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'completed') {
      // Handle both result_urls (top level) and result.output_urls
      const urls = data.result_urls || data.result?.output_urls || [];
      if (urls.length === 0) throw new Error('Task completed but no output images returned');
      return urls;
    }

    if (data.status === 'failed') {
      throw new Error(data.message || 'Task failed on server');
    }

    onProgress?.(data.status === 'processing' ? 'Generating...' : 'Queued...');

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error('Generation timed out after 5 minutes');
}

export async function generateBannerWithCoachio(
  referenceImage: UploadedImage,
  productImage: UploadedImage,
  userPrompt: string,
  brandContent: string,
  aspectRatio: string,
  resolution: string,
  modelIdentifier: string,
  onProgress?: (status: string) => void,
  extraReferences: UploadedImage[] = []
): Promise<string> {
  const apiKey = getCoachioApiKey();
  if (!apiKey) {
    throw new Error('Coachio API key not set. Please configure it in Settings.');
  }

  onProgress?.('Uploading reference image...');
  const refUrl = await uploadImageToCoachio(referenceImage.file, apiKey);

  onProgress?.('Uploading product image...');
  const prodUrl = await uploadImageToCoachio(productImage.file, apiKey);

  const extraUrls: string[] = [];
  for (let i = 0; i < extraReferences.length; i++) {
    onProgress?.(`Uploading extra reference ${i + 1}/${extraReferences.length}...`);
    try {
      const url = await uploadImageToCoachio(extraReferences[i].file, apiKey);
      extraUrls.push(url);
    } catch (e) {
      console.warn('Skip extra reference upload', e);
    }
  }

  const fullPrompt = [
    'You are an expert graphic designer.',
    'Create a high-quality professional advertising banner.',
    'Follow the composition, color palette, lighting, and typography style of the reference image.',
    'Seamlessly integrate the product as the main focus.',
    extraUrls.length > 0
      ? `Additional reference images (${extraUrls.length}) follow the product — use them as supplementary style cues from approved past work or user tweaks.`
      : '',
    brandContent ? `Brand Messaging: ${brandContent}` : '',
    userPrompt || 'Make it look high-end and commercial.',
  ].filter(Boolean).join('\n');

  onProgress?.('Submitting task...');
  const taskId = await submitTask(fullPrompt, [refUrl, prodUrl, ...extraUrls], aspectRatio, resolution, modelIdentifier, apiKey);

  onProgress?.('Generating...');
  const outputUrls = await pollTaskStatus(taskId, apiKey, onProgress);

  // Return the first output URL directly (it's already a CDN URL)
  return outputUrls[0];
}

export async function generateUgcWithCoachio(
  faceImage: UploadedImage,
  fashionImage: UploadedImage,
  productImage: UploadedImage,
  userPrompt: string,
  brandContent: string,
  aspectRatio: string,
  resolution: string,
  modelIdentifier: string,
  onProgress?: (status: string) => void
): Promise<string> {
  const apiKey = getCoachioApiKey();
  if (!apiKey) {
    throw new Error('Coachio API key not set. Please configure it in Settings.');
  }

  onProgress?.('Uploading face reference...');
  const faceUrl = await uploadImageToCoachio(faceImage.file, apiKey);

  onProgress?.('Uploading fashion & style reference...');
  const fashionUrl = await uploadImageToCoachio(fashionImage.file, apiKey);

  onProgress?.('Uploading product reference...');
  const prodUrl = await uploadImageToCoachio(productImage.file, apiKey);

  const fullPrompt = buildUgcPrompt(userPrompt, brandContent);

  onProgress?.('Submitting task...');
  const taskId = await submitTask(
    fullPrompt,
    [faceUrl, fashionUrl, prodUrl],
    aspectRatio,
    resolution,
    modelIdentifier,
    apiKey
  );

  onProgress?.('Generating...');
  const outputUrls = await pollTaskStatus(taskId, apiKey, onProgress);

  return outputUrls[0];
}

function buildUgcPrompt(userPrompt: string, brandContent: string): string {
  return [
    'You are an expert UGC content creator and photographer.',
    'You will receive THREE reference images in this order:',
    '1) FACE REFERENCE — the exact person to feature. You MUST preserve their facial identity: same facial features, skin tone, hair, eye color, and overall likeness. Do NOT generate a new face or alter the person. The output must be recognisably the same individual.',
    '2) FASHION & STYLE REFERENCE — apply the outfit, fashion, color palette, lighting, mood, and composition style of this image.',
    '3) PRODUCT — integrate this product naturally into the scene; the person should be using, wearing, or interacting with it as appropriate.',
    'Output: a photo-realistic, social-media-ready UGC image.',
    'Hard rules: identical facial identity from image #1, natural human proportions, no uncanny artifacts, cohesive lighting between person/outfit/product.',
    brandContent ? `Brand Messaging: ${brandContent}` : '',
    userPrompt ? `Additional instructions: ${userPrompt}` : 'Make it feel candid, natural, premium.',
  ].filter(Boolean).join('\n');
}

export async function validateCoachioApiKey(apiKey: string): Promise<boolean> {
  try {
    // Try a lightweight status check to validate the key
    const response = await fetch(`${COACHIO_BASE_URL}/task/status/test`, {
      headers: { 'X-API-Key': apiKey },
    });
    // 401 means invalid key, anything else means key is valid (404 for fake task_id is expected)
    return response.status !== 401;
  } catch {
    return false;
  }
}
