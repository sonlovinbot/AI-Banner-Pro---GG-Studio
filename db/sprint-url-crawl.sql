-- Sprint URL Crawl: persist các brief sinh từ URL crawl trong MultiContentModal
-- sang Supabase thay vì localStorage.
--
-- Run once trong Supabase SQL Editor.
--
-- Không tie FK vào brand_projects vì URL crawl briefs độc lập với brand —
-- user có thể crawl một URL bất kỳ mà không cần chọn brand trước. User-scoped
-- only. Delete cascade khi user bị xoá.

CREATE TABLE IF NOT EXISTS url_crawl_briefs (
  id              text PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  source_url      text NOT NULL,
  brief_type      text NOT NULL,
  title           text NOT NULL,
  primary_message text,
  headline        text,
  primary_text    text,
  cta             text,
  tone_notes      text,
  is_enabled      boolean NOT NULL DEFAULT true,
  position        int NOT NULL DEFAULT 100,
  crawled_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS: chỉ chính user đọc/ghi được record của mình.
ALTER TABLE url_crawl_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "url_crawl_briefs self read" ON url_crawl_briefs;
CREATE POLICY "url_crawl_briefs self read"   ON url_crawl_briefs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "url_crawl_briefs self insert" ON url_crawl_briefs;
CREATE POLICY "url_crawl_briefs self insert" ON url_crawl_briefs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "url_crawl_briefs self update" ON url_crawl_briefs;
CREATE POLICY "url_crawl_briefs self update" ON url_crawl_briefs FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "url_crawl_briefs self delete" ON url_crawl_briefs;
CREATE POLICY "url_crawl_briefs self delete" ON url_crawl_briefs FOR DELETE USING (auth.uid() = user_id);

-- Query pattern chính: user's briefs order by position — index cho nhanh.
CREATE INDEX IF NOT EXISTS idx_url_crawl_briefs_user
  ON url_crawl_briefs (user_id, position);
