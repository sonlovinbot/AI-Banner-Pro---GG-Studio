import { AdSet, AdSetStatus, AdSetTargeting, AdCampaignObjective, MetaOptimizationGoal, MetaBillingEvent, MetaDestinationType } from '../types';
import { getSupabase } from './supabaseClient';

// ────────────── SQL needed (run once) ──────────────
// CREATE TABLE ad_sets (
//   id text PRIMARY KEY,
//   user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
//   campaign_id text NOT NULL,
//   name text NOT NULL,
//   status text NOT NULL DEFAULT 'draft',
//   optimization_goal text,
//   billing_event text,
//   daily_budget bigint,
//   lifetime_budget bigint,
//   bid_amount bigint,
//   start_time timestamptz,
//   end_time timestamptz,
//   destination_type text,
//   promoted_page_id text,
//   lead_gen_form_id text,
//   targeting jsonb,
//   is_dynamic_creative boolean DEFAULT false,
//   meta_ad_set_id text,
//   notes text,
//   created_at timestamptz DEFAULT now(),
//   updated_at timestamptz DEFAULT now()
// );
// CREATE INDEX ON ad_sets (user_id, campaign_id);
// CREATE INDEX ON ad_sets (campaign_id, updated_at DESC);
// ALTER TABLE ad_sets ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "own ad_sets" ON ad_sets FOR ALL
//   USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
// -- Also link creatives to adsets:
// ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS adset_id text;

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user.id;
}

function rowToAdSet(r: any): AdSet {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    name: r.name,
    status: r.status as AdSetStatus,
    optimizationGoal: (r.optimization_goal as MetaOptimizationGoal) || undefined,
    billingEvent: (r.billing_event as MetaBillingEvent) || undefined,
    dailyBudget: r.daily_budget != null ? Number(r.daily_budget) : undefined,
    lifetimeBudget: r.lifetime_budget != null ? Number(r.lifetime_budget) : undefined,
    bidAmount: r.bid_amount != null ? Number(r.bid_amount) : undefined,
    startTime: r.start_time || undefined,
    endTime: r.end_time || undefined,
    destinationType: (r.destination_type as MetaDestinationType) || undefined,
    promotedPageId: r.promoted_page_id || undefined,
    leadGenFormId: r.lead_gen_form_id || undefined,
    targeting: (r.targeting as AdSetTargeting) || undefined,
    isDynamicCreative: r.is_dynamic_creative ?? undefined,
    metaAdSetId: r.meta_ad_set_id || undefined,
    notes: r.notes || undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

function adSetToRow(a: AdSet, userId: string) {
  return {
    id: a.id,
    user_id: userId,
    campaign_id: a.campaignId,
    name: a.name,
    status: a.status,
    optimization_goal: a.optimizationGoal || null,
    billing_event: a.billingEvent || null,
    daily_budget: a.dailyBudget ?? null,
    lifetime_budget: a.lifetimeBudget ?? null,
    bid_amount: a.bidAmount ?? null,
    start_time: a.startTime || null,
    end_time: a.endTime || null,
    destination_type: a.destinationType || null,
    promoted_page_id: a.promotedPageId || null,
    lead_gen_form_id: a.leadGenFormId || null,
    targeting: a.targeting || null,
    is_dynamic_creative: a.isDynamicCreative ?? false,
    meta_ad_set_id: a.metaAdSetId || null,
    notes: a.notes || null,
    created_at: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export class AdSetSetupRequiredError extends Error {
  constructor() {
    super('Chưa chạy SQL cho bảng ad_sets. Mở Supabase SQL Editor → paste SQL trong AdSetSetupGuide.');
    this.name = 'AdSetSetupRequiredError';
  }
}

function isMissingTable(e: any): boolean {
  const msg = String(e?.message || e?.error || e || '').toLowerCase();
  return msg.includes('ad_sets') || msg.includes('schema cache') || e?.code === '42P01';
}

export async function listAdSetsFromCloud(campaignId?: string): Promise<AdSet[]> {
  try {
    let q = getSupabase().from('ad_sets').select('*').order('updated_at', { ascending: false });
    if (campaignId) q = q.eq('campaign_id', campaignId);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) throw new AdSetSetupRequiredError();
      throw error;
    }
    return (data || []).map(rowToAdSet);
  } catch (e) {
    if (e instanceof AdSetSetupRequiredError) throw e;
    console.warn('listAdSetsFromCloud failed', e);
    return [];
  }
}

export async function saveAdSetToCloud(a: AdSet): Promise<AdSet> {
  const userId = await requireUserId();
  const row = adSetToRow(a, userId);
  const { error } = await getSupabase().from('ad_sets').upsert(row, { onConflict: 'id' });
  if (error) {
    if (isMissingTable(error)) throw new AdSetSetupRequiredError();
    throw error;
  }
  return { ...a, updatedAt: Date.now() };
}

export async function deleteAdSetFromCloud(id: string): Promise<void> {
  const { error } = await getSupabase().from('ad_sets').delete().eq('id', id);
  if (error) throw error;
}

export function newAdSetDraft(campaignId: string, name: string): AdSet {
  return {
    id: Math.random().toString(36).substring(7) + Date.now().toString(36),
    campaignId,
    name,
    status: 'draft',
    billingEvent: 'IMPRESSIONS',
    destinationType: 'WEBSITE',
    targeting: { countries: ['VN'], ageMin: 18, ageMax: 55 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ────────────── Validation helpers ──────────────

/** Valid optimization goals per (objective, destinationType). Source: Pipeboard MCP create_adset doc. */
export function validOptimizationGoals(
  objective: AdCampaignObjective | undefined,
  destinationType: MetaDestinationType | undefined,
): MetaOptimizationGoal[] {
  if (!objective) return [];
  switch (objective) {
    case 'OUTCOME_AWARENESS':
      return ['REACH', 'IMPRESSIONS', 'AD_RECALL_LIFT', 'THRUPLAY'];
    case 'OUTCOME_TRAFFIC':
      return ['LANDING_PAGE_VIEWS', 'LINK_CLICKS', 'IMPRESSIONS', 'REACH'];
    case 'OUTCOME_ENGAGEMENT': {
      switch (destinationType) {
        case 'ON_POST':   return ['POST_ENGAGEMENT', 'IMPRESSIONS', 'REACH'];
        case 'ON_VIDEO':  return ['THRUPLAY', 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS'];
        case 'ON_EVENT':  return ['EVENT_RESPONSES', 'IMPRESSIONS', 'POST_ENGAGEMENT', 'REACH'];
        case 'ON_PAGE':   return ['PAGE_LIKES'];
        case 'MESSENGER':
        case 'WHATSAPP':
        case 'INSTAGRAM_DIRECT':
          return ['CONVERSATIONS', 'LINK_CLICKS'];
        case 'WEBSITE':
        default:
          return ['OFFSITE_CONVERSIONS', 'LANDING_PAGE_VIEWS', 'LINK_CLICKS', 'IMPRESSIONS', 'REACH'];
      }
    }
    case 'OUTCOME_LEADS':
      return ['LEAD_GENERATION', 'QUALITY_LEAD', 'QUALITY_CALL', 'OFFSITE_CONVERSIONS', 'LINK_CLICKS'];
    case 'OUTCOME_SALES':
      return ['OFFSITE_CONVERSIONS', 'VALUE', 'CONVERSIONS'];
    case 'OUTCOME_APP_PROMOTION':
      return ['OFFSITE_CONVERSIONS', 'LINK_CLICKS'];
    default:
      return [];
  }
}

export const OPTIMIZATION_GOAL_LABELS: Partial<Record<MetaOptimizationGoal, string>> = {
  REACH: 'Reach (Tiếp cận)',
  IMPRESSIONS: 'Impressions (Hiển thị)',
  AD_RECALL_LIFT: 'Ad Recall Lift',
  THRUPLAY: 'ThruPlay (xem ≥15s)',
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: 'Xem video ≥2s',
  LANDING_PAGE_VIEWS: 'Landing Page Views',
  LINK_CLICKS: 'Link Clicks',
  POST_ENGAGEMENT: 'Post Engagement',
  PAGE_LIKES: 'Page Likes',
  EVENT_RESPONSES: 'Event Responses',
  CONVERSATIONS: 'Conversations (Inbox)',
  LEAD_GENERATION: 'Lead Generation',
  QUALITY_LEAD: 'Quality Lead',
  QUALITY_CALL: 'Quality Call',
  OFFSITE_CONVERSIONS: 'Offsite Conversions',
  VALUE: 'Value (ROAS)',
  CONVERSIONS: 'Conversions',
};

export const BILLING_EVENT_LABELS: Record<MetaBillingEvent, string> = {
  IMPRESSIONS:     'Impressions (CPM)',
  LINK_CLICKS:     'Link clicks (CPC)',
  POST_ENGAGEMENT: 'Post engagement',
  THRUPLAY:        'ThruPlay',
  PAGE_LIKES:      'Page likes',
  NONE:            '— Không tính phí —',
};

export const DESTINATION_TYPE_LABELS: Record<MetaDestinationType, string> = {
  WEBSITE:           'Website (link ngoài)',
  ON_POST:           'Trên Post FB/IG',
  ON_VIDEO:          'Trên Video',
  ON_EVENT:          'Trên Event',
  ON_PAGE:           'Trên Page',
  MESSENGER:         'Messenger',
  WHATSAPP:          'WhatsApp',
  INSTAGRAM_DIRECT:  'Instagram Direct',
};
