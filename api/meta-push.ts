// Vercel Edge function — pushes a local Campaign + its AdSets + Creatives to
// Meta Ads via Pipeboard MCP. Pipeboard handles the Meta App tier / App
// Review headache — they provide a Standard Access Marketing App on their
// side and proxy our requests. We only need a Pipeboard API token.
//
// Modes:
//   • Dry-run: PIPEBOARD_API_TOKEN unset OR request body { dryRun: true }
//     → loads from Supabase, validates, returns payload as preview.
//
//   • Real push: token set + dryRun=false → executes 5-step Pipeboard flow:
//       1. upload_ad_image per banner → image_hash
//       2. create_campaign → meta_campaign_id
//       3. create_adset per adset → meta_adset_id
//       4. create_ad_creative per creative → meta_creative_id
//       5. create_ad per ad → meta_ad_id
//     Then updates Supabase with returned Meta IDs.
//
// Required env vars (Vercel project settings):
//   PIPEBOARD_API_TOKEN     from https://pipeboard.co/api-tokens (free: 30 calls/week)
//   SUPABASE_URL            mirror of frontend env, used to verify user JWT
//   SUPABASE_ANON_KEY       mirror of frontend env

import { AdCampaign, AdSet, AdCreative, HistoryItem, MetaAccount } from '../types';
import { buildMetaPayload, validateForPush, resolveMetaAccount } from '../services/metaPushPayload';
import { callPipeboardTool, PipeboardError } from './_lib/pipeboardClient';

export const config = { runtime: 'edge' };


interface PushRequestBody {
  campaignId: string;
  dryRun?: boolean;
}

// SAFETY: every push from this app goes up as PAUSED. The user reviews + activates
// inside Meta Ads Manager manually. No override available — this is a hard rule.
const FORCED_INITIAL_STATUS: 'PAUSED' = 'PAUSED';

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

// ────────────── Handler ──────────────

async function handlerImpl(req: Request): Promise<Response> {
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
  const payload = buildMetaPayload(campaign, adSets, creatives, banners, metaAccounts, { initialStatus: FORCED_INITIAL_STATUS });

  const pipeboardToken = process.env.PIPEBOARD_API_TOKEN;
  const dryRun = body.dryRun === true || !pipeboardToken;

  if (dryRun || !validation.canPush) {
    const resp: PushResponse = {
      mode: 'dry-run',
      success: validation.canPush,
      campaignId: campaign.id,
      payload,
      errors: validation.errors.map(e => `[${e.scope}.${e.field}] ${e.message}`),
      warnings: validation.warnings.map(w => `[${w.scope}.${w.field}] ${w.message}`),
      message: !pipeboardToken
        ? 'Server chưa cấu hình PIPEBOARD_API_TOKEN — trả về preview payload.'
        : !validation.canPush
        ? 'Validation chưa pass — không push.'
        : 'Client yêu cầu dryRun.',
    };
    return json(resp);
  }

  // ────────── Real push via Pipeboard MCP ──────────
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

  // Pipeboard tool responses don't have a fixed shape across versions. This
  // helper pulls the "id" field from common variants so each step can record
  // a Meta-side id without us hard-coding one path.
  const extractId = (out: any): string | undefined => {
    if (!out) return undefined;
    return out.id || out.campaign_id || out.adset_id || out.ad_id || out.creative_id || out.data?.id;
  };
  const extractImageHash = (out: any, fileName: string): string | undefined => {
    if (!out) return undefined;
    return out.hash || out.image_hash
      || out.images?.[fileName]?.hash
      || (out.images && Object.values(out.images)[0] && (Object.values(out.images)[0] as any).hash);
  };

  // Step 1: Upload images via Pipeboard
  for (const u of payload.uploads) {
    try {
      const out = await callPipeboardTool('upload_ad_image', {
        account_id: accountId,
        image_url: u.sourceUrl,
        name: u.fileName,
      }, pipeboardToken);
      const hash = extractImageHash(out, u.fileName);
      if (!hash) throw new Error(`No image_hash in response: ${JSON.stringify(out).slice(0, 200)}`);
      imageHashByBanner[u.localBannerId] = hash;
      steps.push({ step: 'upload', status: 'ok', localId: u.localBannerId, imageHash: hash });
    } catch (e: any) {
      const msg = e instanceof PipeboardError ? e.message : (e?.message || 'upload lỗi');
      steps.push({ step: 'upload', status: 'failed', localId: u.localBannerId, error: msg });
      return json({
        mode: 'push' as const,
        success: false,
        campaignId: campaign.id,
        steps,
        errors: [msg],
      } as PushResponse, 500);
    }
  }

  // Step 2: Create campaign via Pipeboard
  let metaCampaignId: string;
  try {
    const out = await callPipeboardTool('create_campaign', {
      account_id: accountId,
      ...payload.campaign.body,
    }, pipeboardToken);
    const id = extractId(out);
    if (!id) throw new Error(`No campaign id in response: ${JSON.stringify(out).slice(0, 200)}`);
    metaCampaignId = id;
    steps.push({ step: 'campaign', status: 'ok', localId: campaign.id, metaId: metaCampaignId });
    await supaPatch(token, 'ad_campaigns', campaign.id, {
      meta_campaign_id: metaCampaignId,
      status: 'active',
      updated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    const msg = e instanceof PipeboardError ? e.message : (e?.message || 'campaign create lỗi');
    steps.push({ step: 'campaign', status: 'failed', error: msg });
    return json({
      mode: 'push' as const,
      success: false,
      campaignId: campaign.id,
      steps,
      errors: [msg],
    } as PushResponse, 500);
  }

  // Step 3: Create adsets via Pipeboard
  const metaAdsetByLocal: Record<string, string> = {};
  for (const a of payload.adSets) {
    try {
      const out = await callPipeboardTool('create_adset', {
        account_id: accountId,
        ...a.body,
        campaign_id: metaCampaignId,
      }, pipeboardToken);
      const id = extractId(out);
      if (!id) throw new Error(`No adset id in response: ${JSON.stringify(out).slice(0, 200)}`);
      metaAdsetByLocal[a.localId] = id;
      steps.push({ step: 'adset', status: 'ok', localId: a.localId, metaId: id });
      await supaPatch(token, 'ad_sets', a.localId, {
        meta_ad_set_id: id,
        status: 'active',
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      const msg = e instanceof PipeboardError ? e.message : (e?.message || 'adset create lỗi');
      steps.push({ step: 'adset', status: 'failed', localId: a.localId, error: msg });
    }
  }

  // Step 4: Create creatives via Pipeboard
  // Pipeboard's create_ad_creative expects image_hash + flat link fields at
  // top level — it constructs Meta's object_story_spec internally. Passing
  // a pre-built object_story_spec causes Pipeboard's media-validator to fail
  // with "No media provided" because it doesn't drill into link_data.
  const metaCreativeByLocal: Record<string, string> = {};
  for (const c of payload.creatives) {
    try {
      const hash = imageHashByBanner[c.localBannerId];
      if (!hash) throw new Error(`No image_hash for banner ${c.localBannerId}`);
      const oss = c.body.object_story_spec as any;
      const link = oss?.link_data || {};

      const creativeArgs: Record<string, any> = {
        account_id: accountId,
        name: c.body.name,
        image_hash: hash,
        page_id: oss?.page_id,
        link_url: link.link,
        message: link.message,
        headline: link.name,
        description: link.description,
        call_to_action_type: link.call_to_action?.type,
      };
      if (oss?.instagram_actor_id) creativeArgs.instagram_actor_id = oss.instagram_actor_id;
      // Strip null/undefined to keep payload clean
      for (const k of Object.keys(creativeArgs)) {
        if (creativeArgs[k] == null) delete creativeArgs[k];
      }

      const out = await callPipeboardTool('create_ad_creative', creativeArgs, pipeboardToken);
      const id = extractId(out);
      if (!id) throw new Error(`No creative id in response: ${JSON.stringify(out).slice(0, 200)}`);
      metaCreativeByLocal[c.localId] = id;
      steps.push({ step: 'creative', status: 'ok', localId: c.localId, metaId: id });
      await supaPatch(token, 'ad_creatives', c.localId, {
        meta_creative_id: id,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      const msg = e instanceof PipeboardError ? e.message : (e?.message || 'creative create lỗi');
      steps.push({ step: 'creative', status: 'failed', localId: c.localId, error: msg });
    }
  }

  // Step 5: Create ads via Pipeboard
  for (const ad of payload.ads) {
    try {
      const metaAdsetId = metaAdsetByLocal[ad.localAdsetId];
      const metaCreativeId = metaCreativeByLocal[ad.localCreativeId];
      if (!metaAdsetId) throw new Error(`No meta adset for local ${ad.localAdsetId}`);
      if (!metaCreativeId) throw new Error(`No meta creative for local ${ad.localCreativeId}`);
      const out = await callPipeboardTool('create_ad', {
        account_id: accountId,
        name: ad.body.name,
        adset_id: metaAdsetId,
        creative_id: metaCreativeId,
        status: ad.body.status,
      }, pipeboardToken);
      const id = extractId(out);
      if (!id) throw new Error(`No ad id in response: ${JSON.stringify(out).slice(0, 200)}`);
      steps.push({ step: 'ad', status: 'ok', localId: ad.localId, metaId: id });
      await supaPatch(token, 'ad_creatives', ad.localCreativeId, {
        meta_ad_id: id,
        meta_adset_id: metaAdsetId,
        status: 'pushed',
        pushed_at: new Date().toISOString(),
        push_error: null,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      const msg = e instanceof PipeboardError ? e.message : (e?.message || 'ad create lỗi');
      steps.push({ step: 'ad', status: 'failed', localId: ad.localId, error: msg });
      await supaPatch(token, 'ad_creatives', ad.localCreativeId, {
        status: 'failed',
        push_error: msg,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  const failed = steps.filter(s => s.status === 'failed');
  // Build cleanup warning if anything was created on Meta but the push didn't finish.
  // We can't auto-rollback (user might already be editing in Meta UI), but we surface
  // exactly what was orphaned so they can dọn tay nhanh.
  const warnings: string[] = [];
  if (failed.length > 0) {
    const okSteps = steps.filter(s => s.status === 'ok' && s.metaId);
    const orphaned = okSteps.map(s => `${s.step} ${s.metaId}`);
    if (orphaned.length > 0) {
      warnings.push(
        `⚠️ Đã tạo trên Meta nhưng push KHÔNG hoàn chỉnh. Vào Meta Ads Manager xóa thủ công: ` +
        orphaned.join(', '),
      );
    }
  }
  const resp: PushResponse = {
    mode: 'push',
    success: failed.length === 0,
    campaignId: campaign.id,
    metaCampaignId,
    steps,
    errors: failed.map(s => `${s.step} ${s.localId || ''}: ${s.error}`),
    warnings: warnings.length ? warnings : undefined,
  };
  return json(resp);
}

/** Top-level wrapper: any uncaught exception becomes a structured JSON 500.
 *  Without this, an unexpected throw would surface as a generic Vercel
 *  HTML 500 page, which the client can't parse into a useful error. */
export default async function handler(req: Request): Promise<Response> {
  try {
    return await handlerImpl(req);
  } catch (e: any) {
    const message = e?.message || String(e) || 'unknown error';
    const stack = (e?.stack || '').split('\n').slice(0, 3).join(' | ');
    return json({
      mode: 'push',
      success: false,
      campaignId: '',
      errors: [`Edge function crash: ${message}`, `stack: ${stack}`],
    }, 500);
  }
}
