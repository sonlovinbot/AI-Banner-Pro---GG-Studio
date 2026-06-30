// URL Import pipeline:
//   1. scrapeUrl(url)             → calls /api/firecrawl-scrape (server proxy) → markdown
//   2. summarizeContent(markdown) → Coachio LLM → ScrapedSummary JSON
//   3. generateBriefs(summary)    → Coachio LLM → BrandBrief[] (10 items, all types)
//
// All LLM calls are client-side (Coachio key in localStorage). Server only
// proxies Firecrawl since that key is admin-shared.

import { getSupabase } from './supabaseClient';
import { chatComplete } from './coachioLLMService';
import { ScrapedSummary, BriefType } from '../types';

// ─── 1. Scrape ───

export interface ScrapeResult {
  url: string;
  markdown: string;
  metadata: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
    sourceURL?: string;
  };
  bytes: number;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Chưa đăng nhập');

  const res = await fetch('/api/firecrawl-scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch {
    throw new Error(`Server trả non-JSON (${res.status})`);
  }
  if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
  return body as ScrapeResult;
}

// ─── 2. Summarize ───

const SUMMARY_PROMPT = `Bạn là chuyên gia performance marketing phân tích landing page để chuẩn bị brief cho banner ads.

Phân tích nội dung markdown được cung cấp và TRẢ VỀ DUY NHẤT một JSON object hợp lệ — KHÔNG markdown wrapper, KHÔNG giải thích:

{
  "brand": "Tên brand / công ty (1-5 từ)",
  "product": "Tên sản phẩm/dịch vụ cụ thể được quảng bá",
  "usp": "Unique Selling Proposition — 1 câu (10-25 từ) nêu rõ value chính",
  "target_audience": "Đối tượng cụ thể: nghề nghiệp, độ tuổi, pain point chính",
  "key_offerings": ["3-7 gạch đầu dòng: giá, ưu đãi, deliverables, ưu đãi sớm, ..."],
  "tone_of_voice": "Phong cách giao tiếp: chuyên nghiệp/thân thiện/aspirational/khẩn cấp/...",
  "notable_elements": ["3-5 yếu tố đáng chú ý: giảng viên, testimonial, số liệu cụ thể, partner, ..."]
}

QUAN TRỌNG:
- Chỉ trả JSON, không \`\`\`json wrapper
- Mọi field tiếng Việt nếu nội dung gốc tiếng Việt
- key_offerings và notable_elements luôn là array (rỗng nếu không có)
- Nếu thông tin không rõ → bỏ field hoặc empty string`;

export async function summarizeContent(markdown: string): Promise<ScrapedSummary> {
  const { text } = await chatComplete([
    { role: 'system', content: SUMMARY_PROMPT },
    {
      role: 'user',
      content: `Phân tích nội dung sau:\n\n${markdown.slice(0, 12000)}`,
    },
  ], { model: 'google/gemini-3.1-flash-lite', max_tokens: 2000 });

  return parseJsonLoosely<ScrapedSummary>(text);
}

// ─── 3. Generate 10 briefs ───

const BRIEF_TYPES: BriefType[] = [
  'offer-emphasis',
  'instructor-authority',
  'catchy-headline',
  'neutral-info',
  'social-proof',
  'urgency-fomo',
  'problem-solution',
  'benefit-led',
  'aspirational',
  'question-hook',
];

const TYPE_LABEL_VI: Record<BriefType, string> = {
  'offer-emphasis':       'Nhấn ưu đãi / giá',
  'instructor-authority': 'Uy tín giảng viên / chuyên gia',
  'catchy-headline':      'Hook mạnh / tiêu đề bắt mắt',
  'neutral-info':         'Thông tin trung tính',
  'social-proof':         'Bằng chứng xã hội / testimonial',
  'urgency-fomo':         'Khẩn cấp / FOMO',
  'problem-solution':     'Pain point + giải pháp',
  'benefit-led':          'Lợi ích cụ thể',
  'aspirational':         'Khát vọng / lifestyle',
  'question-hook':        'Câu hỏi gợi mở',
};

const BRIEFS_PROMPT = `Bạn là creative director chuyên viết brief cho banner performance ads tiếng Việt.

Từ tóm tắt brand được cung cấp, tạo CHÍNH XÁC 10 briefs khác nhau — mỗi brief 1 trong các type:
${BRIEF_TYPES.map((t, i) => `${i + 1}. ${t} — ${TYPE_LABEL_VI[t]}`).join('\n')}

Mỗi brief phải khác biệt rõ rệt về góc tiếp cận. KHÔNG lặp lại từ ngữ giữa các brief.

TRẢ VỀ DUY NHẤT một JSON array với 10 phần tử, KHÔNG markdown wrapper:

[
  {
    "brief_type": "offer-emphasis",
    "title": "Tên ngắn 5-10 từ mô tả brief này",
    "primary_message": "1-2 câu chốt — message chính (15-40 từ)",
    "headline": "Tiêu đề ad ngắn 5-10 từ (dùng cho ad headline field)",
    "primary_text": "Ad copy 40-100 từ — emoji nếu phù hợp, hook ở đầu, CTA ở cuối",
    "cta": "SHOP_NOW | LEARN_MORE | SIGN_UP | BUY_NOW | SUBSCRIBE | DOWNLOAD | CONTACT_US",
    "tone_notes": "Hướng dẫn tone 5-15 từ"
  },
  // ... 9 brief khác mỗi cái 1 type
]

QUAN TRỌNG:
- ĐÚNG 10 brief, ĐÚNG 10 type khác nhau (không trùng)
- Mọi field tiếng Việt
- CTA chọn từ list cố định trên
- Chỉ JSON, không \`\`\`json wrapper, không giải thích`;

export interface RawBrief {
  brief_type: BriefType;
  title: string;
  primary_message?: string;
  headline?: string;
  primary_text?: string;
  cta?: string;
  tone_notes?: string;
}

export async function generateBriefs(summary: ScrapedSummary): Promise<RawBrief[]> {
  const summaryText = JSON.stringify(summary, null, 2);
  const { text } = await chatComplete([
    { role: 'system', content: BRIEFS_PROMPT },
    {
      role: 'user',
      content: `Tóm tắt brand:\n${summaryText}\n\nTạo 10 briefs.`,
    },
  ], { model: 'google/gemini-3.1-flash-lite', max_tokens: 6000 });

  const parsed = parseJsonLoosely<RawBrief[]>(text);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM trả về không phải JSON array');
  }

  // Filter to known types + clip to 10
  const cleaned = parsed
    .filter(b => b && BRIEF_TYPES.includes(b.brief_type))
    .slice(0, 10);

  if (cleaned.length === 0) {
    throw new Error('LLM không trả về brief hợp lệ nào');
  }
  return cleaned;
}

// ─── helpers ───

function parseJsonLoosely<T>(raw: string): T {
  // Strip ```json wrapper + leading/trailing whitespace
  const cleaned = raw
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    // Try extracting the first {...} or [...] block
    const objMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch) {
      try { return JSON.parse(objMatch[1]) as T; } catch {}
    }
    throw new Error(`Không parse được JSON: ${cleaned.slice(0, 200)}`);
  }
}

export { BRIEF_TYPES, TYPE_LABEL_VI };
