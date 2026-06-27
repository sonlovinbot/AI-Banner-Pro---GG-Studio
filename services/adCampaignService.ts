import { AdCampaign, AdCampaignObjective, AdCampaignStatus, MetaBidStrategy, MetaSpecialAdCategory } from '../types';
import { getSupabase } from './supabaseClient';

// ────────────── SQL needed (one-time, additive) ──────────────
// ALTER TABLE ad_campaigns
//   ADD COLUMN IF NOT EXISTS lifetime_budget bigint,
//   ADD COLUMN IF NOT EXISTS spend_cap bigint,
//   ADD COLUMN IF NOT EXISTS use_cbo boolean DEFAULT false,
//   ADD COLUMN IF NOT EXISTS bid_strategy text,
//   ADD COLUMN IF NOT EXISTS special_ad_categories text[] DEFAULT '{}',
//   ADD COLUMN IF NOT EXISTS meta_account_id text,
//   ADD COLUMN IF NOT EXISTS meta_account_ref_id text;

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user.id;
}

// Legacy objectives that exist in old rows. Map to closest ODAX so the UI
// keeps working after the type narrowing.
const LEGACY_OBJECTIVE_MAP: Record<string, AdCampaignObjective> = {
  TRAFFIC: 'OUTCOME_TRAFFIC',
  CONVERSIONS: 'OUTCOME_SALES',
  REACH: 'OUTCOME_AWARENESS',
  ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
  MESSAGES: 'OUTCOME_ENGAGEMENT',
  LEAD_GENERATION: 'OUTCOME_LEADS',
  APP_INSTALLS: 'OUTCOME_APP_PROMOTION',
  BRAND_AWARENESS: 'OUTCOME_AWARENESS',
};

function normalizeObjective(v: any): AdCampaignObjective | undefined {
  if (!v) return undefined;
  const s = String(v);
  if (s.startsWith('OUTCOME_')) return s as AdCampaignObjective;
  return LEGACY_OBJECTIVE_MAP[s];
}

function rowToCampaign(r: any): AdCampaign {
  return {
    id: r.id,
    name: r.name,
    objective: normalizeObjective(r.objective),
    dailyBudget: r.daily_budget != null ? Number(r.daily_budget) : undefined,
    lifetimeBudget: r.lifetime_budget != null ? Number(r.lifetime_budget) : undefined,
    spendCap: r.spend_cap != null ? Number(r.spend_cap) : undefined,
    useCBO: r.use_cbo ?? undefined,
    bidStrategy: (r.bid_strategy as MetaBidStrategy) || undefined,
    specialAdCategories: (r.special_ad_categories as MetaSpecialAdCategory[]) || undefined,
    metaAccountRefId: r.meta_account_ref_id || undefined,
    metaAccountId: r.meta_account_id || undefined,
    metaPageId: r.meta_page_id || undefined,
    metaInstagramActorId: r.meta_instagram_actor_id || undefined,
    tags: r.tags || [],
    status: r.status as AdCampaignStatus,
    metaCampaignId: r.meta_campaign_id || undefined,
    notes: r.notes || undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

function campaignToRow(c: AdCampaign, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    objective: c.objective || null,
    daily_budget: c.dailyBudget ?? null,
    lifetime_budget: c.lifetimeBudget ?? null,
    spend_cap: c.spendCap ?? null,
    use_cbo: c.useCBO ?? false,
    bid_strategy: c.bidStrategy || null,
    special_ad_categories: c.specialAdCategories || [],
    meta_account_ref_id: c.metaAccountRefId || null,
    meta_account_id: c.metaAccountId || null,
    tags: c.tags || [],
    status: c.status,
    meta_campaign_id: c.metaCampaignId || null,
    notes: c.notes || null,
    created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function listCampaignsFromCloud(): Promise<AdCampaign[]> {
  try {
    const { data, error } = await getSupabase()
      .from('ad_campaigns')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToCampaign);
  } catch (e) {
    console.warn('listCampaignsFromCloud failed', e);
    return [];
  }
}

export async function saveCampaignToCloud(c: AdCampaign): Promise<AdCampaign> {
  const userId = await requireUserId();
  const row = campaignToRow(c, userId);
  const { error } = await getSupabase().from('ad_campaigns').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return { ...c, updatedAt: Date.now() };
}

export async function deleteCampaignFromCloud(id: string): Promise<void> {
  const { error } = await getSupabase().from('ad_campaigns').delete().eq('id', id);
  if (error) throw error;
}

export function newCampaignDraft(name: string, objective?: AdCampaignObjective): AdCampaign {
  return {
    id: Math.random().toString(36).substring(7) + Date.now().toString(36),
    name,
    objective,
    useCBO: true,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    tags: [],
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ────────────── Helpers / Constants for UI ──────────────

export const OBJECTIVE_LABELS: Record<AdCampaignObjective, string> = {
  OUTCOME_AWARENESS:     'Awareness (Nhận biết)',
  OUTCOME_TRAFFIC:       'Traffic (Truy cập web)',
  OUTCOME_ENGAGEMENT:    'Engagement (Tương tác)',
  OUTCOME_LEADS:         'Leads (Thu data)',
  OUTCOME_SALES:         'Sales (Bán hàng)',
  OUTCOME_APP_PROMOTION: 'App Promotion',
};

export const BID_STRATEGY_LABELS: Record<MetaBidStrategy, string> = {
  LOWEST_COST_WITHOUT_CAP: 'Lowest cost (auto)',
  LOWEST_COST_WITH_BID_CAP: 'Lowest cost — bid cap',
  COST_CAP: 'Cost cap',
  LOWEST_COST_WITH_MIN_ROAS: 'Min ROAS',
};

export const SPECIAL_AD_CATEGORY_LABELS: Record<MetaSpecialAdCategory, string> = {
  EMPLOYMENT: 'Việc làm',
  HOUSING: 'Nhà ở / BĐS',
  CREDIT: 'Tài chính / tín dụng',
  ISSUES_ELECTIONS_POLITICS: 'Chính trị / bầu cử',
  ONLINE_GAMBLING_AND_GAMING: 'Cờ bạc / cá cược',
  FINANCIAL_PRODUCTS_SERVICES: 'Sản phẩm tài chính',
};
