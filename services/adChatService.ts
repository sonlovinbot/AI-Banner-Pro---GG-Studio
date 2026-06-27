import { AdChatSession, AdChatMessage, AdChatRole, AdChatContentPart } from '../types';
import { getSupabase } from './supabaseClient';

// ────────────── SQL needed (run once in Supabase) ──────────────
// CREATE TABLE ad_chat_sessions (
//   id text PRIMARY KEY,
//   user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
//   title text,
//   system_prompt text,
//   attached_banner_ids text[] DEFAULT '{}',
//   created_at timestamptz DEFAULT now(),
//   updated_at timestamptz DEFAULT now()
// );
// CREATE TABLE ad_chat_messages (
//   id text PRIMARY KEY,
//   session_id text REFERENCES ad_chat_sessions(id) ON DELETE CASCADE NOT NULL,
//   user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
//   role text NOT NULL,
//   content jsonb NOT NULL,
//   attached_banner_ids text[],
//   usage jsonb,
//   created_at timestamptz DEFAULT now()
// );
// CREATE INDEX ON ad_chat_messages (session_id, created_at);
// CREATE INDEX ON ad_chat_sessions (user_id, updated_at DESC);
// ALTER TABLE ad_chat_sessions ENABLE ROW LEVEL SECURITY;
// ALTER TABLE ad_chat_messages ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "own sessions" ON ad_chat_sessions FOR ALL
//   USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
// CREATE POLICY "own messages" ON ad_chat_messages FOR ALL
//   USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

const SYSTEM_PROMPT_KEY = 'ad_chat_system_prompt';

export const DEFAULT_SYSTEM_PROMPT = `Bạn là chuyên gia copywriter quảng cáo Facebook/Meta Ads cho thị trường Việt Nam.

Khi user attach banner image, bạn:
- Phân tích visual: tone, mood, layout, sản phẩm, đối tượng nhắm
- Viết primary_text DÀI có sức thuyết phục theo công thức AIDA / PAS / FAB
- Bám insight VN, văn nói tự nhiên, KHÔNG dịch máy, KHÔNG sáo rỗng

Quy tắc copy:
- **primary_text** = body chính trên Facebook feed. VIẾT DÀI 150-500 ký tự — có hook, dẫn dắt, USP, CTA cảm xúc. Mobile mặc định cắt ở ~125 ký tự, nên 100 ký tự đầu PHẢI có hook đủ kích thích click "Xem thêm".
- **headline** = câu chốt deal đậm phía dưới ảnh, ≤ 40 ký tự, ngắn gọn lợi ích/giảm giá/ưu đãi.
- **description** = dòng phụ, ≤ 30 ký tự, hỗ trợ headline.
- Có thể dùng emoji vừa phải (📍✨🔥🎁) nếu phù hợp brand voice.
- Có thể chia primary_text thành nhiều dòng (\\n) để dễ đọc trên mobile.

Khi sẵn sàng đề xuất copy, output CHÍNH XÁC block:
<<COPY_SUGGEST>>
{
  "primary_text": "🔥 Body dài thuyết phục, có hook 100 chars đầu, USP, CTA cảm xúc, xuống dòng cho dễ đọc...",
  "headline": "Câu chốt deal ≤40 chars",
  "description": "Phụ ≤30 chars",
  "cta": "SHOP_NOW",
  "destination_url": "",
  "audience": "VD: Nữ 25-35 · HCM · thu nhập trung-cao",
  "tags": ["sale-83", "luxury"]
}
<<END>>

CTA hợp lệ: SHOP_NOW, LEARN_MORE, SIGN_UP, BUY_NOW, BOOK_TRAVEL, DOWNLOAD, CONTACT_US, GET_QUOTE, MESSAGE_PAGE, SUBSCRIBE, WATCH_MORE, GET_OFFER, INSTALL_MOBILE_APP, NO_BUTTON.

Luôn confirm thông tin còn thiếu (audience, mục tiêu, brand voice, USP, ưu đãi) trước khi suggest cuối cùng.`;

export function getGlobalSystemPrompt(): string {
  return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_SYSTEM_PROMPT;
}

export function setGlobalSystemPrompt(value: string): void {
  if (value.trim()) localStorage.setItem(SYSTEM_PROMPT_KEY, value);
  else localStorage.removeItem(SYSTEM_PROMPT_KEY);
}

export function resetGlobalSystemPrompt(): void {
  localStorage.removeItem(SYSTEM_PROMPT_KEY);
}

// ────────────── Helpers ──────────────

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');
  return user.id;
}

function genId(): string {
  return Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
}

function rowToSession(r: any): AdChatSession {
  return {
    id: r.id,
    title: r.title || undefined,
    systemPrompt: r.system_prompt || undefined,
    attachedBannerIds: r.attached_banner_ids || [],
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

function rowToMessage(r: any): AdChatMessage {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role as AdChatRole,
    content: r.content || [],
    attachedBannerIds: r.attached_banner_ids || undefined,
    usage: r.usage || undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  };
}

// ────────────── Setup check ──────────────

export class ChatSetupRequiredError extends Error {
  constructor() {
    super('Chưa chạy SQL setup cho ad_chat_sessions + ad_chat_messages. Mở Supabase SQL Editor và paste SQL trong setup guide.');
    this.name = 'ChatSetupRequiredError';
  }
}

function isMissingTableError(e: any): boolean {
  const msg = String(e?.message || e?.error || e || '').toLowerCase();
  return msg.includes('ad_chat_sessions') || msg.includes('ad_chat_messages')
    || msg.includes('schema cache') || (e?.code === '42P01');
}

// ────────────── Sessions CRUD ──────────────

export async function listChatSessions(): Promise<AdChatSession[]> {
  const { data, error } = await getSupabase()
    .from('ad_chat_sessions')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    if (isMissingTableError(error)) throw new ChatSetupRequiredError();
    console.warn('listChatSessions failed', error);
    return [];
  }
  return (data || []).map(rowToSession);
}

export async function createChatSession(opts?: {
  title?: string;
  systemPrompt?: string;
}): Promise<AdChatSession> {
  const userId = await requireUserId();
  const now = new Date().toISOString();
  const row = {
    id: genId(),
    user_id: userId,
    title: opts?.title || 'Phiên mới',
    system_prompt: opts?.systemPrompt || null,
    attached_banner_ids: [],
    created_at: now,
    updated_at: now,
  };
  const { error } = await getSupabase().from('ad_chat_sessions').insert(row);
  if (error) throw error;
  return rowToSession(row);
}

export async function updateChatSession(
  id: string,
  patch: Partial<Pick<AdChatSession, 'title' | 'systemPrompt' | 'attachedBannerIds'>>,
): Promise<void> {
  const row: any = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.systemPrompt !== undefined) row.system_prompt = patch.systemPrompt || null;
  if (patch.attachedBannerIds !== undefined) row.attached_banner_ids = patch.attachedBannerIds;
  const { error } = await getSupabase().from('ad_chat_sessions').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteChatSession(id: string): Promise<void> {
  const { error } = await getSupabase().from('ad_chat_sessions').delete().eq('id', id);
  if (error) throw error;
}

// ────────────── Messages CRUD ──────────────

export async function listChatMessages(sessionId: string): Promise<AdChatMessage[]> {
  try {
    const { data, error } = await getSupabase()
      .from('ad_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToMessage);
  } catch (e) {
    console.warn('listChatMessages failed', e);
    return [];
  }
}

export async function addChatMessage(
  sessionId: string,
  role: AdChatRole,
  content: AdChatContentPart[],
  opts?: { attachedBannerIds?: string[]; usage?: any },
): Promise<AdChatMessage> {
  const userId = await requireUserId();
  const row = {
    id: genId(),
    session_id: sessionId,
    user_id: userId,
    role,
    content,
    attached_banner_ids: opts?.attachedBannerIds || null,
    usage: opts?.usage || null,
    created_at: new Date().toISOString(),
  };
  const { error } = await getSupabase().from('ad_chat_messages').insert(row);
  if (error) throw error;
  // Touch parent session updated_at
  await updateChatSession(sessionId, {}).catch(() => {});
  return rowToMessage(row);
}

export async function deleteChatMessage(id: string): Promise<void> {
  const { error } = await getSupabase().from('ad_chat_messages').delete().eq('id', id);
  if (error) throw error;
}
