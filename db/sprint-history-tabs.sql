-- Sprint History Tabs: feature_type + session_id on banner_history.
-- Run once in Supabase SQL Editor.
--
-- Two additions:
--   1. feature_type — 'banner' | 'ugc' | ... — so we can tab-filter the
--      history page and the workspace-bottom Sessions panel by tool.
--      Backfill existing rows: legacy UGC rows had model prefixed with
--      "UGC · " (see UGCStudio.tsx before this sprint), so we detect them
--      by that pattern. Everything else defaults to 'banner'.
--   2. session_id — nullable text. Groups multiple banners generated in one
--      Generate click. Future-proof: we currently bucket by timestamp on
--      the client, but new rows can start writing a shared id for precision.

ALTER TABLE banner_history
  ADD COLUMN IF NOT EXISTS feature_type text,
  ADD COLUMN IF NOT EXISTS session_id   text;

-- Backfill feature_type from the "UGC · " model prefix hack.
UPDATE banner_history
   SET feature_type = 'ugc'
 WHERE feature_type IS NULL
   AND model IS NOT NULL
   AND model LIKE 'UGC %';

UPDATE banner_history
   SET feature_type = 'banner'
 WHERE feature_type IS NULL;

-- Enforce non-null going forward so we never have ambiguous rows again.
ALTER TABLE banner_history
  ALTER COLUMN feature_type SET DEFAULT 'banner';

ALTER TABLE banner_history
  ALTER COLUMN feature_type SET NOT NULL;

-- Indexes: history queries filter by feature_type + order by created_at.
CREATE INDEX IF NOT EXISTS idx_banner_history_feature_type
  ON banner_history (feature_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_banner_history_session_id
  ON banner_history (session_id)
  WHERE session_id IS NOT NULL;
