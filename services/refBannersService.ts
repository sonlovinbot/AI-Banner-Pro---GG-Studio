// Admin-curated reference banner library — CRUD + AI-driven insight extraction.
//
// Public read (any logged-in user fetches categories + refs for the Industry
// picker in BannerTool). Write only via admin (RLS enforces).

import { getSupabase } from './supabaseClient';
import { chatComplete } from './coachioLLMService';

export interface RefCategory {
  id: string;
  label: string;
  slug: string;
  emoji?: string;
  sort_order: number;
}

export interface RefBannerInsights {
  /** Tổng quan layout: vd "Centered hero with product on left, copy on right" */
  layout?: string;
  /** Vị trí + style của tiêu đề chính: vd "top-center, large bold" */
  title_position?: string;
  /** Bố cục: rule of thirds, focal points, ... */
  composition?: string;
  /** 3-5 hex colors quan trọng */
  color_palette?: string[];
  /** Phong cách: minimalist/maximalist, modern/vintage, ... */
  style_notes?: string;
  /** True khi AI sinh insights tự động */
  auto_generated?: boolean;
  /** True khi admin đã chỉnh sửa sau auto-gen */
  edited_by_admin?: boolean;
}

export interface RefBanner {
  id: string;
  categoryId: string;
  label?: string;
  imageUrl: string;
  insights?: RefBannerInsights;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

function rowToBanner(r: any): RefBanner {
  return {
    id: r.id,
    categoryId: r.category_id,
    label: r.label || undefined,
    imageUrl: r.image_url,
    insights: r.insights || undefined,
    notes: r.notes || undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

// ─── Categories (read-only for most users; admin can manage later) ───

export async function listRefCategories(): Promise<RefCategory[]> {
  const { data, error } = await getSupabase()
    .from('ref_categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) {
    console.warn('listRefCategories', error);
    return [];
  }
  return (data || []) as RefCategory[];
}

// ─── Ref banners ───

export async function listRefBanners(categoryId?: string): Promise<RefBanner[]> {
  let q = getSupabase()
    .from('ref_banners')
    .select('*')
    .order('created_at', { ascending: false });
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q;
  if (error) {
    console.warn('listRefBanners', error);
    return [];
  }
  return (data || []).map(rowToBanner);
}

function newId(): string {
  return 'ref_' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
}

export async function createRefBanner(args: {
  categoryId: string;
  imageUrl: string;
  label?: string;
  insights?: RefBannerInsights;
  notes?: string;
}): Promise<RefBanner> {
  const { data: { user } } = await getSupabase().auth.getUser();
  const id = newId();
  const now = new Date().toISOString();
  const row = {
    id,
    category_id: args.categoryId,
    image_url: args.imageUrl,
    label: args.label || null,
    insights: args.insights || null,
    notes: args.notes || null,
    created_by: user?.id || null,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await getSupabase()
    .from('ref_banners')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToBanner(data);
}

export async function updateRefBanner(
  id: string,
  patch: Partial<{ label: string; insights: RefBannerInsights; notes: string; categoryId: string }>,
): Promise<void> {
  const dbPatch: any = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) dbPatch.label = patch.label;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  if (patch.insights !== undefined) {
    dbPatch.insights = { ...patch.insights, edited_by_admin: true };
  }
  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId;
  const { error } = await getSupabase()
    .from('ref_banners')
    .update(dbPatch)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteRefBanner(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('ref_banners')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Auto-extract insights from an image URL via Coachio Vision LLM ───

const EXTRACTION_PROMPT = `Bạn là designer phân tích bố cục banner ads chuyên nghiệp.
Phân tích ảnh được cung cấp và TRẢ VỀ DUY NHẤT một JSON object hợp lệ, không markdown, không giải thích thêm:

{
  "layout": "mô tả layout tổng quan, 5-15 từ tiếng Việt",
  "title_position": "vị trí + style của tiêu đề chính (vd: top-center large bold)",
  "composition": "bố cục chính (rule of thirds / centered / asymmetric / ...), focal point, hướng nhìn",
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "style_notes": "phong cách thiết kế (minimalist/maximalist, modern/vintage, ...) — 5-15 từ"
}

QUAN TRỌNG:
- KHÔNG đọc / copy bất cứ text nào trong ảnh — chúng ta CHỈ phân tích template để tái tạo, không reuse content
- TRẢ VỀ JSON ONLY, không có \`\`\`json wrapper
- color_palette: 3-5 mã hex chính, không kể text/icon nhỏ
- title_position: hướng dẫn vị trí tiêu đề CHÍNH (logo + tagline tách riêng nếu cần)`;

export async function extractInsightsFromUrl(imageUrl: string): Promise<RefBannerInsights> {
  const { text } = await chatComplete([
    { role: 'system', content: EXTRACTION_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Phân tích banner này.' },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ], { model: 'google/gemini-3.1-flash-lite' });

  // Try to parse JSON. LLM sometimes wraps in ```json — strip it.
  let parsed: any;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI trả về không phải JSON hợp lệ: ${text.slice(0, 200)}`);
  }

  return {
    layout: typeof parsed.layout === 'string' ? parsed.layout : undefined,
    title_position: typeof parsed.title_position === 'string' ? parsed.title_position : undefined,
    composition: typeof parsed.composition === 'string' ? parsed.composition : undefined,
    color_palette: Array.isArray(parsed.color_palette)
      ? parsed.color_palette.filter((s: any) => typeof s === 'string').slice(0, 6)
      : undefined,
    style_notes: typeof parsed.style_notes === 'string' ? parsed.style_notes : undefined,
    auto_generated: true,
    edited_by_admin: false,
  };
}

// ─── Helpers: prompt enrichment for BannerTool ───

/** Convert insights → a text block injected into the gen prompt.
 *
 *  Important design choice: curated industry refs are fed to the model as
 *  TEXT ONLY, never as image URLs. Rationale:
 *    - Coachio backends (GPT Image 2, Nano Banana Pro) hard-cap at 5 refs.
 *      User's own style + product refs already claim 2-3 slots, so industry
 *      images would push over the cap and fail the request.
 *    - Text descriptions carry the layout / palette / composition intent
 *      just as well for style-only guidance.
 *    - Removes any risk of the model copying people / logos / specific
 *      imagery from the reference images.
 *
 *  Even when insights are missing (admin didn't extract), we still emit a
 *  short summary line (label + count) so the model knows there IS a curated
 *  visual language for this category. */
export function insightsToPromptHint(refs: RefBanner[]): string {
  if (refs.length === 0) return '';
  const lines: string[] = [
    '',
    'CATEGORY VISUAL LANGUAGE (text-only guidance from curated library):',
    `${refs.length} reference banner${refs.length > 1 ? 's' : ''} were selected from this category's curated set.`,
    'Rules — apply strictly:',
    '- Copy ONLY: layout, typography treatment, color palette, spatial hierarchy, and category-appropriate banner best-practices.',
    '- Do NOT invent people, speakers, faces, or specific imagery based on these refs.',
    '- Do NOT copy exact text, headlines, or brand names from the refs.',
    '',
    'Curated ref summaries:',
  ];

  refs.forEach((r, i) => {
    const ins = r.insights;
    const parts: string[] = [];
    if (ins?.layout)         parts.push(`layout: ${ins.layout}`);
    if (ins?.title_position) parts.push(`title position: ${ins.title_position}`);
    if (ins?.composition)    parts.push(`composition: ${ins.composition}`);
    if (ins?.color_palette?.length) parts.push(`palette: ${ins.color_palette.join(', ')}`);
    if (ins?.style_notes)    parts.push(`style: ${ins.style_notes}`);

    // Fallback: no AI insights yet → still surface label so the model has
    // something concrete to anchor on.
    if (parts.length === 0) {
      const fallback = r.label ? `(${r.label}) — no detailed insights extracted; use category defaults.` : 'no detailed insights yet; use category defaults.';
      lines.push(`Ref ${i + 1}: ${fallback}`);
      return;
    }

    const labelPart = r.label ? ` (${r.label})` : '';
    lines.push(`Ref ${i + 1}${labelPart}: ${parts.join('; ')}`);
  });

  return lines.join('\n');
}
