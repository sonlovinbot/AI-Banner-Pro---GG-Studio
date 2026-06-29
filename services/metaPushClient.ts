// Frontend client for /api/meta-push Edge function. Handles auth + JSON I/O.
// Two modes (server-decided): "dry-run" returns preview payload only,
// "push" returns actual Meta IDs + per-step results.

import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export interface PushStepResult {
  step: 'upload' | 'campaign' | 'adset' | 'creative' | 'ad';
  status: 'ok' | 'failed' | 'skipped';
  localId?: string;
  metaId?: string;
  imageHash?: string;
  error?: string;
}

export interface PushResult {
  mode: 'dry-run' | 'push';
  success: boolean;
  campaignId: string;
  metaCampaignId?: string;
  steps?: PushStepResult[];
  errors?: string[];
  warnings?: string[];
  payload?: any;
  message?: string;
}

async function getAuthHeader(): Promise<string> {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình');
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Chưa đăng nhập');
  return `Bearer ${token}`;
}

/** Calls the Edge function. PUSH ALWAYS GOES UP AS PAUSED — there is no
 *  ACTIVE override from this client; user reviews + activates inside Meta Ads
 *  Manager manually. This is a safety guarantee for the app, not a default. */
export async function pushCampaign(
  campaignId: string,
  opts?: { dryRun?: boolean },
): Promise<PushResult> {
  const auth = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch('/api/meta-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        campaignId,
        dryRun: opts?.dryRun ?? false,
        // initialStatus is intentionally NOT passed — Edge function hardcodes PAUSED.
      }),
    });
  } catch (e: any) {
    throw new EndpointUnavailableError(`Không gọi được Edge function: ${e?.message || 'network error'}`);
  }

  // Detect "endpoint missing" cases: 404 with HTML body (Vite dev server, missing route).
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    if (res.status === 404) {
      throw new EndpointUnavailableError('/api/meta-push chưa được deploy (Vite dev không serve /api). Test trên Vercel production.');
    }
    throw new EndpointUnavailableError(`Server trả response không phải JSON (${res.status}, ${contentType}).`);
  }

  let data: any;
  try { data = await res.json(); } catch {
    throw new Error('Server trả JSON malformed');
  }
  if (!res.ok) {
    throw new Error(data?.error || `Push failed (${res.status})`);
  }
  return data as PushResult;
}

/** Marker error so the UI can offer client-side dry-run fallback without retrying server. */
export class EndpointUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'EndpointUnavailableError';
  }
}
