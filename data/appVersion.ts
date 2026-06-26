// Bump this when shipping a release. Surfaced in MenuPage footer.
export const APP_VERSION = '0.4.0';
export const APP_VERSION_NAME = 'Sidebar Shell & Theme System';
export const APP_RELEASE_DATE = '2026-06-23';

export const APP_CHANGELOG: { version: string; date: string; highlights: string[] }[] = [
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
