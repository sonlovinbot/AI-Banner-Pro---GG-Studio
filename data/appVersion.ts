// Bump this when shipping a release. Surfaced in MenuPage footer.
export const APP_VERSION = '0.8.0';
export const APP_VERSION_NAME = 'Full Cloud Migration';
export const APP_RELEASE_DATE = '2026-06-27';

export const APP_CHANGELOG: { version: string; date: string; highlights: string[] }[] = [
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
