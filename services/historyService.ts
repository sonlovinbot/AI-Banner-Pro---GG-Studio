import { HistoryItem } from '../types';
import { getSupabase } from './supabaseClient';
import { uploadDataUrlToBunny } from './bunnyService';

function rowToItem(row: any): HistoryItem {
  return {
    id: row.id,
    imageUrl: row.image_url,
    promptUsed: row.prompt_used || '',
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    duration: row.duration ?? undefined,
    model: row.model || '',
    quality: row.quality || '1K',
    aspectRatio: row.aspect_ratio || '1:1',
    parentId: row.parent_id || undefined,
    version: row.version ?? 1,
  };
}

function itemToRow(item: HistoryItem, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    image_url: item.imageUrl,
    prompt_used: item.promptUsed,
    duration: item.duration ?? null,
    model: item.model || null,
    quality: item.quality || null,
    aspect_ratio: item.aspectRatio || null,
    parent_id: item.parentId || null,
    version: item.version ?? 1,
    created_at: item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString(),
  };
}

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user.id;
}

export async function listHistoryFromCloud(): Promise<HistoryItem[]> {
  try {
    const { data, error } = await getSupabase()
      .from('banner_history')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToItem);
  } catch (e) {
    console.warn('listHistoryFromCloud failed', e);
    return [];
  }
}

export async function addHistoryToCloud(item: HistoryItem): Promise<HistoryItem> {
  const userId = await requireUserId();

  // If image is a data: URL (Gemini), persist it to Bunny first
  let imageUrl = item.imageUrl;
  if (imageUrl.startsWith('data:')) {
    const uploaded = await uploadDataUrlToBunny(imageUrl, `banner-${item.id}.png`, 'banners');
    imageUrl = uploaded.url;
  }

  const persisted: HistoryItem = { ...item, imageUrl };
  const row = itemToRow(persisted, userId);

  const { error } = await getSupabase().from('banner_history').insert(row);
  if (error) throw error;
  return persisted;
}

export async function removeHistoryFromCloud(id: string): Promise<void> {
  const { error } = await getSupabase().from('banner_history').delete().eq('id', id);
  if (error) throw error;
}

export async function clearHistoryInCloud(): Promise<void> {
  const userId = await requireUserId();
  const { error } = await getSupabase().from('banner_history').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function bulkAddHistoryToCloud(items: HistoryItem[]): Promise<{ inserted: number; skipped: number }> {
  if (items.length === 0) return { inserted: 0, skipped: 0 };
  const userId = await requireUserId();
  const rows = items.map(i => itemToRow(i, userId));
  // upsert by id to skip duplicates
  const { data, error } = await getSupabase()
    .from('banner_history')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  const inserted = data?.length ?? 0;
  return { inserted, skipped: rows.length - inserted };
}
