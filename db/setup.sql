-- ============================================================
-- AI Banner Pro — full Supabase setup (idempotent)
-- ============================================================
-- Chạy block này 1 lần trong Supabase SQL Editor.
-- Tất cả statements đều IF NOT EXISTS / IF EXISTS để chạy lại không lỗi.
-- ============================================================

-- ────────────── v0.10.0 (Sprint 2-5) ──────────────

-- Studio Chat — phiên chat AI brainstorm
CREATE TABLE IF NOT EXISTS ad_chat_sessions (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title text,
  system_prompt text,
  attached_banner_ids text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_chat_messages (
  id text PRIMARY KEY,
  session_id text REFERENCES ad_chat_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
  content jsonb NOT NULL,
  attached_banner_ids text[],
  usage jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_chat_messages_session_idx
  ON ad_chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS ad_chat_sessions_user_idx
  ON ad_chat_sessions (user_id, updated_at DESC);

ALTER TABLE ad_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own sessions" ON ad_chat_sessions;
CREATE POLICY "own sessions" ON ad_chat_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own messages" ON ad_chat_messages;
CREATE POLICY "own messages" ON ad_chat_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ────────────── Ad sets (Sprint 3) ──────────────

CREATE TABLE IF NOT EXISTS ad_sets (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  campaign_id text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  optimization_goal text,
  billing_event text,
  daily_budget bigint,
  lifetime_budget bigint,
  bid_amount bigint,
  start_time timestamptz,
  end_time timestamptz,
  destination_type text,
  promoted_page_id text,
  lead_gen_form_id text,
  targeting jsonb,
  is_dynamic_creative boolean DEFAULT false,
  meta_ad_set_id text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_sets_user_campaign_idx
  ON ad_sets (user_id, campaign_id);
CREATE INDEX IF NOT EXISTS ad_sets_campaign_idx
  ON ad_sets (campaign_id, updated_at DESC);

ALTER TABLE ad_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ad_sets" ON ad_sets;
CREATE POLICY "own ad_sets" ON ad_sets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ────────────── Meta Accounts (Sprint 5) ──────────────
-- Cấu hình 1 lần ở Settings → Meta Accounts. Campaign chỉ tham chiếu qua meta_account_ref_id.

CREATE TABLE IF NOT EXISTS meta_accounts (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  account_id text NOT NULL,
  page_id text NOT NULL,
  instagram_actor_id text,
  is_default boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_accounts_user_idx
  ON meta_accounts (user_id, is_default DESC);

ALTER TABLE meta_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own meta_accounts" ON meta_accounts;
CREATE POLICY "own meta_accounts" ON meta_accounts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ────────────── Extra columns ad_campaigns (Sprint 3 + 5) ──────────────

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS lifetime_budget bigint,
  ADD COLUMN IF NOT EXISTS spend_cap bigint,
  ADD COLUMN IF NOT EXISTS use_cbo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bid_strategy text,
  ADD COLUMN IF NOT EXISTS special_ad_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meta_account_id text,
  ADD COLUMN IF NOT EXISTS meta_account_ref_id text;

-- ────────────── Extra columns ad_creatives (Sprint 3) ──────────────

ALTER TABLE ad_creatives
  ADD COLUMN IF NOT EXISTS adset_id text;

-- ============================================================
-- DONE — Xác minh:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname='public'
--   AND tablename IN ('ad_chat_sessions','ad_chat_messages','ad_sets','meta_accounts');
-- ============================================================
