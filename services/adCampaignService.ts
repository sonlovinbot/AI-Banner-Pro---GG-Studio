import { AdCampaign, AdCampaignObjective, AdCampaignStatus } from '../types';
import { getSupabase } from './supabaseClient';

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user.id;
}

function rowToCampaign(r: any): AdCampaign {
  return {
    id: r.id,
    name: r.name,
    objective: r.objective || undefined,
    dailyBudget: r.daily_budget != null ? Number(r.daily_budget) : undefined,
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
    tags: [],
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
