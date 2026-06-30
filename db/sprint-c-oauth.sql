-- Sprint C: OAuth 2.1 Authorization Server tables for Banner Ads Pro MCP.
-- Run once in Supabase SQL Editor.
--
-- Why these tables exist:
--   Banner Ads Pro will host an MCP server at https://bannerads.coachio.ai/mcp
--   so that Claude Desktop / ChatGPT / Cursor can call our banners/drafts/
--   brand-style tools directly. MCP requires OAuth 2.1 with PKCE; Claude
--   discovers our authorization server via .well-known and registers itself
--   dynamically (RFC 7591), so we own the three classic OAuth tables:
--     1. Registered clients
--     2. Short-lived authorization codes
--     3. Access + refresh tokens
--   Identity (which human is logging in) is delegated to Supabase Auth —
--   we never store passwords here; we only bind issued tokens to a user_id.

-- ─────────────── 1. Registered MCP clients ───────────────
-- Each MCP client (Claude Desktop, ChatGPT, custom agent) gets one row,
-- created on first connect via the /api/mcp/register DCR endpoint.
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id            text PRIMARY KEY,                          -- generated client_id (e.g. "bap_client_abc123")
  client_name   text,                                       -- display label from registration payload
  redirect_uris text[] NOT NULL,
  grant_types   text[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',  -- public client (PKCE)
  software_id        text,
  software_version   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- DCR creates these without auth, so no RLS by user — but only the
-- service role and the OAuth endpoints (Edge functions) ever read them.
ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages clients"
  ON mcp_oauth_clients FOR ALL
  USING (false);  -- no direct user access; Edge function uses service role key

-- ─────────────── 2. Authorization codes (short-lived, 10 min) ───────────────
CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
  code                  text PRIMARY KEY,                  -- random 32-byte url-safe string
  client_id             text NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  code_challenge        text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256' CHECK (code_challenge_method IN ('S256', 'plain')),
  redirect_uri          text NOT NULL,
  scope                 text[] NOT NULL DEFAULT '{}',
  expires_at            timestamptz NOT NULL,
  used                  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_oauth_codes_client_idx ON mcp_oauth_codes (client_id, expires_at);
CREATE INDEX IF NOT EXISTS mcp_oauth_codes_user_idx   ON mcp_oauth_codes (user_id);

ALTER TABLE mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages codes"
  ON mcp_oauth_codes FOR ALL
  USING (false);

-- ─────────────── 3. Access + refresh tokens ───────────────
CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  access_token  text PRIMARY KEY,                          -- opaque random string
  refresh_token text UNIQUE,                                -- nullable: short-lived flows skip refresh
  client_id     text NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scope         text[] NOT NULL DEFAULT '{}',
  expires_at    timestamptz NOT NULL,                       -- access token expiry (1h default)
  refresh_expires_at timestamptz,                           -- refresh token expiry (30d default)
  revoked_at    timestamptz,                                -- NULL = active
  last_used_at  timestamptz,                                -- updated on each MCP call
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_user_idx    ON mcp_oauth_tokens (user_id, revoked_at);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_refresh_idx ON mcp_oauth_tokens (refresh_token) WHERE refresh_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_client_idx  ON mcp_oauth_tokens (client_id);

-- Users CAN list / revoke their own tokens from Settings → Connected apps.
ALTER TABLE mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own tokens"
  ON mcp_oauth_tokens FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "users revoke own tokens"
  ON mcp_oauth_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- INSERTs only via Edge function with service role.

-- ─────────────── Janitor (optional) ───────────────
-- Run periodically via Vercel Cron or pg_cron to prune expired/revoked rows.
-- (Comment out if not wired yet.)
--
-- CREATE OR REPLACE FUNCTION mcp_oauth_cleanup() RETURNS void AS $$
-- BEGIN
--   DELETE FROM mcp_oauth_codes WHERE expires_at < now() - interval '1 day';
--   DELETE FROM mcp_oauth_tokens
--     WHERE (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')
--        OR (expires_at < now() AND refresh_expires_at IS NULL)
--        OR (refresh_expires_at IS NOT NULL AND refresh_expires_at < now());
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
