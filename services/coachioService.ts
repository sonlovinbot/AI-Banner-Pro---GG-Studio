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
  apiKey: string
): Promise<string> {
  const response = await fetch(`${COACHIO_BASE_URL}/task/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      task_type: 'image',
      prompt,
      ai_model_config: {
        model_identifier: 'google_image_gen_banana_pro',
        generation_mode: 'default',
        aspect_ratio: aspectRatio,
        resolution: resolution.toLowerCase(),
      },
      media_inputs: {
        images_url: imageUrls,
      },
    }),
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
  onProgress?: (status: string) => void
): Promise<string> {
  const apiKey = getCoachioApiKey();
  if (!apiKey) {
    throw new Error('Coachio API key not set. Please configure it in Settings.');
  }

  onProgress?.('Uploading reference image...');
  const refUrl = await uploadImageToCoachio(referenceImage.file, apiKey);

  onProgress?.('Uploading product image...');
  const prodUrl = await uploadImageToCoachio(productImage.file, apiKey);

  const fullPrompt = [
    'You are an expert graphic designer.',
    'Create a high-quality professional advertising banner.',
    'Follow the composition, color palette, lighting, and typography style of the reference image.',
    'Seamlessly integrate the product as the main focus.',
    brandContent ? `Brand Messaging: ${brandContent}` : '',
    userPrompt || 'Make it look high-end and commercial.',
  ].filter(Boolean).join('\n');

  onProgress?.('Submitting task...');
  const taskId = await submitTask(fullPrompt, [refUrl, prodUrl], aspectRatio, resolution, apiKey);

  onProgress?.('Generating...');
  const outputUrls = await pollTaskStatus(taskId, apiKey, onProgress);

  // Return the first output URL directly (it's already a CDN URL)
  return outputUrls[0];
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
