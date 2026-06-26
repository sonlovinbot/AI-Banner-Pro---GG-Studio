import { AdCreative, AdCreativeStatus, HistoryItem } from '../types';
import { getSupabase } from './supabaseClient';

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user.id;
}

function rowToCreative(r: any): AdCreative {
  return {
    id: r.id,
    campaignId: r.campaign_id || undefined,
    name: r.name || undefined,
    bannerId: r.banner_id || undefined,
    primaryText: r.primary_text || undefined,
    headline: r.headline || undefined,
    description: r.description || undefined,
    cta: r.cta || undefined,
    destinationUrl: r.destination_url || undefined,
    displayLink: r.display_link || undefined,
    audienceRef: r.audience_ref || undefined,
    status: r.status as AdCreativeStatus,
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
  };
}

function creativeToRow(c: AdCreative, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    campaign_id: c.campaignId || null,
    name: c.name || null,
    banner_id: c.bannerId || null,
    primary_text: c.primaryText || null,
    headline: c.headline || null,
    description: c.description || null,
    cta: c.cta || null,
    destination_url: c.destinationUrl || null,
    display_link: c.displayLink || null,
    audience_ref: c.audienceRef || null,
    status: c.status,
    tags: c.tags || [],
    source: c.source || 'user',
    imported_from_meta: !!c.importedFromMeta,
    original_meta_ad_id: c.originalMetaAdId || null,
    derived_from_creative_id: c.derivedFromCreativeId || null,
    meta_ad_id: c.metaAdId || null,
    meta_creative_id: c.metaCreativeId || null,
    meta_adset_id: c.metaAdsetId || null,
    pushed_at: c.pushedAt ? new Date(c.pushedAt).toISOString() : null,
    push_error: c.pushError || null,
    last_insight_at: c.lastInsightAt ? new Date(c.lastInsightAt).toISOString() : null,
    insights: c.insights || null,
    created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function listCreativesFromCloud(opts?: {
  status?: AdCreativeStatus;
  campaignId?: string;
  tag?: string;
}): Promise<AdCreative[]> {
  try {
    let q = getSupabase().from('ad_creatives').select('*').order('updated_at', { ascending: false });
    if (opts?.status) q = q.eq('status', opts.status);
    if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
    if (opts?.tag) q = q.contains('tags', [opts.tag]);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(rowToCreative);
  } catch (e) {
    console.warn('listCreativesFromCloud failed', e);
    return [];
  }
}

export async function getCreativeFromCloud(id: string): Promise<AdCreative | null> {
  try {
    const { data, error } = await getSupabase()
      .from('ad_creatives')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToCreative(data) : null;
  } catch (e) {
    console.warn('getCreativeFromCloud failed', e);
    return null;
  }
}

export async function saveCreativeToCloud(c: AdCreative): Promise<AdCreative> {
  const userId = await requireUserId();
  const row = creativeToRow(c, userId);
  const { error } = await getSupabase().from('ad_creatives').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return { ...c, updatedAt: Date.now() };
}

export async function deleteCreativeFromCloud(id: string): Promise<void> {
  const { error } = await getSupabase().from('ad_creatives').delete().eq('id', id);
  if (error) throw error;
}

/** Create a draft creative linked to an existing banner (called by "Send to Ads" button). */
export async function createCreativeFromBanner(banner: HistoryItem, opts?: {
  campaignId?: string;
  tags?: string[];
}): Promise<AdCreative> {
  const draft: AdCreative = {
    id: Math.random().toString(36).substring(7) + Date.now().toString(36),
    bannerId: banner.id,
    name: (banner.promptUsed || 'New creative').slice(0, 80),
    primaryText: '',
    headline: '',
    description: '',
    cta: 'SHOP_NOW',
    destinationUrl: '',
    status: 'draft',
    tags: opts?.tags || [],
    source: 'user',
    campaignId: opts?.campaignId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return await saveCreativeToCloud(draft);
}

/** Clone an existing creative for variant testing. */
export async function cloneCreativeInCloud(original: AdCreative): Promise<AdCreative> {
  const clone: AdCreative = {
    ...original,
    id: Math.random().toString(36).substring(7) + Date.now().toString(36),
    name: `${original.name || 'Creative'} (copy)`,
    status: 'draft',
    source: 'clone',
    derivedFromCreativeId: original.id,
    metaAdId: undefined,
    metaCreativeId: undefined,
    metaAdsetId: undefined,
    pushedAt: undefined,
    pushError: undefined,
    importedFromMeta: false,
    originalMetaAdId: undefined,
    lastInsightAt: undefined,
    insights: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return await saveCreativeToCloud(clone);
}

/** Bulk update status (used by "Mark ready" / "Mark paused"). */
export async function bulkUpdateCreativeStatus(ids: string[], status: AdCreativeStatus): Promise<number> {
  if (ids.length === 0) return 0;
  const userId = await requireUserId();
  const { error, count } = await getSupabase()
    .from('ad_creatives')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', userId);
  if (error) throw error;
  return count || ids.length;
}
