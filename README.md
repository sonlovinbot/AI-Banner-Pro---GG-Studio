<div align="center">

# AI Banner Pro — *Nano Banana Pro*

Sinh banner quảng cáo & UGC content bằng AI, hỗ trợ **2 backend song song**: Google Gemini và Coachio AI.

</div>

## 📌 Giới thiệu

`bannerclone-pro` là ứng dụng web (React 19 + Vite + TypeScript) cho phép upload ảnh tham chiếu, ảnh sản phẩm, ảnh khuôn mặt… rồi sinh ra banner / ảnh UGC chất lượng cao thông qua một trong hai backend AI:

- **Gemini Direct** (`@google/genai`) — gọi thẳng API của Google, ảnh trả về dạng base64.
- **Coachio AI** (`https://api.coachio.ai/api/v1`) — upload ảnh → submit task → poll status → nhận URL CDN ảnh kết quả.

Người dùng có thể bật/tắt backend, quản lý brand kit, lịch sử và export/import dữ liệu để chuyển giữa các máy/server.

## ✨ Tính năng chính

| Module | Mô tả |
|---|---|
| **Banner Tool** | Upload ảnh tham chiếu + sản phẩm, chọn aspect ratio (1:1, 3:4, 4:3, 16:9, 9:16) & chất lượng (1K/2K/4K), sinh banner. Hỗ trợ multi-upload và library tái sử dụng ảnh. |
| **UGC Studio** | Workflow 3 ảnh: Face reference + Fashion/style + Product. Giữ nguyên khuôn mặt người mẫu giữa các lần generate (face-consistent). |
| **Brand Style** | Tạo brand project có sẵn: logo, ảnh style references, ảnh product references, brand info, JSON prompt. Dùng nhanh khi sinh banner. |
| **History** | Lưu mọi banner đã sinh vào localStorage. **Export JSON** để chuyển máy, **Import JSON** từ file, **Restore snapshot** từ JSON nhúng sẵn trong source code. |
| **API Settings** | Cấu hình & xác thực API key cho cả Google Gemini và Coachio. Chọn backend đang active. |

### 🔌 Coachio AI backend

Coachio chạy theo mô hình bất đồng bộ. `services/coachioService.ts` thực hiện đầy đủ:

1. `POST /upload/image` — upload từng ảnh (multipart, header `X-API-Key`). Xử lý lỗi `401` / `413` (>15MB) / `415` (định dạng không hỗ trợ).
2. `POST /task/submit` — gửi prompt + `media_inputs.images_url` + `ai_model_config` (`model_identifier`, `aspect_ratio`, `resolution`). Xử lý `402` (hết credit) và `429` (rate limit).
3. `GET /task/status/{task_id}` — poll mỗi **3s**, timeout sau **5 phút**. Khi `status=completed` lấy `result_urls` hoặc `result.output_urls`.
4. `validateCoachioApiKey(key)` — gọi nhẹ endpoint status để xác nhận key hợp lệ (mọi mã khác `401` được coi là OK).

API key Coachio được lưu trong `localStorage` dưới key `coachio_api_key`. Mở **API Settings** từ menu để dán key.

### 💾 Export / Import / Snapshot history

Dữ liệu lịch sử có thể di chuyển qua 3 cách (xem [services/storageService.ts](services/storageService.ts)):

- **Export JSON** — nút trên trang *History* xuất file `banner-history-YYYY-MM-DD-{n}.json` chứa payload v1 (`type/version/exportedAt/count/items`).
- **Import JSON** — nút Import mở file picker, dedupe theo `id`, merge và sort theo timestamp giảm dần.
- **Restore snapshot** — nút chỉ xuất hiện nếu mảng `EMBEDDED_HISTORY` trong [data/embeddedHistory.ts](data/embeddedHistory.ts) không rỗng. Paste JSON đã export vào constant này, commit, deploy → server mới mở trang History thấy nút *Restore snapshot {N}* để import 1 chạm. Lý tưởng khi clone repo lên môi trường mới.

## 🗂 Cấu trúc dự án

```
AI-Banner-Pro/
├── App.tsx                       # Router chuyển trang (state-based)
├── index.tsx / index.html        # Entry point Vite
├── types.ts                      # HistoryItem, BrandProject, UploadedImage, ...
├── vite.config.ts                # Dev server: port 3000, host 0.0.0.0
├── components/
│   ├── MenuPage.tsx              # Trang chủ — 5 thẻ điều hướng + badge backend
│   ├── BannerTool.tsx            # Sinh banner (Gemini hoặc Coachio)
│   ├── UGCStudio.tsx             # Face + Fashion + Product workflow
│   ├── BrandStylePage.tsx        # Quản lý brand projects (CRUD)
│   ├── HistoryPage.tsx           # Lịch sử + Export/Import/Snapshot
│   ├── ApiKeySettings.tsx        # Modal cài đặt API key 2 backend
│   ├── ImageUploader.tsx         # Drag/drop, paste, multi-file upload
│   └── ResultViewer.tsx          # Hiển thị ảnh kết quả + tải về
├── services/
│   ├── geminiService.ts          # Backend 1: @google/genai
│   ├── coachioService.ts         # Backend 2: REST + polling
│   ├── storageService.ts         # localStorage: history/library/brand/keys + export-import
│   └── imageUtils.ts             # Resize/compress/convert ảnh
└── data/
    └── embeddedHistory.ts        # Snapshot history nhúng trong code
```

### Khóa lưu trữ localStorage

| Key | Nội dung |
|---|---|
| `banner_pro_history` | Mảng `HistoryItem[]` |
| `banner_pro_library_{ref|prod|face}` | Library ảnh theo category (max 10 mỗi loại) |
| `banner_pro_brand_library` | Brand snippets |
| `banner_pro_brand_projects` | Brand projects đầy đủ |
| `gemini_api_key` / `coachio_api_key` | API key 2 backend |
| `active_backend` | `'gemini' \| 'coachio'` |

## 📊 Sơ đồ kiến trúc

```mermaid
graph TD
    U[Người dùng] --> Menu[MenuPage.tsx]
    Menu --> Banner[BannerTool.tsx]
    Menu --> UGC[UGCStudio.tsx]
    Menu --> Brand[BrandStylePage.tsx]
    Menu --> History[HistoryPage.tsx]
    Menu --> Settings[ApiKeySettings.tsx]

    Banner -->|backend switch| Router{active_backend}
    UGC -->|backend switch| Router

    Router -->|gemini| Gemini[geminiService.ts]
    Router -->|coachio| Coachio[coachioService.ts]

    Gemini -->|@google/genai| GAPI((Google Gemini API))
    Coachio -->|upload + submit + poll| CAPI((Coachio API))

    GAPI -.->|base64| Gemini
    CAPI -.->|CDN URL| Coachio

    Gemini --> Storage[storageService.ts]
    Coachio --> Storage
    Brand --> Storage
    History --> Storage

    Storage <--> LS[(localStorage)]
    Storage -.->|embedded snapshot| Embedded[data/embeddedHistory.ts]
    History -->|Export/Import JSON| File[(.json file)]

    style U fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    style GAPI fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style CAPI fill:#ffe0b2,stroke:#bf360c,stroke-width:2px
    style Storage fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
```

## 🛠 Cài đặt & chạy

**Yêu cầu:** Node.js ≥ 18, npm.

```bash
# 1. Cài dependencies
npm install

# 2. (Tuỳ chọn) Khai báo Gemini key qua biến môi trường
echo 'VITE_GEMINI_API_KEY="your-key-here"' > .env.local

# 3. Chạy dev server
npm run dev
# → http://localhost:3000/  (port set trong vite.config.ts)

# 4. Build production
npm run build

# 5. Type-check không emit
npm run lint
```

> **Lưu ý:** Cả 2 API key có thể nhập trực tiếp qua **API Settings** trong app, không bắt buộc dùng `.env`. Settings sẽ ghi vào `localStorage` và có nút validate.

## 🔁 Chuyển dữ liệu giữa các server

1. Trên máy cũ → mở **History** → nhấn **Export** → tải về `banner-history-….json`.
2. Mở file, copy mảng `items` (hoặc cả payload).
3. Paste vào `EMBEDDED_HISTORY` trong [data/embeddedHistory.ts](data/embeddedHistory.ts) → commit & deploy.
4. Máy / server mới → mở **History** → bấm **Restore snapshot {N}** → import xong.

Hoặc nếu không muốn đụng code: dùng nút **Import** trên trang History để chọn lại đúng file `.json` đã export.

---

*AI Studio link gốc: [AI Studio App](https://ai.studio/apps/8c8fe728-724a-403f-b53e-3f3e63891e29)*
