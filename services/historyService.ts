import { HistoryItem, FeatureType } from '../types';
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
    featureType: (row.feature_type as FeatureType) || 'banner',
    sessionId: row.session_id || undefined,
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
    feature_type: item.featureType || 'banner',
    session_id: item.sessionId || null,
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

// ─────────── Session grouping ───────────

/** A group of history items generated in one Generate click (same
 *  sessionId, or bucketed by close timestamps if sessionId is missing). */
export interface HistorySession {
  key: string;              // sessionId if available, else "ts-<bucketStart>"
  startedAt: number;        // earliest timestamp in the group
  items: HistoryItem[];     // chronological, oldest first within the session
  featureType: FeatureType; // majority feature type in the group
}

/** Client-side bucketing. Rules:
 *   - Same non-empty sessionId → same group.
 *   - Otherwise: items within GAP_MS of each other (same featureType) merge.
 *  Input is expected in descending time order (as returned by listHistoryFromCloud).
 *  Output is descending time order of sessions (newest first). */
const SESSION_GAP_MS = 2 * 60 * 1000; // 2 minutes

export function bucketIntoSessions(items: HistoryItem[]): HistorySession[] {
  if (items.length === 0) return [];
  // Work with a shallow copy sorted ascending so bucketing is intuitive.
  const asc = [...items].sort((a, b) => a.timestamp - b.timestamp);
  const sessions: HistorySession[] = [];
  let current: HistorySession | null = null;

  for (const it of asc) {
    const feat = it.featureType || 'banner';
    if (!current) {
      current = { key: it.sessionId || `ts-${it.timestamp}`, startedAt: it.timestamp, items: [it], featureType: feat };
      continue;
    }
    const sameSessionId = it.sessionId && current.items[0]?.sessionId === it.sessionId;
    const sameFeature   = feat === current.featureType;
    const withinGap     = it.timestamp - current.items[current.items.length - 1].timestamp <= SESSION_GAP_MS;
    if (sameSessionId || (sameFeature && withinGap)) {
      current.items.push(it);
    } else {
      sessions.push(current);
      current = { key: it.sessionId || `ts-${it.timestamp}`, startedAt: it.timestamp, items: [it], featureType: feat };
    }
  }
  if (current) sessions.push(current);

  // Return newest first.
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
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
