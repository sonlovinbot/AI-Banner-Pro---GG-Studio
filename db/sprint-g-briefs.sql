-- Sprint G: URL Import + brand briefs.
-- Run once in Supabase SQL Editor.
--
-- Three changes:
--   1. brand_briefs table — stores all 10 generated briefs per import (not just
--      the 5 user picks). User toggles is_selected to mark the picked ones.
--   2. brand_projects gets scraped_url / scraped_summary / scraped_at columns
--      so the imported context is tied to the brand record.
--   3. user_api_keys gets firecrawl_api_key — non-admin users provide their
--      own Firecrawl key (admin son@lovinbot.ai uses server env key).

-- ─────────────── 1. brand_briefs ───────────────
CREATE TABLE IF NOT EXISTS brand_briefs (
  id              text PRIMARY KEY,
  brand_id        text NOT NULL REFERENCES brand_projects(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  brief_type      text NOT NULL,                  -- offer-emphasis | instructor-authority | catchy-headline | neutral-info | social-proof | urgency-fomo | problem-solution | benefit-led | aspirational | question-hook
  title           text NOT NULL,                   -- short label shown in cards
  primary_message text,                            -- 1-2 sentence pitch
  headline        text,                            -- suggested ad headline (5-10 words)
  primary_text    text,                            -- suggested ad body (50-100 words)
  cta             text,                            -- SHOP_NOW / SIGN_UP / LEARN_MORE / ...
  tone_notes      text,                            -- tone/voice guidance for the gen
  source_url      text,                            -- URL this brief was derived from
  is_selected     boolean NOT NULL DEFAULT false,  -- user picked this for use in BannerTool
  position        integer NOT NULL DEFAULT 100,    -- ordering within the selection
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_briefs_brand_idx     ON brand_briefs (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_briefs_selected_idx  ON brand_briefs (brand_id, is_selected);
CREATE INDEX IF NOT EXISTS brand_briefs_user_idx      ON brand_briefs (user_id);

ALTER TABLE brand_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own briefs read"   ON brand_briefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own briefs insert" ON brand_briefs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own briefs update" ON brand_briefs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own briefs delete" ON brand_briefs FOR DELETE USING (auth.uid() = user_id);

-- ─────────────── 2. brand_projects extension ───────────────
ALTER TABLE brand_projects
  ADD COLUMN IF NOT EXISTS scraped_url     text,
  ADD COLUMN IF NOT EXISTS scraped_summary jsonb,
  ADD COLUMN IF NOT EXISTS scraped_at      timestamptz;

-- ─────────────── 3. user_api_keys extension ───────────────
ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS firecrawl_api_key text;
