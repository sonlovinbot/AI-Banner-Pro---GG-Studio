// Builds Meta-ready payloads from local Campaign/AdSet/Creative + validates.
// Output is consumed both by:
//   • Vercel Edge function /api/meta-push (direct Meta Marketing API call)
//   • Claude/OpenClaw via Pipeboard MCP (frontend exports JSON for user to paste)
// Both code paths target the SAME Meta v23 Graph API schema; the only difference
// is which transport actually does the POST.

import { AdCampaign, AdSet, AdCreative, HistoryItem, MetaAccount } from '../types';

/** Resolve account/page/IG from MetaAccount table reference, falling back to
 *  the deprecated direct fields on AdCampaign for old rows. */
export function resolveMetaAccount(
  campaign: AdCampaign,
  metaAccounts: MetaAccount[],
): { accountId: string; pageId: string; instagramActorId?: string; sourceLabel: string } | null {
  if (campaign.metaAccountRefId) {
    const a = metaAccounts.find(x => x.id === campaign.metaAccountRefId);
    if (a) {
      return {
        accountId: a.accountId,
        pageId: a.pageId,
        instagramActorId: a.instagramActorId,
        sourceLabel: `Meta Account: ${a.label}`,
      };
    }
  }
  if (campaign.metaAccountId || campaign.metaPageId) {
    return {
      accountId: campaign.metaAccountId || '',
      pageId: campaign.metaPageId || '',
      instagramActorId: campaign.metaInstagramActorId,
      sourceLabel: 'Legacy campaign fields (deprecated)',
    };
  }
  return null;
}

// ────────────── Validation ──────────────

export type IssueSeverity = 'error' | 'warning';

export type IssueFix =
  | { type: 'auto-assign-adset'; creativeId: string; adsetId: string; adsetName: string }
  | { type: 'edit-creative'; creativeId: string }
  | { type: 'edit-adset'; adsetId: string }
  | { type: 'edit-campaign'; campaignId: string };

export interface ValidationIssue {
  level: IssueSeverity;
  scope: 'campaign' | 'adset' | 'creative';
  refId: string;
  field: string;
  message: string;
  /** Human-friendly name for the offending entity — for nicer error rendering. */
  displayName?: string;
  /** Suggested fix the UI can offer as a button. */
  fix?: IssueFix;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  canPush: boolean;
}

/** Run all required-field checks for Meta API push. */
export function validateForPush(
  campaign: AdCampaign,
  adSets: AdSet[],
  creatives: AdCreative[],
  banners: HistoryItem[],
  metaAccounts: MetaAccount[] = [],
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const err = (scope: ValidationIssue['scope'], refId: string, field: string, message: string) =>
    issues.push({ level: 'error', scope, refId, field, message });
  const warn = (scope: ValidationIssue['scope'], refId: string, field: string, message: string) =>
    issues.push({ level: 'warning', scope, refId, field, message });

  // Campaign-level
  if (!campaign.name?.trim()) err('campaign', campaign.id, 'name', 'Campaign chưa có tên');
  if (!campaign.objective)    err('campaign', campaign.id, 'objective', 'Chưa chọn objective (ODAX)');

  // Meta account resolution
  const resolved = resolveMetaAccount(campaign, metaAccounts);
  if (!resolved) {
    err('campaign', campaign.id, 'metaAccountRefId', 'Chưa chọn Meta Account (Settings → Meta Accounts → Thêm → vào Campaign chọn)');
  } else {
    if (!resolved.accountId.startsWith('act_')) {
      err('campaign', campaign.id, 'metaAccountRefId', 'Ad Account ID sai format act_XXXXXXXXX');
    }
    if (!resolved.pageId) {
      err('campaign', campaign.id, 'metaAccountRefId', 'Meta Account thiếu Page ID');
    }
  }

  if (campaign.useCBO && campaign.dailyBudget == null && campaign.lifetimeBudget == null) {
    err('campaign', campaign.id, 'budget', 'CBO bật → cần dailyBudget HOẶC lifetimeBudget');
  }

  // Ad set checks
  if (adSets.length === 0) {
    err('campaign', campaign.id, 'adSets', 'Campaign chưa có ad set nào');
  }

  for (const a of adSets) {
    if (!a.name?.trim()) err('adset', a.id, 'name', 'Ad set chưa có tên');
    if (!a.optimizationGoal) err('adset', a.id, 'optimizationGoal', 'Chưa chọn optimization goal');
    if (!a.billingEvent) err('adset', a.id, 'billingEvent', 'Chưa chọn billing event');
    if (!campaign.useCBO && a.dailyBudget == null && a.lifetimeBudget == null) {
      err('adset', a.id, 'budget', 'Campaign không CBO → ad set cần dailyBudget HOẶC lifetimeBudget');
    }
    const resolvedPageId = resolved?.pageId || campaign.metaPageId;
    if (a.destinationType === 'ON_POST' && !a.promotedPageId && !resolvedPageId) {
      err('adset', a.id, 'promotedPageId', 'Destination ON_POST cần promotedPageId hoặc Page ID từ Meta Account');
    }

    // SALES + OFFSITE_CONVERSIONS / VALUE → must have promoted Pixel + Event Type
    const needsPixel =
      (campaign.objective === 'OUTCOME_SALES' &&
        (a.optimizationGoal === 'OFFSITE_CONVERSIONS' || a.optimizationGoal === 'VALUE')) ||
      (campaign.objective === 'OUTCOME_LEADS' && a.optimizationGoal === 'OFFSITE_CONVERSIONS');
    if (needsPixel) {
      if (!a.promotedPixelId) {
        err('adset', a.id, 'promotedPixelId',
          `Ad set "${a.name}" — ${a.optimizationGoal} cần Pixel ID. Vào Edit Ad Set → field Pixel ID.`);
      }
      if (!a.promotedCustomEventType) {
        err('adset', a.id, 'promotedCustomEventType',
          `Ad set "${a.name}" — cần Custom Event Type (PURCHASE / LEAD / ADD_TO_CART / ...).`);
      }
    }
    const t = a.targeting;
    if (!t?.countries || t.countries.length === 0) {
      warn('adset', a.id, 'targeting.countries', 'Chưa có country targeting');
    }
    if (t?.ageMin && t?.ageMax && t.ageMin > t.ageMax) {
      err('adset', a.id, 'targeting.age', 'ageMin > ageMax');
    }
  }

  // Creative checks
  const adsetIdsInCampaign = new Set(adSets.map(a => a.id));
  const campaignCreatives = creatives.filter(c => c.campaignId === campaign.id);

  if (campaignCreatives.length === 0) {
    err('campaign', campaign.id, 'creatives', 'Campaign chưa có creative nào');
  }

  for (const c of campaignCreatives) {
    const cname = c.name?.trim() || c.headline?.trim() || c.id.slice(0, 8);
    const addCreative = (
      level: IssueSeverity,
      field: string,
      message: string,
      fix?: IssueFix,
    ) => issues.push({
      level, scope: 'creative', refId: c.id, field, message,
      displayName: cname,
      fix,
    });

    if (!c.adsetId || !adsetIdsInCampaign.has(c.adsetId)) {
      // Auto-fix: if the campaign has at least one ad set, suggest assigning
      // to the FIRST one. User can manually re-pick later in Editor.
      const targetAdset = adSets[0];
      const fix: IssueFix | undefined = targetAdset
        ? { type: 'auto-assign-adset', creativeId: c.id, adsetId: targetAdset.id, adsetName: targetAdset.name }
        : { type: 'edit-creative', creativeId: c.id };
      addCreative(
        'error', 'adsetId',
        `Creative "${cname}" chưa gán Ad Set thuộc campaign`,
        fix,
      );
    }
    if (!c.name?.trim()) {
      addCreative('warning', 'name', `Creative "${cname}" chưa đặt tên`,
        { type: 'edit-creative', creativeId: c.id });
    }
    if (!c.primaryText?.trim() && !c.headline?.trim()) {
      addCreative('error', 'text', `Creative "${cname}" cần ít nhất primaryText hoặc headline`,
        { type: 'edit-creative', creativeId: c.id });
    }
    if (!c.bannerId) {
      addCreative('error', 'bannerId', `Creative "${cname}" chưa attach banner`,
        { type: 'edit-creative', creativeId: c.id });
    } else {
      const b = banners.find(x => x.id === c.bannerId);
      if (!b) addCreative('error', 'bannerId', `Creative "${cname}" — banner không còn tồn tại`,
        { type: 'edit-creative', creativeId: c.id });
      else if (!b.imageUrl) addCreative('error', 'bannerId', `Creative "${cname}" — banner thiếu URL`,
        { type: 'edit-creative', creativeId: c.id });
    }
    if (!c.cta) {
      addCreative('warning', 'cta', `Creative "${cname}" chưa chọn CTA`,
        { type: 'edit-creative', creativeId: c.id });
    }
    if (!c.destinationUrl?.trim() && c.cta !== 'NO_BUTTON' && c.cta !== 'MESSAGE_PAGE') {
      addCreative('error', 'destinationUrl', `Creative "${cname}" — CTA cần destinationUrl`,
        { type: 'edit-creative', creativeId: c.id });
    }
  }

  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');
  return {
    issues,
    errors,
    warnings,
    canPush: errors.length === 0,
  };
}

// ────────────── Payload builder ──────────────

export interface MetaPushPayload {
  /** Account ID for all POST calls (Meta v23 base URL). */
  accountId: string;
  apiVersion: string;
  /** Image upload — one entry per unique banner URL to convert to image_hash. */
  uploads: ImageUploadStep[];
  /** Campaign create payload — fed to POST /act_{id}/campaigns. */
  campaign: CampaignCreatePayload;
  /** Ad sets in this campaign — POST /act_{id}/adsets. */
  adSets: AdSetCreatePayload[];
  /** Creatives — POST /act_{id}/adcreatives. References image_hash from uploads + page_id. */
  creatives: CreativeCreatePayload[];
  /** Ads — POST /act_{id}/ads. References creative_id from creatives + adset_id from adSets. */
  ads: AdCreatePayload[];
  /** Cross-reference map for the client to wire up Meta IDs after each step. */
  refs: PushRefs;
}

export interface ImageUploadStep {
  /** Local banner id from history (banner_history table). */
  localBannerId: string;
  /** Public URL on Bunny — Edge function will fetch bytes from here. */
  sourceUrl: string;
  /** Filename to use when uploading bytes (multipart). */
  fileName: string;
}

export interface CampaignCreatePayload {
  localId: string;
  endpoint: string; // POST /act_{id}/campaigns
  body: {
    name: string;
    objective: string;
    status: 'PAUSED' | 'ACTIVE';
    bid_strategy?: string;
    daily_budget?: number;       // minor unit string in Meta — Edge function will String()
    lifetime_budget?: number;
    spend_cap?: number;
    special_ad_categories?: string[];
    buying_type?: string;
    campaign_budget_optimization?: boolean;
  };
}

export interface AdSetCreatePayload {
  localId: string;
  localCampaignId: string;
  endpoint: string;
  body: {
    name: string;
    /** Filled by Edge function once campaign_id is known from step 1. */
    campaign_id: string | null;
    status: 'PAUSED' | 'ACTIVE';
    optimization_goal: string;
    billing_event: string;
    daily_budget?: number;
    lifetime_budget?: number;
    bid_amount?: number;
    start_time?: string;
    end_time?: string;
    destination_type?: string;
    promoted_object?: Record<string, any>;
    targeting: MetaTargetingPayload;
    is_dynamic_creative?: boolean;
  };
}

export interface CreativeCreatePayload {
  localId: string;
  localAdsetId: string;
  /** Local banner ID — Edge function looks up image_hash from uploads. */
  localBannerId: string;
  endpoint: string;
  body: {
    name: string;
    object_story_spec: {
      page_id: string;
      instagram_actor_id?: string;
      link_data: {
        link: string;
        message?: string;
        name?: string;        // headline
        description?: string;
        image_hash: string;   // filled after upload step
        call_to_action?: {
          type: string;
          value?: { link?: string };
        };
      };
    };
  };
}

export interface AdCreatePayload {
  localId: string;
  localAdsetId: string;
  localCreativeId: string;
  endpoint: string;
  body: {
    name: string;
    adset_id: string | null;     // filled by Edge function
    creative: { creative_id: string | null }; // filled by Edge function
    status: 'PAUSED' | 'ACTIVE';
  };
}

export interface MetaTargetingPayload {
  geo_locations: {
    countries?: string[];
    cities?: { key: string }[];
  };
  age_min?: number;
  age_max?: number;
  genders?: number[];  // Meta: 1=male, 2=female
  flexible_spec?: Array<{ interests?: { id: string; name: string }[] }>;
  custom_audiences?: { id: string }[];
  excluded_custom_audiences?: { id: string }[];
}

export interface PushRefs {
  /** local id → human label, for showing in UI */
  campaign: { localId: string; label: string };
  adSets: { localId: string; label: string }[];
  creatives: { localId: string; label: string }[];
}

/** Convert local data → Meta API push payload (deterministic, no IO). */
export function buildMetaPayload(
  campaign: AdCampaign,
  adSets: AdSet[],
  creatives: AdCreative[],
  banners: HistoryItem[],
  metaAccounts: MetaAccount[] = [],
  opts: { apiVersion?: string; initialStatus?: 'PAUSED' | 'ACTIVE' } = {},
): MetaPushPayload {
  const apiVersion = opts.apiVersion || 'v23.0';
  const resolved = resolveMetaAccount(campaign, metaAccounts);
  const accountId = (resolved?.accountId || campaign.metaAccountId || '').trim();
  const pageId = resolved?.pageId || campaign.metaPageId || '';
  const instagramActorId = resolved?.instagramActorId || campaign.metaInstagramActorId;
  const status = opts.initialStatus || 'PAUSED';
  const acct = `/${apiVersion}/${accountId}`;

  // Unique uploads — one per banner used by any creative in this campaign
  const campaignCreatives = creatives.filter(c => c.campaignId === campaign.id);
  const uploads: ImageUploadStep[] = [];
  const seenBanner = new Set<string>();
  for (const c of campaignCreatives) {
    if (!c.bannerId || seenBanner.has(c.bannerId)) continue;
    const b = banners.find(x => x.id === c.bannerId);
    if (!b?.imageUrl) continue;
    uploads.push({
      localBannerId: b.id,
      sourceUrl: b.imageUrl,
      fileName: `${b.id}.jpg`,
    });
    seenBanner.add(b.id);
  }

  const campaignPayload: CampaignCreatePayload = {
    localId: campaign.id,
    endpoint: `${acct}/campaigns`,
    body: stripUndef({
      name: campaign.name,
      objective: campaign.objective!,
      status,
      bid_strategy: campaign.bidStrategy,
      daily_budget: campaign.useCBO ? campaign.dailyBudget : undefined,
      lifetime_budget: campaign.useCBO ? campaign.lifetimeBudget : undefined,
      spend_cap: campaign.spendCap,
      // Meta v23 requires special_ad_categories to be an array (can be empty).
      // The legacy ['NONE'] value is no longer valid — send [] for "no special
      // categories apply".
      special_ad_categories: campaign.specialAdCategories?.length ? campaign.specialAdCategories : [],
      campaign_budget_optimization: campaign.useCBO || undefined,
    }),
  };

  const adSetPayloads: AdSetCreatePayload[] = adSets.map(a => ({
    localId: a.id,
    localCampaignId: campaign.id,
    endpoint: `${acct}/adsets`,
    body: stripUndef({
      name: a.name,
      campaign_id: null,
      status,
      optimization_goal: a.optimizationGoal!,
      billing_event: a.billingEvent!,
      daily_budget: !campaign.useCBO ? a.dailyBudget : undefined,
      lifetime_budget: !campaign.useCBO ? a.lifetimeBudget : undefined,
      bid_amount: a.bidAmount,
      start_time: a.startTime,
      end_time: a.endTime,
      destination_type: a.destinationType,
      promoted_object: buildPromotedObject(a, campaign, pageId),
      targeting: buildTargeting(a),
      is_dynamic_creative: a.isDynamicCreative,
    }),
  }));

  const creativePayloads: CreativeCreatePayload[] = campaignCreatives.map(c => {
    const ctaType = c.cta && c.cta !== 'NO_BUTTON' ? c.cta : undefined;
    return {
      localId: c.id,
      localAdsetId: c.adsetId || '',
      localBannerId: c.bannerId || '',
      endpoint: `${acct}/adcreatives`,
      body: stripUndef({
        name: c.name || `Creative ${c.id.slice(0, 6)}`,
        object_story_spec: stripUndef({
          page_id: pageId,
          instagram_actor_id: instagramActorId,
          link_data: stripUndef({
            link: c.destinationUrl || '',
            message: c.primaryText,
            name: c.headline,
            description: c.description,
            image_hash: '__FILLED_AFTER_UPLOAD__',
            call_to_action: ctaType
              ? {
                  type: ctaType,
                  value: c.destinationUrl ? { link: c.destinationUrl } : undefined,
                }
              : undefined,
          }),
        }),
      }),
    } as CreativeCreatePayload;
  });

  const adPayloads: AdCreatePayload[] = campaignCreatives.map(c => ({
    localId: `ad_${c.id}`,
    localAdsetId: c.adsetId || '',
    localCreativeId: c.id,
    endpoint: `${acct}/ads`,
    body: {
      name: c.name || `Ad ${c.id.slice(0, 6)}`,
      adset_id: null,
      creative: { creative_id: null },
      status,
    },
  }));

  const refs: PushRefs = {
    campaign: { localId: campaign.id, label: campaign.name },
    adSets: adSets.map(a => ({ localId: a.id, label: a.name })),
    creatives: campaignCreatives.map(c => ({
      localId: c.id,
      label: c.name || c.headline || c.id.slice(0, 8),
    })),
  };

  return {
    accountId,
    apiVersion,
    uploads,
    campaign: campaignPayload,
    adSets: adSetPayloads,
    creatives: creativePayloads,
    ads: adPayloads,
    refs,
  };
}

/** Build the Meta `promoted_object` based on campaign objective + adset
 *  destination/optimization combination. Different objectives demand different
 *  fields — Meta rejects ad sets where promoted_object doesn't match. */
function buildPromotedObject(
  a: AdSet,
  campaign: AdCampaign,
  pageId?: string,
): Record<string, any> | undefined {
  const objective = campaign.objective;
  const goal = a.optimizationGoal;

  // SALES + OFFSITE_CONVERSIONS / VALUE → Pixel-based conversion tracking
  if (objective === 'OUTCOME_SALES' && (goal === 'OFFSITE_CONVERSIONS' || goal === 'VALUE')) {
    if (a.promotedPixelId && a.promotedCustomEventType) {
      return {
        pixel_id: a.promotedPixelId,
        custom_event_type: a.promotedCustomEventType,
      };
    }
    return undefined; // validator will catch this
  }

  // LEADS + OFFSITE_CONVERSIONS → same as SALES (pixel)
  if (objective === 'OUTCOME_LEADS' && goal === 'OFFSITE_CONVERSIONS') {
    if (a.promotedPixelId && a.promotedCustomEventType) {
      return {
        pixel_id: a.promotedPixelId,
        custom_event_type: a.promotedCustomEventType,
      };
    }
  }

  // ENGAGEMENT + ON_POST → page_id (Meta auto-derives post)
  if (objective === 'OUTCOME_ENGAGEMENT' && a.destinationType === 'ON_POST') {
    const p = a.promotedPageId || pageId;
    if (p) return { page_id: p };
  }

  // ENGAGEMENT + ON_PAGE (page likes) → page_id
  if (objective === 'OUTCOME_ENGAGEMENT' && a.destinationType === 'ON_PAGE') {
    const p = a.promotedPageId || pageId;
    if (p) return { page_id: p };
  }

  return undefined;
}

function buildTargeting(a: AdSet): MetaTargetingPayload {
  const t = a.targeting || {};
  const out: MetaTargetingPayload = {
    geo_locations: stripUndef({
      countries: t.countries?.length ? t.countries : undefined,
      cities: t.cities?.length ? t.cities.map(key => ({ key })) : undefined,
    }) as MetaTargetingPayload['geo_locations'],
    age_min: t.ageMin,
    age_max: t.ageMax,
    genders: t.genders?.length
      ? t.genders.map(g => (g === 'male' ? 1 : 2))
      : undefined,
  };
  if (t.interestIds?.length) {
    out.flexible_spec = [{
      interests: t.interestIds.map((id, i) => ({
        id,
        name: t.interestLabels?.[i] || id,
      })),
    }];
  }
  if (t.customAudienceIds?.length) {
    out.custom_audiences = t.customAudienceIds.map(id => ({ id }));
  }
  if (t.excludedCustomAudienceIds?.length) {
    out.excluded_custom_audiences = t.excludedCustomAudienceIds.map(id => ({ id }));
  }
  return stripUndef(out) as MetaTargetingPayload;
}

function stripUndef<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

// ────────────── Equivalent Pipeboard MCP payload ──────────────

/** Build a Claude / OpenClaw prompt body that an agent can execute step-by-step
 *  against Pipeboard MCP tools (create_campaign, create_adset, create_ad_creative,
 *  create_ad, bulk_upload_ad_images). Single text blob, ready to copy into chat. */
export function buildMcpAgentPrompt(payload: MetaPushPayload): string {
  const lines: string[] = [];
  lines.push('You are pushing an ad campaign to Meta Ads via Pipeboard MCP tools.');
  lines.push(`Account: ${payload.accountId} (Meta API ${payload.apiVersion}).`);
  lines.push(`SAFETY: status MUST be PAUSED for every object (campaign, ad sets, ads). DO NOT activate any of them — the user reviews and activates inside Meta Ads Manager manually. Report each Meta ID back when done.`);
  lines.push('');
  lines.push('## Step 1 — Upload images');
  if (payload.uploads.length === 0) {
    lines.push('No image uploads needed.');
  } else {
    payload.uploads.forEach((u, i) => {
      lines.push(`${i + 1}. Use bulk_upload_ad_images with images=[{"name":"${u.fileName}","url":"${u.sourceUrl}"}]. Record returned image_hash as IMAGE_HASH_${u.localBannerId}.`);
    });
  }
  lines.push('');
  lines.push('## Step 2 — Create campaign');
  lines.push('Call create_campaign with:');
  lines.push('```json');
  lines.push(JSON.stringify({ account_id: payload.accountId, ...payload.campaign.body }, null, 2));
  lines.push('```');
  lines.push('Record returned id as CAMPAIGN_ID.');
  lines.push('');
  lines.push('## Step 3 — Create ad sets');
  payload.adSets.forEach((a, i) => {
    lines.push(`### Ad set ${i + 1} (local id: ${a.localId})`);
    lines.push('Call create_adset with:');
    lines.push('```json');
    lines.push(JSON.stringify({
      account_id: payload.accountId,
      ...a.body,
      campaign_id: 'CAMPAIGN_ID',
    }, null, 2));
    lines.push('```');
    lines.push(`Record returned id as ADSET_ID_${a.localId}.`);
    lines.push('');
  });
  lines.push('## Step 4 — Create creatives');
  payload.creatives.forEach((c, i) => {
    lines.push(`### Creative ${i + 1} (local id: ${c.localId}, banner: ${c.localBannerId})`);
    lines.push('Call create_ad_creative with:');
    lines.push('```json');
    const body = JSON.parse(JSON.stringify(c.body));
    if (body.object_story_spec?.link_data) {
      body.object_story_spec.link_data.image_hash = `IMAGE_HASH_${c.localBannerId}`;
    }
    lines.push(JSON.stringify({ account_id: payload.accountId, ...body }, null, 2));
    lines.push('```');
    lines.push(`Record returned id as CREATIVE_ID_${c.localId}.`);
    lines.push('');
  });
  lines.push('## Step 5 — Create ads');
  payload.ads.forEach((ad, i) => {
    lines.push(`### Ad ${i + 1} (creative: ${ad.localCreativeId}, adset: ${ad.localAdsetId})`);
    lines.push('Call create_ad with:');
    lines.push('```json');
    lines.push(JSON.stringify({
      account_id: payload.accountId,
      name: ad.body.name,
      adset_id: `ADSET_ID_${ad.localAdsetId}`,
      creative_id: `CREATIVE_ID_${ad.localCreativeId}`,
      status: ad.body.status,
    }, null, 2));
    lines.push('```');
    lines.push('');
  });
  lines.push('## Step 6 — Report');
  lines.push('Return JSON: { campaignId, adsetIds: {local→meta}, creativeIds: {local→meta}, adIds: [...] }');
  lines.push('Done.');
  return lines.join('\n');
}
