// Vercel Edge function — pushes a local Campaign + its AdSets + Creatives to
// Meta Marketing API directly. Supports two modes:
//
//   • Dry-run: env META_SYSTEM_USER_TOKEN unset OR request body { dryRun: true }
//     → loads from Supabase, validates, returns payload as preview (no Meta calls).
//
//   • Real push: env set + dryRun=false → executes the 5-step flow:
//       1. POST /act_{id}/adimages per unique banner (using Bunny URL, Meta fetches bytes)
//       2. POST /act_{id}/campaigns → meta_campaign_id
//       3. POST /act_{id}/adsets → meta_adset_id (per adset)
//       4. POST /act_{id}/adcreatives → meta_creative_id (per creative)
//       5. POST /act_{id}/ads → meta_ad_id (per ad)
//     Then updates ad_campaigns / ad_sets / ad_creatives with returned Meta IDs.
//
// Required env vars (Vercel project settings):
//   META_SYSTEM_USER_TOKEN  long-lived System User token, perms: ads_management + business_management
//   META_API_VERSION        optional, defaults to v23.0
//   SUPABASE_URL            mirror of frontend env, used to verify user JWT
//   SUPABASE_ANON_KEY       mirror of frontend env

import { AdCampaign, AdSet, AdCreative, HistoryItem, MetaAccount } from '../types';
import { buildMetaPayload, validateForPush, resolveMetaAccount } from '../services/metaPushPayload';

export const config = { runtime: 'edge' };

const META_VERSION = process.env.META_API_VERSION || 'v23.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

interface PushRequestBody {
  campaignId: string;
  dryRun?: boolean;
  /** Optional override — by default uses PAUSED. */
  initialStatus?: 'PAUSED' | 'ACTIVE';
}

interface PushResultPerStep {
  step: string;
  status: 'ok' | 'failed' | 'skipped';
  localId?: string;
  metaId?: string;
  imageHash?: string;
  error?: string;
}

interface PushResponse {
  mode: 'dry-run' | 'push';
  success: boolean;
  campaignId: string;
  metaCampaignId?: string;
  steps?: PushResultPerStep[];
  errors?: string[];
  warnings?: string[];
  payload?: any;
  message?: string;
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

async function supaSelect(jwt: string, table: string, filter: string): Promise<any[]> {
  const supaUrl = process.env.SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}?${filter}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: supaKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${table} ${res.status}`);
  return res.json();
}

async function supaPatch(jwt: string, table: string, id: string, patch: any): Promise<void> {
  const supaUrl = process.env.SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: supaKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase patch ${table}/${id} ${res.status}: ${txt}`);
  }
}

// Row → app type mapping mirrors the frontend services. Kept inline to avoid
// pulling Supabase JS client into the Edge bundle.

function rowToCampaign(r: any): AdCampaign {
  return {
    id: r.id,
    name: r.name,
    objective: r.objective || undefined,
    dailyBudget: r.daily_budget != null ? Number(r.daily_budget) : undefined,
    lifetimeBudget: r.lifetime_budget != null ? Number(r.lifetime_budget) : undefined,
    spendCap: r.spend_cap != null ? Number(r.spend_cap) : undefined,
    useCBO: r.use_cbo ?? undefined,
    bidStrategy: r.bid_strategy || undefined,
    specialAdCategories: r.special_ad_categories || undefined,
    metaAccountRefId: r.meta_account_ref_id || undefined,
    metaAccountId: r.meta_account_id || undefined,
    tags: r.tags || [],
    status: r.status,
    metaCampaignId: r.meta_campaign_id || undefined,
    notes: r.notes || undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  } as AdCampaign;
}

function rowToAdSet(r: any): AdSet {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    name: r.name,
    status: r.status,
    optimizationGoal: r.optimization_goal || undefined,
    billingEvent: r.billing_event || undefined,
    dailyBudget: r.daily_budget != null ? Number(r.daily_budget) : undefined,
    lifetimeBudget: r.lifetime_budget != null ? Number(r.lifetime_budget) : undefined,
    bidAmount: r.bid_amount != null ? Number(r.bid_amount) : undefined,
    startTime: r.start_time || undefined,
    endTime: r.end_time || undefined,
    destinationType: r.destination_type || undefined,
    promotedPageId: r.promoted_page_id || undefined,
    leadGenFormId: r.lead_gen_form_id || undefined,
    targeting: r.targeting || undefined,
    isDynamicCreative: r.is_dynamic_creative ?? undefined,
    metaAdSetId: r.meta_ad_set_id || undefined,
    notes: r.notes || undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  } as AdSet;
}

function rowToCreative(r: any): AdCreative {
  return {
    id: r.id,
    campaignId: r.campaign_id || undefined,
    adsetId: r.adset_id || undefined,
    name: r.name || undefined,
    bannerId: r.banner_id || undefined,
    primaryText: r.primary_text || undefined,
    headline: r.headline || undefined,
    description: r.description || undefined,
    cta: r.cta || undefined,
    destinationUrl: r.destination_url || undefined,
    displayLink: r.display_link || undefined,
    audienceRef: r.audience_ref || undefined,
    status: r.status,
    tags: r.tags || [],
    source: r.source || 'user',
    importedFromMeta: !!r.imported_from_meta,
    originalMetaAdId: r.original_meta_ad_id || undefined,
    derivedFromCreativeId: r.derived_from_creative_id || undefined,
    metaAdId: r.meta_ad_id || undefined,
    metaCreativeId: r.meta_creative_id || undefined,
    metaAdsetId: r.meta_adset_id || undefined,
    pushedAt: r.pushed_at ? new Date(r.pushed_at).getTime() : undefined,
    pushError: r.push_error || undefined,
    lastInsightAt: r.last_insight_at ? new Date(r.last_insight_at).getTime() : undefined,
    insights: r.insights || undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  } as AdCreative;
}

function rowToMetaAccount(r: any): MetaAccount {
  return {
    id: r.id,
    label: r.label,
    accountId: r.account_id,
    pageId: r.page_id,
    instagramActorId: r.instagram_actor_id || undefined,
    isDefault: !!r.is_default,
    notes: r.notes || undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

function rowToBanner(r: any): HistoryItem {
  return {
    id: r.id,
    imageUrl: r.image_url,
    promptUsed: r.prompt_used || '',
    timestamp: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    duration: r.duration ?? undefined,
    model: r.model || '',
    quality: r.quality || '1K',
    aspectRatio: r.aspect_ratio || '1:1',
    parentId: r.parent_id || undefined,
    version: r.version ?? 1,
  } as HistoryItem;
}

// ────────────── Meta Graph API helpers ──────────────

async function metaPost<T = any>(path: string, body: any, token: string): Promise<T> {
  const res = await fetch(`${META_BASE}${path}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const err = data.error || { message: text };
    throw new Error(`Meta ${path} ${res.status}: ${err.message || JSON.stringify(err)}`);
  }
  return data as T;
}

async function metaUploadImageByUrl(accountId: string, url: string, token: string): Promise<string> {
  // Meta accepts JSON form: { url: "<sourceUrl>" } on /adimages.
  // Returns: { images: { <filename>: { hash, url, ... } } }
  const res = await fetch(`${META_BASE}/${accountId}/adimages?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    throw new Error(`Meta /adimages ${res.status}: ${data.error?.message || text}`);
  }
  const images = data.images || {};
  const firstKey = Object.keys(images)[0];
  const hash = firstKey ? images[firstKey].hash : undefined;
  if (!hash) throw new Error(`Meta /adimages: no hash in response (${text.slice(0, 200)})`);
  return hash;
}

// ────────────── Handler ──────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return bad('Method not allowed', 405);
  }

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return bad('Missing Bearer token', 401);

  const user = await verifyUser(token);
  if (!user) return bad('Invalid session', 401);

  let body: PushRequestBody;
  try { body = await req.json(); } catch { return bad('Invalid JSON body'); }

  if (!body.campaignId) return bad('campaignId required');

  // Load data via Supabase REST with the user's JWT (RLS enforced).
  let campaign: AdCampaign;
  let adSets: AdSet[];
  let creatives: AdCreative[];
  let banners: HistoryItem[];
  let metaAccounts: MetaAccount[];

  try {
    const campRows = await supaSelect(token, 'ad_campaigns', `id=eq.${body.campaignId}&select=*&limit=1`);
    if (!campRows[0]) return bad('Campaign not found or access denied', 404);
    campaign = rowToCampaign(campRows[0]);

    const adSetRows = await supaSelect(token, 'ad_sets', `campaign_id=eq.${body.campaignId}&select=*`);
    adSets = adSetRows.map(rowToAdSet);

    const creativeRows = await supaSelect(token, 'ad_creatives', `campaign_id=eq.${body.campaignId}&select=*`);
    creatives = creativeRows.map(rowToCreative);

    // Load only banners referenced by these creatives
    const bannerIds = Array.from(new Set(creatives.map(c => c.bannerId).filter(Boolean) as string[]));
    if (bannerIds.length > 0) {
      const idsCsv = bannerIds.map(id => `"${id}"`).join(',');
      const bRows = await supaSelect(token, 'banner_history', `id=in.(${idsCsv})&select=*`);
      banners = bRows.map(rowToBanner);
    } else {
      banners = [];
    }

    // Load only the Meta account referenced by this campaign (if any)
    if (campaign.metaAccountRefId) {
      try {
        const maRows = await supaSelect(token, 'meta_accounts', `id=eq.${campaign.metaAccountRefId}&select=*&limit=1`);
        metaAccounts = maRows.map(rowToMetaAccount);
      } catch {
        metaAccounts = [];
      }
    } else {
      metaAccounts = [];
    }
  } catch (e: any) {
    return json({ error: `Load data lỗi: ${e?.message}` }, 500);
  }

  const validation = validateForPush(campaign, adSets, creatives, banners, metaAccounts);
  const initialStatus = body.initialStatus || 'PAUSED';
  const payload = buildMetaPayload(campaign, adSets, creatives, banners, metaAccounts, { initialStatus });

  const metaToken = process.env.META_SYSTEM_USER_TOKEN;
  const dryRun = body.dryRun === true || !metaToken;

  if (dryRun || !validation.canPush) {
    const resp: PushResponse = {
      mode: 'dry-run',
      success: validation.canPush,
      campaignId: campaign.id,
      payload,
      errors: validation.errors.map(e => `[${e.scope}.${e.field}] ${e.message}`),
      warnings: validation.warnings.map(w => `[${w.scope}.${w.field}] ${w.message}`),
      message: !metaToken
        ? 'Server chưa cấu hình META_SYSTEM_USER_TOKEN — trả về preview payload.'
        : !validation.canPush
        ? 'Validation chưa pass — không push.'
        : 'Client yêu cầu dryRun.',
    };
    return json(resp);
  }

  // ────────── Real push ──────────
  const steps: PushResultPerStep[] = [];
  const resolved = resolveMetaAccount(campaign, metaAccounts);
  const accountId = resolved?.accountId || campaign.metaAccountId || '';
  if (!accountId) {
    return json({
      mode: 'push' as const, success: false, campaignId: campaign.id,
      errors: ['Campaign chưa link Meta Account — vào Campaigns → sửa → chọn Meta Account.'],
    } as PushResponse, 400);
  }
  const imageHashByBanner: Record<string, string> = {};

  // Step 1: images
  for (const u of payload.uploads) {
    try {
      const hash = await metaUploadImageByUrl(accountId, u.sourceUrl, metaToken);
      imageHashByBanner[u.localBannerId] = hash;
      steps.push({ step: 'upload', status: 'ok', localId: u.localBannerId, imageHash: hash });
    } catch (e: any) {
      steps.push({ step: 'upload', status: 'failed', localId: u.localBannerId, error: e?.message });
      return json({
        mode: 'push' as const,
        success: false,
        campaignId: campaign.id,
        steps,
        errors: [e?.message || 'image upload lỗi'],
      } as PushResponse, 500);
    }
  }

  // Step 2: campaign
  let metaCampaignId: string;
  try {
    const res = await metaPost<{ id: string }>(`/${accountId}/campaigns`, payload.campaign.body, metaToken);
    metaCampaignId = res.id;
    steps.push({ step: 'campaign', status: 'ok', localId: campaign.id, metaId: metaCampaignId });
    await supaPatch(token, 'ad_campaigns', campaign.id, {
      meta_campaign_id: metaCampaignId,
      status: 'active',
      updated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    steps.push({ step: 'campaign', status: 'failed', error: e?.message });
    return json({
      mode: 'push' as const,
      success: false,
      campaignId: campaign.id,
      steps,
      errors: [e?.message || 'campaign create lỗi'],
    } as PushResponse, 500);
  }

  // Step 3: adsets
  const metaAdsetByLocal: Record<string, string> = {};
  for (const a of payload.adSets) {
    try {
      const res = await metaPost<{ id: string }>(`/${accountId}/adsets`, { ...a.body, campaign_id: metaCampaignId }, metaToken);
      metaAdsetByLocal[a.localId] = res.id;
      steps.push({ step: 'adset', status: 'ok', localId: a.localId, metaId: res.id });
      await supaPatch(token, 'ad_sets', a.localId, {
        meta_ad_set_id: res.id,
        status: 'active',
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      steps.push({ step: 'adset', status: 'failed', localId: a.localId, error: e?.message });
    }
  }

  // Step 4: creatives
  const metaCreativeByLocal: Record<string, string> = {};
  for (const c of payload.creatives) {
    try {
      const hash = imageHashByBanner[c.localBannerId];
      if (!hash) throw new Error(`No image_hash for banner ${c.localBannerId}`);
      const bodyWithHash = JSON.parse(JSON.stringify(c.body));
      if (bodyWithHash.object_story_spec?.link_data) {
        bodyWithHash.object_story_spec.link_data.image_hash = hash;
      }
      const res = await metaPost<{ id: string }>(`/${accountId}/adcreatives`, bodyWithHash, metaToken);
      metaCreativeByLocal[c.localId] = res.id;
      steps.push({ step: 'creative', status: 'ok', localId: c.localId, metaId: res.id });
      await supaPatch(token, 'ad_creatives', c.localId, {
        meta_creative_id: res.id,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      steps.push({ step: 'creative', status: 'failed', localId: c.localId, error: e?.message });
    }
  }

  // Step 5: ads
  for (const ad of payload.ads) {
    try {
      const metaAdsetId = metaAdsetByLocal[ad.localAdsetId];
      const metaCreativeId = metaCreativeByLocal[ad.localCreativeId];
      if (!metaAdsetId) throw new Error(`No meta adset for local ${ad.localAdsetId}`);
      if (!metaCreativeId) throw new Error(`No meta creative for local ${ad.localCreativeId}`);
      const res = await metaPost<{ id: string }>(`/${accountId}/ads`, {
        ...ad.body,
        adset_id: metaAdsetId,
        creative: { creative_id: metaCreativeId },
      }, metaToken);
      steps.push({ step: 'ad', status: 'ok', localId: ad.localId, metaId: res.id });
      // Update creative with ad id + status=pushed + pushed_at
      await supaPatch(token, 'ad_creatives', ad.localCreativeId, {
        meta_ad_id: res.id,
        meta_adset_id: metaAdsetByLocal[ad.localAdsetId],
        status: 'pushed',
        pushed_at: new Date().toISOString(),
        push_error: null,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      steps.push({ step: 'ad', status: 'failed', localId: ad.localId, error: e?.message });
      // Record error on the creative
      await supaPatch(token, 'ad_creatives', ad.localCreativeId, {
        status: 'failed',
        push_error: e?.message || 'ad create lỗi',
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  const failed = steps.filter(s => s.status === 'failed');
  const resp: PushResponse = {
    mode: 'push',
    success: failed.length === 0,
    campaignId: campaign.id,
    metaCampaignId,
    steps,
    errors: failed.map(s => `${s.step} ${s.localId || ''}: ${s.error}`),
  };
  return json(resp);
}
