// Bump this when shipping a release. Surfaced in MenuPage footer.
export const APP_VERSION = '0.11.0';
export const APP_VERSION_NAME = 'Flow redesign + design system';
export const APP_RELEASE_DATE = '2026-06-29';

export const APP_CHANGELOG: { version: string; date: string; highlights: string[] }[] = [
  {
    version: '0.11.0',
    date: '2026-06-29',
    highlights: [
      'Flow redesign — Studio là HUB duy nhất tạo creative; 3 entry points (History, Campaigns, Brand) đều handoff vào Studio session mới',
      'CreativeFinalizeModal — 3 step picker (Campaign+AdSet → Banner → Copy) với inline "+ Mới", thay cho orphan creative cũ',
      'Pinned context per session — Campaign+AdSet+Brand+Banner+Model lưu per chat session',
      'Studio handoff service in-memory (tránh QuotaExceededError khi localStorage đầy)',
      'Settings → Storage tab — scan + selective cleanup localStorage theo nhóm (legacy/chat/keys/...), bar quota visual',
      'Design tokens semantic — light/dark mode WCAG-pass, status colors centralized, no more rainbow tabs',
      'Color sweep 15+ files — ~150 ad-hoc colors → semantic utility classes, brand orange + neutral slate + status only',
      'History thumbnails — 5 ThumbActions với label hover (Brainstorm/Edit/Xem/Tải/Xoá), 3-color discipline (brand/neutral/danger)',
      'Tab order swap — Studio · Library · Campaigns · Queue · Analytics (Library trước cho daily use)',
      'Brand Style — "Brainstorm" button mỗi brand card → mở Studio với brand auto-nạp',
      'Campaigns AdSet card — "Brainstorm Creative cho Ad Set" button → Studio với campaign+adset pin',
      'App.tsx deterministic navigation — onNavigate(page, {adsTab}) thay localStorage roundtrip',
      'Vite port 3000 → 3100 default (tránh xung đột với dev khác)',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-06-27',
    highlights: [
      'Sprint 2 — Studio Chat: AI brainstorm với Coachio LLM, multi-model picker per session, brand import, banner picker, quick prompts',
      'Sprint 3 — Campaign Manager: hierarchy Campaign → AdSet → Creative với 5 modal editor, ODAX objectives, optimization-goal map theo destination',
      'Sprint 3 — Campaign Wizard: AI sinh full campaign + 2-3 adsets + 3-6 creatives từ brief sản phẩm',
      'Sprint 4 — Queue Kanban: 6 columns Draft/Ready/Pushing/Pushed/Paused/Failed + drag-drop status change',
      'Sprint 5 — Meta push payload (Phase B): validator + payload preview + agent prompt MCP-ready',
      'Sprint 5 — Edge function /api/meta-push (Phase C+A): direct Meta Marketing API push (image upload → campaign → adset → creative → ad), dry-run mode',
      'Settings → Meta Accounts: cấu hình Ad Account + Page + IG global, mọi campaign tham chiếu',
      'Profile + API Keys unified modal, avatar upload với fallback base64',
      'UI polish: thumbnails Campaign/Creative, Vietnamese IME fix, markdown render, long FB body 2200 chars, color discipline',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-06-27',
    highlights: [
      'Sidebar item Ads Manager + page với 4 tabs (Studio, Library, Queue, Analytics)',
      'DB schema: ad_campaigns + ad_creatives + RLS policies',
      'Services: adCampaignService + adCreativeService (CRUD Supabase)',
      'Library tab: list/filter/search/clone/delete + creative editor đầy đủ ad fields',
      'Creative Editor: primary text, headline, description, CTA dropdown, destination URL, audience free-text, campaign assign, tags, status',
      'Nút "Send to Ads" trên History card → tự tạo creative draft link banner_id',
      'Placeholder UI cho Studio/Queue/Analytics (sẽ ship Sprint 2-6)',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-06-27',
    highlights: [
      'Image library (ref/prod/face) → Bunny + Supabase library_images',
      'Upload ảnh user → tự đẩy Bunny CDN, lưu URL metadata Supabase',
      'BannerTool + UGCStudio: nút "Migrate library" cho ảnh cũ localStorage',
      'Voted banner mirror sang cloud ref library qua Bunny',
      'Brand project apply: async fetch CDN refs cho cả style + product',
      'libraryItemToUploadedImageAsync: tự fetch CDN URL → base64 cho Gemini',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-06-27',
    highlights: [
      'Brand projects → Supabase brand_projects (multi-device sync)',
      'Brand projects: logo + style/product refs tự upload Bunny khi lưu',
      'Brand content snippets → Supabase brand_snippets',
      'LibraryImage type hỗ trợ cả url (cloud) lẫn base64 (legacy local)',
      'BrandStylePage: nút "Migrate local → cloud" cho brand projects cũ',
      'Image upload service riêng (imageLibraryService) sẵn sàng cho phase sau',
      'Compress Gemini base64 trước Bunny upload (fix Vercel 4.5MB body limit)',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-06-23',
    highlights: [
      'historyService + votesService: read/write Supabase, async',
      'BannerTool/UGCStudio: tự upload Gemini base64 lên Bunny → lưu URL vào Supabase',
      'HistoryPage: đọc cloud, badge "N cloud" + "N local", nút "Migrate local → cloud"',
      'Toggle vote → ghi cloud + tự lưu vào ref library',
      'Bulk migrate qua upsert ignoreDuplicates (snapshot 42 banner cũ vẫn import được)',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-06-23',
    highlights: [
      'Supabase authentication (email + password, magic link)',
      'AuthGate: login/signup UI + ConfigMissing screen khi chưa cấu hình env',
      'User profile cluster + Đăng xuất ở footer sidebar',
      'DB schema: profiles, banner_history, brand_projects, voted_banners + RLS policies',
      'Auto-create profile trigger khi user signup',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-06-23',
    highlights: [
      'Sidebar layout: AppShell với menu trái + dashboard mới',
      'Light/Dark theme — CSS variables + tokens (canvas/surface/raised/fg/muted/line)',
      'IBM Plex Sans + JetBrains Mono, brand color Vibe Orange (#F67D1C)',
      'CDN proxy: rewrite coachio-prod.b-cdn.net → cdn.coachio.ai (fix FPT block)',
      'Re-encode ảnh sang PNG sạch (fix Coachio 415 khi edit từ history)',
      'Default Coachio model = GPT Image 2',
      'Nút "Dán" clipboard ở mọi upload (ImageUploader, EditModal, BrandStyle, ResultViewer)',
      'Style ref + Product image: chỉ cần 1 trong 2 (không bắt buộc cả 2)',
      'Toàn bộ button & text color migrate sang theme-aware tokens',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-05-29',
    highlights: [
      'Banner versioning: history items track parentId + version',
      'Edit popup từ History (full luồng: prompt + ảnh ref + aspect + quality)',
      'Paste image (Ctrl/Cmd+V) ở mọi vùng upload',
      'Like banner → tự lưu vào style reference library',
      'Library limit 30, multi-content (≤5) + banner type (Ads / Sale / Awareness / Software)',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-05-28',
    highlights: [
      'Dual-backend: Gemini Direct + Coachio AI',
      'UGC Studio (face + fashion + product)',
      'Brand Style projects',
      'History export/import JSON + embedded snapshot',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-04-11',
    highlights: ['Initial Banner Tool — Gemini only'],
  },
];
