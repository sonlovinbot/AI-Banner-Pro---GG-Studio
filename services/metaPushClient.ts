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

export async function pushCampaign(
  campaignId: string,
  opts?: { dryRun?: boolean; initialStatus?: 'PAUSED' | 'ACTIVE' },
): Promise<PushResult> {
  const auth = await getAuthHeader();
  const res = await fetch('/api/meta-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      campaignId,
      dryRun: opts?.dryRun ?? false,
      initialStatus: opts?.initialStatus,
    }),
  });
  let data: any;
  try { data = await res.json(); } catch { data = { error: 'Không parse được response' }; }
  if (!res.ok) {
    throw new Error(data?.error || `Push failed (${res.status})`);
  }
  return data as PushResult;
}
