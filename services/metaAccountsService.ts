import { MetaAccount } from '../types';
import { getSupabase } from './supabaseClient';

// ────────────── SQL needed (one-time) ──────────────
// CREATE TABLE meta_accounts (
//   id text PRIMARY KEY,
//   user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
//   label text NOT NULL,
//   account_id text NOT NULL,
//   page_id text NOT NULL,
//   instagram_actor_id text,
//   is_default boolean DEFAULT false,
//   notes text,
//   created_at timestamptz DEFAULT now(),
//   updated_at timestamptz DEFAULT now()
// );
// CREATE INDEX ON meta_accounts (user_id, is_default DESC);
// ALTER TABLE meta_accounts ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "own meta_accounts" ON meta_accounts FOR ALL
//   USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
//
// -- Link to campaigns:
// ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS meta_account_ref_id text;

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user.id;
}

function rowToAccount(r: any): MetaAccount {
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

function accountToRow(a: MetaAccount, userId: string) {
  return {
    id: a.id,
    user_id: userId,
    label: a.label,
    account_id: a.accountId,
    page_id: a.pageId,
    instagram_actor_id: a.instagramActorId || null,
    is_default: !!a.isDefault,
    notes: a.notes || null,
    created_at: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export class MetaAccountsSetupRequiredError extends Error {
  constructor() {
    super('Chưa chạy SQL cho bảng meta_accounts. Mở Supabase SQL Editor và chạy block setup.');
    this.name = 'MetaAccountsSetupRequiredError';
  }
}

function isMissingTable(e: any): boolean {
  const msg = String(e?.message || e?.error || e || '').toLowerCase();
  return msg.includes('meta_accounts') || msg.includes('schema cache') || e?.code === '42P01';
}

export async function listMetaAccountsFromCloud(): Promise<MetaAccount[]> {
  try {
    const { data, error } = await getSupabase()
      .from('meta_accounts')
      .select('*')
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) {
      if (isMissingTable(error)) throw new MetaAccountsSetupRequiredError();
      throw error;
    }
    return (data || []).map(rowToAccount);
  } catch (e) {
    if (e instanceof MetaAccountsSetupRequiredError) throw e;
    console.warn('listMetaAccountsFromCloud failed', e);
    return [];
  }
}

export async function saveMetaAccountToCloud(a: MetaAccount): Promise<MetaAccount> {
  const userId = await requireUserId();
  const row = accountToRow(a, userId);
  // If marked as default, demote others first (single default per user).
  if (a.isDefault) {
    await getSupabase().from('meta_accounts').update({ is_default: false }).eq('user_id', userId);
  }
  const { error } = await getSupabase().from('meta_accounts').upsert(row, { onConflict: 'id' });
  if (error) {
    if (isMissingTable(error)) throw new MetaAccountsSetupRequiredError();
    throw error;
  }
  return { ...a, updatedAt: Date.now() };
}

export async function deleteMetaAccountFromCloud(id: string): Promise<void> {
  const { error } = await getSupabase().from('meta_accounts').delete().eq('id', id);
  if (error) throw error;
}

export function newMetaAccountDraft(): MetaAccount {
  return {
    id: Math.random().toString(36).substring(7) + Date.now().toString(36),
    label: '',
    accountId: '',
    pageId: '',
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Validates required fields. Returns array of error messages (empty if OK). */
export function validateMetaAccount(a: MetaAccount): string[] {
  const errs: string[] = [];
  if (!a.label.trim()) errs.push('Cần label (tên thân thiện)');
  if (!a.accountId.trim()) errs.push('Cần Ad Account ID');
  else if (!a.accountId.startsWith('act_')) errs.push('Ad Account ID phải có format act_XXXXXXXXX');
  if (!a.pageId.trim()) errs.push('Cần Facebook Page ID');
  return errs;
}
