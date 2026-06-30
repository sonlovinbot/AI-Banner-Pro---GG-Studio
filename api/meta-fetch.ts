// Vercel Edge function — fetch read-only Meta resources via Pipeboard MCP.
// Used by Settings → Meta Accounts to pre-populate Pages / Pixels / IG accounts
// so the user doesn't have to type IDs by hand.
//
// Action surface (POST body):
//   { action: 'pages',              accountId: 'act_xxx' }
//   { action: 'pixels',             accountId: 'act_xxx' }
//   { action: 'instagram-accounts', accountId: 'act_xxx' }
//
// Each action returns a normalized array — frontend caches in localStorage
// per accountId so we don't burn Pipeboard's 30-calls-per-week free quota.

import { callPipeboardTool, PipeboardError } from './_lib/pipeboardClient';

export const config = { runtime: 'edge' };

interface FetchRequestBody {
  action: 'pages' | 'pixels' | 'instagram-accounts' | 'sync-statuses';
  accountId: string;
  /** Used by sync-statuses — pull statuses for this campaign's ids. */
  metaCampaignId?: string;
  metaAdsetIds?: string[];
  metaAdIds?: string[];
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bad(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function verifyUser(token: string): Promise<{ id: string } | null> {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return null;
  const res = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supaKey },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.id) return null;
  return { id: data.id };
}

// Pipeboard tool responses are wrapped in { data: '<json>' } and the inner
// payload shape varies. These extractors normalize what we surface to the FE.

interface MetaPage {
  id: string;
  name: string;
  accessTokenAvailable?: boolean;
}

interface MetaPixel {
  id: string;
  name: string;
  code?: string;
  lastFiredAt?: string;
}

interface MetaIgAccount {
  id: string;
  username?: string;
  name?: string;
}

function extractList(raw: any, keys: string[]): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    const v = raw[k];
    if (Array.isArray(v)) return v;
    // Some Pipeboard tools wrap once more: { pages: { data: [...] } }
    if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data;
  }
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

function normalizePages(raw: any): MetaPage[] {
  return extractList(raw, ['pages', 'accounts', 'data']).map((p: any) => ({
    id: String(p.id || p.page_id || ''),
    name: String(p.name || p.page_name || p.id || ''),
    accessTokenAvailable: !!(p.access_token || p.has_access_token),
  })).filter(p => p.id);
}

function normalizePixels(raw: any): MetaPixel[] {
  return extractList(raw, ['pixels', 'data']).map((p: any) => ({
    id: String(p.id || p.pixel_id || ''),
    name: String(p.name || p.id || ''),
    code: p.code || undefined,
    lastFiredAt: p.last_fired_time || undefined,
  })).filter(p => p.id);
}

function normalizeIgAccounts(raw: any): MetaIgAccount[] {
  return extractList(raw, ['instagram_accounts', 'accounts', 'data']).map((a: any) => ({
    id: String(a.id || a.instagram_actor_id || ''),
    username: a.username || undefined,
    name: a.name || a.username || undefined,
  })).filter(a => a.id);
}

async function handlerImpl(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return bad('Method not allowed', 405);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return bad('Missing Bearer token', 401);

  const user = await verifyUser(token);
  if (!user) return bad('Invalid session', 401);

  let body: FetchRequestBody;
  try { body = await req.json(); } catch { return bad('Invalid JSON body'); }

  if (!body.action) return bad('action required');
  if (!body.accountId) return bad('accountId required');
  if (!body.accountId.startsWith('act_')) return bad('accountId must start with act_');

  const pipeboardToken = process.env.PIPEBOARD_API_TOKEN;
  if (!pipeboardToken) return bad('Server thiếu PIPEBOARD_API_TOKEN', 500);

  // Wrap to count calls for client-side quota tracking. Free Pipeboard tier
  // is 30 calls/week so we expose exact usage on every response.
  let pipeboardCallsUsed = 0;
  const trackedCall = async <T>(tool: string, args: any) => {
    pipeboardCallsUsed++;
    return callPipeboardTool<T>(tool, args, pipeboardToken);
  };

  try {
    switch (body.action) {
      case 'pages': {
        const out = await trackedCall('get_account_pages', {
          account_id: body.accountId,
        });
        return json({ pages: normalizePages(out), pipeboardCallsUsed });
      }
      case 'pixels': {
        const out = await trackedCall('get_pixels', {
          account_id: body.accountId,
        });
        return json({ pixels: normalizePixels(out), pipeboardCallsUsed });
      }
      case 'instagram-accounts': {
        const out = await trackedCall('get_instagram_accounts', {
          account_id: body.accountId,
        });
        return json({ instagramAccounts: normalizeIgAccounts(out), pipeboardCallsUsed });
      }
      case 'sync-statuses': {
        // Pull live status from Meta for whatever Meta IDs the FE passed.
        // Each lookup is independent; we collect partial results — caller
        // patches Supabase with whatever came back.
        const out: {
          campaign?: { id: string; status?: string; effectiveStatus?: string };
          adsets: { id: string; status?: string; effectiveStatus?: string }[];
          ads: { id: string; status?: string; effectiveStatus?: string }[];
        } = { adsets: [], ads: [] };

        const pickStatus = (r: any) => ({
          status: r?.status || r?.configured_status,
          effectiveStatus: r?.effective_status,
        });

        if (body.metaCampaignId) {
          try {
            const r: any = await trackedCall('get_campaign_details', {
              campaign_id: body.metaCampaignId,
            });
            out.campaign = { id: body.metaCampaignId, ...pickStatus(r) };
          } catch (e: any) {
            out.campaign = { id: body.metaCampaignId, status: 'error:' + (e?.message || '?') };
          }
        }
        for (const id of body.metaAdsetIds || []) {
          try {
            const r: any = await trackedCall('get_adset_details', { adset_id: id });
            out.adsets.push({ id, ...pickStatus(r) });
          } catch (e: any) {
            out.adsets.push({ id, status: 'error:' + (e?.message || '?') });
          }
        }
        for (const id of body.metaAdIds || []) {
          try {
            const r: any = await trackedCall('get_ad_details', { ad_id: id });
            out.ads.push({ id, ...pickStatus(r) });
          } catch (e: any) {
            out.ads.push({ id, status: 'error:' + (e?.message || '?') });
          }
        }
        return json({ ...out, pipeboardCallsUsed });
      }
      default:
        return bad(`Unknown action: ${body.action}`);
    }
  } catch (e: any) {
    const msg = e instanceof PipeboardError ? e.message : (e?.message || 'fetch lỗi');
    return json({ error: msg }, 500);
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await handlerImpl(req);
  } catch (e: any) {
    const message = e?.message || String(e) || 'unknown error';
    return json({ error: `Edge crash: ${message}` }, 500);
  }
}
