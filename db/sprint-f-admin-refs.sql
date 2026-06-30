-- Sprint F: Admin-curated reference banner library.
-- Run once in Supabase SQL Editor.
--
-- Concept: admin (son@lovinbot.ai) uploads template banners categorized by
-- industry (F&B, Education, Beauty, ...). Each ref has AI-extracted layout
-- insights (layout / title position / composition / color palette) but NEVER
-- carries actual ad copy — only the design template gets reused.
--
-- When a user picks an industry in Banner Tool, the system auto-appends
-- 1-3 admin refs of that industry to the user's own reference + product
-- images, plus passes the insights as text guidance to Coachio.

-- ─────────────── 1. Industry taxonomy (admin-managed) ───────────────
CREATE TABLE IF NOT EXISTS ref_categories (
  id         text PRIMARY KEY,
  label      text NOT NULL,
  slug       text NOT NULL UNIQUE,
  emoji      text,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed common Vietnamese-market categories.
INSERT INTO ref_categories (id, label, slug, emoji, sort_order) VALUES
  ('fnb',         'F&B',                    'fnb',         '🍔', 10),
  ('education',   'Giáo dục / Workshop',    'education',   '🎓', 20),
  ('beauty',      'Làm đẹp',                'beauty',      '💄', 30),
  ('fashion',     'Thời trang',             'fashion',     '👗', 40),
  ('realestate',  'Bất động sản',           'realestate',  '🏠', 50),
  ('tech',        'Công nghệ / SaaS',       'tech',        '💻', 60),
  ('health',      'Sức khỏe / Y tế',        'health',      '🏥', 70),
  ('ecommerce',   'Thương mại điện tử',     'ecommerce',   '🛒', 80),
  ('event',       'Sự kiện / Concert',      'event',       '🎉', 90),
  ('other',       'Khác',                   'other',       '📦', 999)
ON CONFLICT (id) DO NOTHING;

-- ─────────────── 2. Admin-uploaded reference banners ───────────────
CREATE TABLE IF NOT EXISTS ref_banners (
  id          text PRIMARY KEY,
  category_id text NOT NULL REFERENCES ref_categories(id) ON DELETE RESTRICT,
  label       text,                          -- e.g. "Coffee shop launch poster"
  image_url   text NOT NULL,                  -- Bunny CDN
  -- insights JSON: { layout, title_position, composition, color_palette, style_notes, auto_generated, edited_by_admin }
  insights    jsonb,
  notes       text,                           -- free-form admin notes
  created_by  uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_banners_category_idx
  ON ref_banners (category_id, created_at DESC);

-- ─────────────── 3. RLS ───────────────
ALTER TABLE ref_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_banners    ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read taxonomy + refs (drives the Industry picker
-- in Banner Tool).
CREATE POLICY "read categories"
  ON ref_categories FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "read ref banners"
  ON ref_banners FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can write. Hardcoded email for now — swap to is_admin column
-- when you have more than one admin.
CREATE POLICY "admin writes categories"
  ON ref_categories FOR ALL
  USING ((auth.jwt() ->> 'email') = 'son@lovinbot.ai')
  WITH CHECK ((auth.jwt() ->> 'email') = 'son@lovinbot.ai');

CREATE POLICY "admin writes ref banners"
  ON ref_banners FOR ALL
  USING ((auth.jwt() ->> 'email') = 'son@lovinbot.ai')
  WITH CHECK ((auth.jwt() ->> 'email') = 'son@lovinbot.ai');
