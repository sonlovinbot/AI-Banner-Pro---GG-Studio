// Frontend wrapper for /api/meta-fetch — pulls Pages / Pixels / IG accounts
// from Meta via Pipeboard. Results cached in localStorage per accountId so
// the AdSet editor can populate a Pixel dropdown without re-burning the
// Pipeboard quota every time it opens.

import { getSupabase } from './supabaseClient';

export interface MetaPage { id: string; name: string; accessTokenAvailable?: boolean }
export interface MetaPixel { id: string; name: string; code?: string; lastFiredAt?: string }
export interface MetaIgAccount { id: string; username?: string; name?: string }

export interface MetaAccountCache {
  pages?: MetaPage[];
  pixels?: MetaPixel[];
  instagramAccounts?: MetaIgAccount[];
  fetchedAt?: number;
}

const CACHE_KEY = (accountId: string) => `meta-cache:${accountId}`;

export function readMetaCache(accountId: string): MetaAccountCache {
  if (!accountId) return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY(accountId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeMetaCache(accountId: string, patch: Partial<MetaAccountCache>): MetaAccountCache {
  const cur = readMetaCache(accountId);
  const next = { ...cur, ...patch, fetchedAt: Date.now() };
  try { localStorage.setItem(CACHE_KEY(accountId), JSON.stringify(next)); } catch {}
  return next;
}

export function clearMetaCache(accountId: string): void {
  try { localStorage.removeItem(CACHE_KEY(accountId)); } catch {}
}

async function callFetchApi(action: 'pages' | 'pixels' | 'instagram-accounts', accountId: string): Promise<any> {
  const { data: { session } } = await getSupabase().auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Chưa đăng nhập');
  const res = await fetch('/api/meta-fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, accountId }),
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch {
    throw new Error(`Server trả response không phải JSON (${res.status}, ${text.slice(0, 100)}).`);
  }
  if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export async function fetchPages(accountId: string): Promise<MetaPage[]> {
  const body = await callFetchApi('pages', accountId);
  const pages = body.pages || [];
  writeMetaCache(accountId, { pages });
  return pages;
}

export async function fetchPixels(accountId: string): Promise<MetaPixel[]> {
  const body = await callFetchApi('pixels', accountId);
  const pixels = body.pixels || [];
  writeMetaCache(accountId, { pixels });
  return pixels;
}

export async function fetchIgAccounts(accountId: string): Promise<MetaIgAccount[]> {
  const body = await callFetchApi('instagram-accounts', accountId);
  const instagramAccounts = body.instagramAccounts || [];
  writeMetaCache(accountId, { instagramAccounts });
  return instagramAccounts;
}

/** Fetch all three in parallel and cache. Used by the "Auto-fetch" button. */
export async function fetchAllForAccount(accountId: string): Promise<MetaAccountCache> {
  const [pages, pixels, igAccounts] = await Promise.allSettled([
    fetchPages(accountId),
    fetchPixels(accountId),
    fetchIgAccounts(accountId),
  ]);
  return {
    pages: pages.status === 'fulfilled' ? pages.value : undefined,
    pixels: pixels.status === 'fulfilled' ? pixels.value : undefined,
    instagramAccounts: igAccounts.status === 'fulfilled' ? igAccounts.value : undefined,
    fetchedAt: Date.now(),
  };
}

export interface MetaStatusReport {
  campaign?: { id: string; status?: string; effectiveStatus?: string };
  adsets: { id: string; status?: string; effectiveStatus?: string }[];
  ads: { id: string; status?: string; effectiveStatus?: string }[];
}

/** Pull live statuses from Meta for the given Meta IDs.
 *  Caller is responsible for patching local DB rows from the result. */
export async function syncStatusesFromMeta(args: {
  accountId: string;
  metaCampaignId?: string;
  metaAdsetIds?: string[];
  metaAdIds?: string[];
}): Promise<MetaStatusReport> {
  const { data: { session } } = await getSupabase().auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Chưa đăng nhập');
  const res = await fetch('/api/meta-fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'sync-statuses', ...args }),
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch {
    throw new Error(`Server trả response không phải JSON (${res.status}).`);
  }
  if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
  return body as MetaStatusReport;
}

/** Map Meta status string → local app status. */
export function mapMetaStatusToApp(meta: string | undefined): 'active' | 'paused' | 'archived' | undefined {
  if (!meta) return undefined;
  const s = meta.toUpperCase();
  if (s === 'ACTIVE') return 'active';
  if (s === 'PAUSED') return 'paused';
  if (s === 'ARCHIVED' || s === 'DELETED') return 'archived';
  return undefined;
}
