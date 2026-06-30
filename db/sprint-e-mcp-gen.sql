-- Sprint E: server-side Coachio gen for MCP tools.
-- Run once in Supabase SQL Editor.
--
-- Two tables:
--   1. user_api_keys  — stores Coachio API key per user so the MCP server
--      can call Coachio on the user's behalf when Claude triggers a gen.
--      Frontend syncs it from localStorage on every save.
--   2. mcp_gen_tasks  — tracks long-running gen jobs across requests.
--      start_banner_gen inserts a row, check_banner_gen polls / completes it.
--      Required because Coachio gen takes 30-90s, longer than a single
--      Edge function timeout (25s on Hobby).

-- ─────────────── 1. Per-user API keys ───────────────
CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id          uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  coachio_api_key  text,                          -- nullable: user can clear it
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users read + write only their own row.
CREATE POLICY "own api keys read"   ON user_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own api keys insert" ON user_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own api keys update" ON user_api_keys FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own api keys delete" ON user_api_keys FOR DELETE USING (auth.uid() = user_id);

-- ─────────────── 2. MCP banner-gen task tracker ───────────────
-- Lifecycle: start_banner_gen inserts 'pending' → Coachio webhook (or
-- check_banner_gen poll) flips it to 'completed' or 'failed'.

CREATE TABLE IF NOT EXISTS mcp_gen_tasks (
  id                 text PRIMARY KEY,            -- internal id we return to Claude
  user_id            uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  coachio_task_id    text NOT NULL,                -- Coachio's task id we poll
  status             text NOT NULL CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  prompt             text NOT NULL,
  aspect_ratio       text NOT NULL DEFAULT '1:1',
  model              text NOT NULL DEFAULT 'gpt_image_2',
  -- Reference banner ids passed in (for traceability).
  style_reference_banner_id   text,
  product_reference_banner_id text,
  -- Filled when status='completed':
  banner_id          text,                         -- references banner_history row we created
  image_url          text,                         -- CDN URL
  -- Filled when status='failed':
  error_message      text,
  -- Bookkeeping
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_gen_tasks_user_idx
  ON mcp_gen_tasks (user_id, status, created_at DESC);

ALTER TABLE mcp_gen_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own gen tasks"
  ON mcp_gen_tasks FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts / updates via Edge function (RLS bypassed for service_role).
-- No direct INSERT/UPDATE policy exposed to authenticated users.
