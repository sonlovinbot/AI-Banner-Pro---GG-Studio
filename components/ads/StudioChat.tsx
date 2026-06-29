import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, MessageSquare, Settings as SettingsIcon, Send, Image as ImageIcon, Paperclip,
  Trash2, Loader2, Bot, User as UserIcon, X, Sparkles, Wand2, AlertCircle, Edit3,
  Clipboard, ChevronDown, ChevronUp, Palette, Layers, Target,
} from 'lucide-react';
import {
  AdChatSession, AdChatMessage, AdChatContentPart, HistoryItem,
  AdCopySuggestion, AdCreative, BrandProject,
} from '../../types';
import {
  DEFAULT_SYSTEM_PROMPT, getGlobalSystemPrompt, setGlobalSystemPrompt,
  listChatSessions, createChatSession, updateChatSession, deleteChatSession,
  listChatMessages, addChatMessage, ChatSetupRequiredError,
} from '../../services/adChatService';
import { chatStream, LLMMessage, LLMContentPart, CoachioLLMError, DEFAULT_MODEL } from '../../services/coachioLLMService';
import { listCoachioModels, CoachioModel, providerLabel } from '../../services/coachioModelsService';
import { parseCopySuggestions } from '../../services/copySuggestionParser';
import { renderMarkdownLite } from '../../services/markdownLite';
import { proxiedBannerUrl } from '../../services/cdnProxy';
import { uploadToBunny } from '../../services/bunnyService';
import { extractImageFiles, readImagesFromClipboard } from '../../services/imageUtils';
import { BannerPickerModal } from './BannerPickerModal';
import { BrandPickerModal, buildBrandContext } from './BrandPickerModal';
import { peekStudioHandoff, consumeStudioHandoff } from '../../services/studioHandoffService';
import { listBrandProjectsFromCloud } from '../../services/brandProjectService';

interface Props {
  banners: HistoryItem[];
  /** Pre-loaded campaigns + adsets for the pinned-context picker. */
  campaigns?: import('../../types').AdCampaign[];
  adSets?: import('../../types').AdSet[];
  onRefreshBanners?: () => void;
  /** Opens the finalize modal in AdsManagerPage. Receives banner ids + pinned
   *  Campaign/AdSet defaults from this session. */
  onApplySuggestion?: (
    suggestion: AdCopySuggestion,
    bannerIds: string[],
    pins?: { pinnedCampaignId?: string; pinnedAdsetId?: string },
  ) => Promise<AdCreative | void>;
}

interface UIMessage extends AdChatMessage {
  /** transient flag for streaming assistant message */
  streaming?: boolean;
}

// All localStorage writes below are wrapped in try/catch so a full quota
// (e.g. user's image cache filled up 5-10MB) doesn't throw an uncaught error
// at every state change. Storage failures degrade silently to in-memory only.
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };
const safeRemove = (k: string) => { try { localStorage.removeItem(k); } catch {} };
const safeGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };

const TEMP_KEY = 'ad_chat_temperature';
const getStoredTemp = () => Number(safeGet(TEMP_KEY)) || 0.7;
const setStoredTemp = (t: number) => safeSet(TEMP_KEY, String(t));

const MODEL_KEY_PREFIX = 'ad_chat_model_';
const getStoredModel = (sessionId: string): string => {
  if (!sessionId) return DEFAULT_MODEL;
  return safeGet(MODEL_KEY_PREFIX + sessionId) || DEFAULT_MODEL;
};
const setStoredModel = (sessionId: string, model: string) => {
  if (!sessionId) return;
  if (model) safeSet(MODEL_KEY_PREFIX + sessionId, model);
  else safeRemove(MODEL_KEY_PREFIX + sessionId);
};

const BRAND_KEY_PREFIX = 'ad_chat_brand_';
const getStoredBrand = (sessionId: string): { id: string; ctx: string; name: string } | null => {
  if (!sessionId) return null;
  try {
    const raw = safeGet(BRAND_KEY_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const setStoredBrand = (sessionId: string, val: { id: string; ctx: string; name: string } | null) => {
  if (!sessionId) return;
  if (val) safeSet(BRAND_KEY_PREFIX + sessionId, JSON.stringify(val));
  else safeRemove(BRAND_KEY_PREFIX + sessionId);
};

// Pinned campaign + adset per session — passed as defaults to the finalize modal.
const PINS_KEY_PREFIX = 'ad_chat_pins_';
interface SessionPins { campaignId?: string; adsetId?: string }
const getStoredPins = (sessionId: string): SessionPins => {
  if (!sessionId) return {};
  try {
    const raw = safeGet(PINS_KEY_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};
const setStoredPins = (sessionId: string, pins: SessionPins) => {
  if (!sessionId) return;
  if (!pins.campaignId && !pins.adsetId) {
    safeRemove(PINS_KEY_PREFIX + sessionId);
  } else {
    safeSet(PINS_KEY_PREFIX + sessionId, JSON.stringify(pins));
  }
};

export const StudioChat: React.FC<Props> = ({ banners, campaigns = [], adSets = [], onApplySuggestion }) => {
  const [sessions, setSessions] = useState<AdChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showBannerPicker, setShowBannerPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [temperature, setTemperature] = useState<number>(getStoredTemp());

  const [pendingBanners, setPendingBanners] = useState<HistoryItem[]>([]);
  const [pendingUploadUrls, setPendingUploadUrls] = useState<string[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [activeBrand, setActiveBrand] = useState<{ id: string; ctx: string; name: string } | null>(null);

  // Pinned destination — propagates as default to finalize modal.
  const [pins, setPins] = useState<SessionPins>({});
  const [showPinsPicker, setShowPinsPicker] = useState(false);

  const [toolsCollapsed, setToolsCollapsed] = useState(false);

  // Model picker state — per session, persisted in localStorage
  const [models, setModels] = useState<CoachioModel[]>([]);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL);

  // Handoff: when StudioChat opens from History/Brand/Campaigns it queues
  // a handoff in localStorage. We consume it once banners + sessions are ready.
  const [handoffPending, setHandoffPending] = useState(() => !!peekStudioHandoff());

  useEffect(() => {
    listCoachioModels().then(setModels).catch(e => console.warn('list models failed', e));
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  // ref into ChatInput so quick-prompt clicks pre-fill the textarea instead of sending right away
  const inputRef = useRef<{ setText: (t: string) => void; focus: () => void }>(null);

  const handlePickPrompt = (text: string) => {
    inputRef.current?.setText(text);
    inputRef.current?.focus();
  };

  const activeSession = useMemo(() => sessions.find(s => s.id === activeId), [sessions, activeId]);

  // ────────── Load sessions on mount
  useEffect(() => {
    listChatSessions()
      .then(s => {
        setSessions(s);
        setLoadingSessions(false);
        // If a handoff is queued we'll create a new session in the handoff
        // effect below — don't auto-select an old session here.
        if (!handoffPending && s.length > 0 && !activeId) setActiveId(s[0].id);
      })
      .catch(e => {
        setLoadingSessions(false);
        if (e instanceof ChatSetupRequiredError) setSetupNeeded(true);
        else setError(e?.message || 'Lỗi tải phiên chat');
      });
  }, []);

  // ────────── Consume Studio handoff (banners + brand + pins from History/etc)
  //   Runs once banners and sessions are both loaded so the handoff banner
  //   list can resolve against banners[].
  useEffect(() => {
    if (!handoffPending) return;
    if (loadingSessions) return;
    if (banners.length === 0) return;

    const handoff = consumeStudioHandoff();
    setHandoffPending(false);
    if (!handoff) return;

    (async () => {
      try {
        const title =
          handoff.source === 'history'   ? 'Brainstorm từ History' :
          handoff.source === 'campaigns' ? 'Brainstorm cho Ad Set' :
          handoff.source === 'brand-style' ? 'Brainstorm từ Brand' :
          'Phiên mới';
        const newSess = await createChatSession({ title });
        setSessions(prev => [newSess, ...prev]);
        setActiveId(newSess.id);
        setMessages([]);
        setToolsCollapsed(false);

        if (handoff.bannerIds?.length) {
          const items = handoff.bannerIds
            .map(id => banners.find(b => b.id === id))
            .filter(Boolean) as HistoryItem[];
          setPendingBanners(items);
        }

        if (handoff.brandId) {
          try {
            const projects = await listBrandProjectsFromCloud();
            const p = projects.find(x => x.id === handoff.brandId);
            if (p) {
              const val = { id: p.id, ctx: buildBrandContext(p), name: p.name };
              setActiveBrand(val);
              setStoredBrand(newSess.id, val);
            }
          } catch (e) {
            console.warn('handoff brand resolve failed', e);
          }
        }

        if (handoff.campaignId || handoff.adsetId) {
          const p: SessionPins = { campaignId: handoff.campaignId, adsetId: handoff.adsetId };
          setPins(p);
          setStoredPins(newSess.id, p);
        }
      } catch (e: any) {
        console.warn('handoff apply failed', e);
        setError(e?.message || 'Apply handoff lỗi');
      }
    })();
  }, [handoffPending, loadingSessions, banners]);

  // ────────── Load messages when active session changes
  useEffect(() => {
    if (!activeId) { setMessages([]); setActiveBrand(null); setModelId(DEFAULT_MODEL); setPins({}); return; }
    listChatMessages(activeId).then(loaded => {
      setMessages(loaded);
      setToolsCollapsed(loaded.length > 0);
    });
    setActiveBrand(getStoredBrand(activeId));
    setModelId(getStoredModel(activeId));
    setPins(getStoredPins(activeId));
  }, [activeId]);

  // ────────── Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // ────────── Session ops
  const handleNewSession = async () => {
    try {
      const s = await createChatSession();
      setSessions(prev => [s, ...prev]);
      setActiveId(s.id);
      setMessages([]);
      setPendingBanners([]);
      setPendingUploadUrls([]);
      setActiveBrand(null);
      setPins({});
      setToolsCollapsed(false);
    } catch (e: any) {
      setError(e?.message || 'Tạo phiên mới lỗi');
    }
  };

  const updatePins = (next: SessionPins) => {
    setPins(next);
    setStoredPins(activeId, next);
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('Xoá phiên chat này? Không khôi phục được.')) return;
    try {
      await deleteChatSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeId === id) {
        setActiveId(sessions.find(s => s.id !== id)?.id || '');
      }
    } catch (e: any) {
      setError(e?.message);
    }
  };

  // ────────── Attach files / paste / banners
  const handleFiles = async (files: FileList | File[]) => {
    setUploadingFile(true);
    try {
      const list = Array.from(files);
      for (const f of list) {
        if (!f.type.startsWith('image/')) continue;
        const res = await uploadToBunny(f, 'refs');
        setPendingUploadUrls(prev => [...prev, res.url]);
      }
    } catch (e: any) {
      setError(`Upload lỗi: ${e?.message}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const handlePasteOnInput = async (e: React.ClipboardEvent) => {
    const files = extractImageFiles(e.clipboardData?.items);
    if (files.length > 0) {
      e.preventDefault();
      await handleFiles(files);
    }
  };

  const handleClipboardClick = async () => {
    const files = await readImagesFromClipboard();
    if (files.length > 0) await handleFiles(files);
  };

  // ────────── Send message
  const handleSend = async (text: string) => {
    if (!text.trim() && pendingBanners.length === 0 && pendingUploadUrls.length === 0) return;
    setError(null);

    let session = activeSession;
    if (!session) {
      try {
        session = await createChatSession({ title: text.slice(0, 40) || 'Phiên mới' });
        setSessions(prev => [session!, ...prev]);
        setActiveId(session.id);
      } catch (e: any) {
        setError(e?.message);
        return;
      }
    }

    // Build user content parts
    const parts: AdChatContentPart[] = [];
    if (text.trim()) parts.push({ type: 'text', text: text.trim() });
    for (const b of pendingBanners) {
      parts.push({ type: 'image_url', image_url: { url: proxiedBannerUrl(b.imageUrl) } });
    }
    for (const url of pendingUploadUrls) {
      parts.push({ type: 'image_url', image_url: { url } });
    }
    if (parts.length === 0) return;

    const userBannerIds = pendingBanners.map(b => b.id);

    let userMsg: AdChatMessage;
    try {
      userMsg = await addChatMessage(session.id, 'user', parts, { attachedBannerIds: userBannerIds });
    } catch (e: any) {
      setError(`Lưu tin nhắn lỗi: ${e?.message}`);
      return;
    }

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setPendingBanners([]);
    setPendingUploadUrls([]);
    setToolsCollapsed(true);

    // Update session title if it's still the default
    if (session.title === 'Phiên mới' || !session.title) {
      const title = text.trim().slice(0, 60) || 'Banner brainstorm';
      updateChatSession(session.id, { title }).catch(() => {});
      setSessions(prev => prev.map(s => s.id === session!.id ? { ...s, title } : s));
    }

    // Build LLM payload — prepend brand context if user nạp brand vào phiên.
    const baseSystem = session.systemPrompt || getGlobalSystemPrompt();
    const systemPrompt = activeBrand?.ctx
      ? `${activeBrand.ctx}\n\n${baseSystem}`
      : baseSystem;
    const llmMessages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...nextMessages.map(m => ({
        role: m.role,
        content: m.content.map(p => p as LLMContentPart),
      } as LLMMessage)),
    ];

    // Stream assistant response
    setBusy(true);
    const placeholderId = `tmp-${Math.random().toString(36).slice(2, 8)}`;
    const placeholder: UIMessage = {
      id: placeholderId,
      sessionId: session.id,
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      createdAt: Date.now(),
      streaming: true,
    };
    setMessages(prev => [...prev, placeholder]);

    const ctrl = new AbortController();
    streamAbortRef.current = ctrl;
    let acc = '';
    let usage: any;
    try {
      for await (const chunk of chatStream(llmMessages, {
        model: modelId,
        temperature,
        signal: ctrl.signal,
      })) {
        if (chunk.delta) {
          acc += chunk.delta;
          setMessages(prev => prev.map(m =>
            m.id === placeholderId
              ? { ...m, content: [{ type: 'text', text: acc }] }
              : m,
          ));
        }
        if (chunk.usage) usage = chunk.usage;
      }

      // Persist final assistant message
      const finalContent: AdChatContentPart[] = [{ type: 'text', text: acc }];
      const persisted = await addChatMessage(session.id, 'assistant', finalContent, { usage });
      setMessages(prev => prev.map(m =>
        m.id === placeholderId ? { ...persisted, streaming: false } : m,
      ));
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== placeholderId));
      } else if (e instanceof CoachioLLMError) {
        setError(e.message);
        setMessages(prev => prev.filter(m => m.id !== placeholderId));
      } else {
        setError(e?.message || 'Stream lỗi');
        setMessages(prev => prev.filter(m => m.id !== placeholderId));
      }
    } finally {
      setBusy(false);
      streamAbortRef.current = null;
    }
  };

  const stopStream = () => {
    streamAbortRef.current?.abort();
  };

  // ────────── Group sessions by day
  const groupedSessions = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const groups: Record<string, AdChatSession[]> = { 'Hôm nay': [], 'Hôm qua': [], 'Trước đó': [] };
    for (const s of sessions) {
      if (s.updatedAt >= startOfToday) groups['Hôm nay'].push(s);
      else if (s.updatedAt >= startOfYesterday) groups['Hôm qua'].push(s);
      else groups['Trước đó'].push(s);
    }
    return groups;
  }, [sessions]);

  if (setupNeeded) {
    return <ChatSetupGuide />;
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-3 h-[calc(100vh-8rem)]">
      {/* ────────── Sessions sidebar */}
      <aside className="bg-surface border border-line rounded-lg flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-line">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-1.5 bg-brand hover:bg-brand-dark text-white text-sm font-medium py-2 rounded-md shadow-pop"
          >
            <Plus size={14} /> Phiên mới
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {loadingSessions ? (
            <div className="flex justify-center py-8 text-muted">
              <Loader2 className="animate-spin" size={16} />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-[11px] text-subtle text-center py-8">Chưa có phiên chat nào. Bấm "Phiên mới" để bắt đầu.</p>
          ) : (
            (Object.entries(groupedSessions) as [string, AdChatSession[]][]).map(([label, list]) =>
              list.length === 0 ? null : (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-wider text-subtle font-semibold px-2 mb-1">{label}</p>
                  <div className="space-y-0.5">
                    {list.map(s => {
                      const active = s.id === activeId;
                      return (
                        <div
                          key={s.id}
                          className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                            active ? 'bg-brand/10 text-brand border border-brand/30' : 'hover:bg-raised text-muted hover:text-fg'
                          }`}
                          onClick={() => setActiveId(s.id)}
                        >
                          <MessageSquare size={12} className="shrink-0" />
                          <span className="text-xs truncate flex-1">{s.title || 'Untitled'}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                            className="opacity-0 group-hover:opacity-100 hover:text-danger shrink-0"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </aside>

      {/* ────────── Main chat */}
      <main className="bg-surface border border-line rounded-lg flex flex-col overflow-hidden">
        <header className="px-4 py-2.5 border-b border-line flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bot size={16} className="text-brand shrink-0" />
            <h3 className="text-sm font-semibold text-fg truncate">
              {activeSession?.title || (messages.length > 0 ? 'Loading...' : 'Bắt đầu phiên mới')}
            </h3>
            {activeSession?.systemPrompt && (
              <span title="System prompt riêng" className="text-[9px] bg-raised text-fg border border-line px-1.5 py-0.5 rounded">custom</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ModelPicker
              models={models}
              value={modelId}
              onChange={(v) => { setModelId(v); setStoredModel(activeId, v); }}
            />
            <button
              onClick={() => setShowSettings(true)}
              className="text-muted hover:text-fg p-1.5 rounded-md hover:bg-raised"
              title="Settings system prompt + temperature"
            >
              <SettingsIcon size={14} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !busy && (
            <EmptyState
              onPickBanner={() => setShowBannerPicker(true)}
              onPickPrompt={handlePickPrompt}
            />
          )}
          {(() => {
            // Accumulate the most recent user message's attached banner IDs so
            // that an assistant message's COPY_SUGGEST block knows which
            // banner to attach when the user clicks "Apply to creative".
            let runningBannerIds: string[] = [];
            return messages.map(m => {
              if (m.role === 'user' && m.attachedBannerIds && m.attachedBannerIds.length > 0) {
                runningBannerIds = m.attachedBannerIds;
              }
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  contextBannerIds={runningBannerIds}
                  banners={banners}
                  onApplySuggestion={onApplySuggestion
                    ? (s, bIds) => onApplySuggestion(s, bIds, pins)
                    : undefined}
                />
              );
            });
          })()}
        </div>

        {/* Error toast inline */}
        {error && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg status-danger border text-sm flex items-center gap-2">
            <AlertCircle size={14} />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Toolbar — attached preview */}
        {(pendingBanners.length > 0 || pendingUploadUrls.length > 0) && (
          <div className="px-4 py-2 border-t border-line bg-canvas/50 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-subtle">Đính kèm:</span>
            {pendingBanners.map(b => (
              <div key={b.id} className="relative group">
                <img src={proxiedBannerUrl(b.imageUrl)} alt="" className="w-12 h-12 object-cover rounded border border-line" />
                <button
                  onClick={() => setPendingBanners(prev => prev.filter(x => x.id !== b.id))}
                  className="absolute -top-1 -right-1 bg-danger-fg text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100" style={{ background: 'var(--danger-fg)' }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {pendingUploadUrls.map(url => (
              <div key={url} className="relative group">
                <img src={url} alt="" className="w-12 h-12 object-cover rounded border border-line" />
                <button
                  onClick={() => setPendingUploadUrls(prev => prev.filter(x => x !== url))}
                  className="absolute -top-1 -right-1 bg-danger-fg text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100" style={{ background: 'var(--danger-fg)' }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Active brand pill — always visible if user attached a brand */}
        {activeBrand && (
          <div className="px-4 py-1.5 border-t border-line flex items-center gap-2 text-sm" style={{ background: 'var(--brand-soft)' }}>
            <Palette size={14} className="text-brand" />
            <span className="font-medium" style={{ color: 'var(--brand-text)' }}>Brand:</span>
            <span className="text-fg font-medium truncate">{activeBrand.name}</span>
            <button
              onClick={() => { setActiveBrand(null); setStoredBrand(activeId, null); }}
              className="ml-auto text-muted hover:text-fg p-0.5 rounded"
              title="Bỏ brand khỏi ngữ cảnh"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {/* Pinned destination (Campaign + AdSet) — passed as default to Tạo Creative */}
        <div className="px-4 py-1.5 border-t border-line bg-surface flex items-center gap-2 text-sm">
          <Layers size={14} className="text-muted" />
          <span className="text-muted shrink-0">Đích đến:</span>
          {pins.campaignId || pins.adsetId ? (
            <>
              {pins.campaignId && (
                <span className="bg-canvas text-fg border border-line px-2 py-0.5 rounded-md text-xs font-medium truncate max-w-[200px]">
                  {campaigns.find(c => c.id === pins.campaignId)?.name || '? campaign'}
                </span>
              )}
              {pins.adsetId && (
                <span className="bg-canvas text-fg border border-line px-2 py-0.5 rounded-md text-xs font-medium truncate max-w-[180px] flex items-center gap-1">
                  <Target size={11} /> {adSets.find(a => a.id === pins.adsetId)?.name || '? adset'}
                </span>
              )}
              <button
                onClick={() => setShowPinsPicker(true)}
                className="ml-auto text-muted hover:text-fg text-xs px-2 py-0.5 rounded hover:bg-raised"
                title="Đổi"
              >
                Đổi
              </button>
              <button
                onClick={() => updatePins({})}
                className="text-muted hover:text-fg p-0.5 rounded"
                title="Bỏ pin"
              >
                <X size={11} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowPinsPicker(true)}
              className="text-muted hover:text-fg text-xs px-2 py-0.5 rounded hover:bg-raised"
              title="Pin campaign/adset để Tạo Creative tự điền"
            >
              + Chọn Campaign / Ad Set
            </button>
          )}
        </div>

        {/* Collapsible tools row */}
        {toolsCollapsed ? (
          <button
            onClick={() => setToolsCollapsed(false)}
            className="px-4 py-1.5 border-t border-line flex items-center gap-2 text-xs text-muted hover:text-fg hover:bg-raised/30 transition-colors"
            title="Mở rộng toolbar"
          >
            <ChevronUp size={12} />
            <span>Mở rộng tools</span>
            <span className="ml-auto text-[10px] text-subtle">
              {pendingBanners.length > 0 && `${pendingBanners.length} banner attached · `}
              Gợi ý, đính kèm…
            </span>
          </button>
        ) : (
          <>
            {/* Toolbar buttons */}
            <div className="px-4 py-2 border-t border-line flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setShowBannerPicker(true)}
                className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-raised hover:bg-raised-2 text-fg border border-line"
                title="Pick banner từ History (AI sẽ vision)"
              >
                <ImageIcon size={12} /> Banner ({pendingBanners.length})
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-raised hover:bg-raised-2 text-fg border border-line"
              >
                <Paperclip size={12} /> Attach
              </button>
              <button
                onClick={handleClipboardClick}
                className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-raised hover:bg-raised-2 text-fg border border-line"
                title="Dán ảnh từ clipboard"
              >
                <Clipboard size={12} /> Dán
              </button>
              <button
                onClick={() => setShowBrandPicker(true)}
                className={`text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                  activeBrand
                    ? 'bg-canvas text-brand border-brand/40'
                    : 'bg-canvas hover:bg-raised text-fg border-line-strong'
                }`}
                title="Nạp Brand info + product + style vào ngữ cảnh chat"
              >
                <Palette size={14} /> Brand{activeBrand ? ` · ${activeBrand.name.slice(0, 16)}` : ''}
              </button>
              {uploadingFile && <Loader2 size={12} className="animate-spin text-muted ml-1" />}

              <button
                onClick={() => setToolsCollapsed(true)}
                className="ml-auto text-muted hover:text-fg p-1 rounded"
                title="Thu gọn toolbar"
              >
                <ChevronDown size={12} />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {/* Quick prompts row */}
            <QuickPrompts onPick={handlePickPrompt} />
          </>
        )}

        {/* Input bar */}
        <ChatInput
          ref={inputRef}
          busy={busy}
          onSend={handleSend}
          onStop={stopStream}
          onPaste={handlePasteOnInput}
        />
      </main>

      {/* Banner picker modal */}
      {showBannerPicker && (
        <BannerPickerModal
          selectedIds={pendingBanners.map(b => b.id)}
          onClose={() => setShowBannerPicker(false)}
          onConfirm={(list) => { setPendingBanners(list); setShowBannerPicker(false); }}
        />
      )}

      {/* Brand picker modal */}
      {showBrandPicker && (
        <BrandPickerModal
          selectedId={activeBrand?.id}
          onClose={() => setShowBrandPicker(false)}
          onConfirm={(project) => {
            const val = { id: project.id, ctx: buildBrandContext(project), name: project.name };
            setActiveBrand(val);
            if (activeId) setStoredBrand(activeId, val);
            setShowBrandPicker(false);
          }}
        />
      )}

      {/* Pins picker modal */}
      {showPinsPicker && (
        <PinsPickerModal
          campaigns={campaigns}
          adSets={adSets}
          current={pins}
          onClose={() => setShowPinsPicker(false)}
          onConfirm={(p) => { updatePins(p); setShowPinsPicker(false); }}
        />
      )}

      {/* Settings */}
      {showSettings && (
        <ChatSettingsModal
          session={activeSession}
          temperature={temperature}
          onChangeTemp={(t) => { setTemperature(t); setStoredTemp(t); }}
          onChangeSessionPrompt={async (val) => {
            if (!activeSession) return;
            await updateChatSession(activeSession.id, { systemPrompt: val });
            setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, systemPrompt: val } : s));
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

// ────────────── Setup guide

const CHAT_SQL = `CREATE TABLE ad_chat_sessions (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title text,
  system_prompt text,
  attached_banner_ids text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE ad_chat_messages (
  id text PRIMARY KEY,
  session_id text REFERENCES ad_chat_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
  content jsonb NOT NULL,
  attached_banner_ids text[],
  usage jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON ad_chat_messages (session_id, created_at);
CREATE INDEX ON ad_chat_sessions (user_id, updated_at DESC);

ALTER TABLE ad_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sessions" ON ad_chat_sessions FOR ALL
  USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY "own messages" ON ad_chat_messages FOR ALL
  USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);`;

const ChatSetupGuide: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CHAT_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="bg-surface border border-line rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="status-warning border p-2.5 rounded-lg">
            <AlertCircle size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-fg">Cần chạy SQL trước</h2>
            <p className="text-sm text-muted">File SQL ở <code className="bg-canvas text-fg px-1.5 py-0.5 rounded font-mono">db/setup.sql</code>. Studio Chat dùng <code className="bg-canvas text-fg px-1 rounded font-mono">ad_chat_sessions</code> + <code className="bg-canvas text-fg px-1 rounded font-mono">ad_chat_messages</code>.</p>
          </div>
        </div>
        <ol className="text-xs text-muted space-y-2 mb-4 list-decimal list-inside">
          <li>Vào Supabase Dashboard → <b className="text-fg">SQL Editor</b> → <b className="text-fg">New query</b></li>
          <li>Paste block SQL bên dưới (đã copy bằng nút bên cạnh)</li>
          <li>Bấm <b className="text-fg">Run</b> → đợi 1 giây</li>
          <li>Quay lại đây → reload page (F5)</li>
        </ol>
        <div className="bg-canvas border border-line rounded-md overflow-hidden">
          <div className="px-3 py-1.5 border-b border-line flex items-center justify-between bg-surface/60">
            <span className="text-[11px] font-mono text-subtle">setup.sql</span>
            <button
              onClick={copy}
              className="text-xs bg-brand hover:bg-brand-dark text-white px-2.5 py-1 rounded flex items-center gap-1 shadow-pop"
            >
              {copied ? '✓ Đã copy' : <><Clipboard size={11} /> Copy</>}
            </button>
          </div>
          <pre className="text-[10px] font-mono text-fg/80 p-3 overflow-x-auto max-h-[400px] whitespace-pre">
{CHAT_SQL}
          </pre>
        </div>
      </div>
    </div>
  );
};

// ────────────── Quick prompts

export const QUICK_PROMPTS: { label: string; emoji: string; text: string }[] = [
  {
    emoji: '✍️',
    label: 'Viết primary text dài thuyết phục',
    text: 'Viết primary text dài 200-400 ký tự cho banner đính kèm. Hook 100 chars đầu cần đủ kích thích click "Xem thêm". Theo công thức PAS (Problem-Agitate-Solution).',
  },
  {
    emoji: '🎯',
    label: 'Đề xuất audience',
    text: 'Phân tích banner đính kèm + đề xuất audience targeting cụ thể (tuổi, giới tính, hành vi, sở thích) phù hợp với Facebook Ads VN.',
  },
  {
    emoji: '🔥',
    label: '5 headline A/B test',
    text: 'Đề xuất 5 headline khác nhau (≤40 ký tự) cho banner này theo 5 góc tâm lý: FOMO, social proof, curiosity, benefit, urgency. Mục đích để A/B test xem cái nào CTR cao nhất.',
  },
  {
    emoji: '📐',
    label: 'Đề xuất phiên bản full FB ad',
    text: 'Đề xuất full bộ copy (primary text dài + headline + description + CTA + audience + tags) sẵn sàng push lên Facebook Ads.',
  },
  {
    emoji: '🧐',
    label: 'Phân tích banner & gợi ý cải thiện',
    text: 'Phân tích banner đính kèm: điểm mạnh, điểm yếu, có visual hook không, layout có rõ value prop không. Đề xuất 3 hướng cải thiện nếu cần.',
  },
  {
    emoji: '🎬',
    label: 'Brainstorm 3 concept banner mới',
    text: 'Brainstorm 3 concept banner khác cho cùng product/campaign (mô tả prompt cho banner generation: composition, style, mood, text overlay).',
  },
];

const QuickPrompts: React.FC<{ onPick: (text: string) => void }> = ({ onPick }) => (
  <div className="px-3 py-2 border-t border-line bg-canvas/30">
    <p className="text-[10px] uppercase tracking-wider text-subtle font-mono mb-1.5">Gợi ý nhanh</p>
    <div className="flex gap-1.5 flex-wrap">
      {QUICK_PROMPTS.map((q, i) => (
        <button
          key={i}
          onClick={() => onPick(q.text)}
          className="text-[11px] flex items-center gap-1 bg-surface hover:bg-raised border border-line hover:border-brand/40 text-fg px-2 py-1 rounded-md transition-colors"
          title={q.text}
        >
          <span>{q.emoji}</span> {q.label}
        </button>
      ))}
    </div>
  </div>
);

// ────────────── Empty State

const EmptyState: React.FC<{ onPickBanner: () => void; onPickPrompt: (text: string) => void }> = ({ onPickBanner, onPickPrompt }) => (
  <div className="text-center py-8 text-muted">
    <div className="bg-brand/10 text-brand w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 border border-brand/30">
      <Sparkles size={20} />
    </div>
    <h3 className="text-sm font-semibold text-fg mb-1">Brainstorm ads bằng AI</h3>
    <p className="text-xs leading-relaxed max-w-md mx-auto mb-4">
      Hỏi AI viết headline / primary text dài / mô tả audience cho banner của bạn.
      Đính banner từ History để AI vision đọc và đề xuất content phù hợp visual.
    </p>
    <button
      onClick={onPickBanner}
      className="text-xs bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-md inline-flex items-center gap-1.5 shadow-pop mb-5"
    >
      <ImageIcon size={12} /> Chọn banner để bắt đầu
    </button>

    <div className="max-w-md mx-auto text-left">
      <p className="text-[10px] uppercase tracking-wider text-subtle font-mono mb-2">Hoặc bắt đầu bằng một câu hỏi mẫu</p>
      <div className="space-y-1.5">
        {QUICK_PROMPTS.slice(0, 4).map((q, i) => (
          <button
            key={i}
            onClick={() => onPickPrompt(q.text)}
            className="w-full text-left text-xs flex items-start gap-2 bg-surface hover:bg-raised border border-line hover:border-brand/40 text-fg px-3 py-2 rounded-md transition-colors"
          >
            <span className="text-base shrink-0">{q.emoji}</span>
            <span className="flex-1">{q.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

// ────────────── Message Bubble

const MessageBubble: React.FC<{
  message: UIMessage;
  /** Banner IDs from the most recent prior user message — used when this is
   *  an assistant message rendering a COPY_SUGGEST card. */
  contextBannerIds: string[];
  banners: HistoryItem[];
  onApplySuggestion?: Props['onApplySuggestion'];
}> = ({ message, contextBannerIds, banners, onApplySuggestion }) => {
  const isUser = message.role === 'user';
  const fullText = message.content
    .filter(p => p.type === 'text')
    .map(p => (p as any).text)
    .join('\n');
  const imageUrls = message.content
    .filter(p => p.type === 'image_url')
    .map(p => (p as any).image_url.url);

  const { suggestions, cleanText } = useMemo(() => {
    if (message.role !== 'assistant') return { suggestions: [], cleanText: fullText };
    return parseCopySuggestions(fullText);
  }, [fullText, message.role]);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
        isUser ? 'bg-brand text-white' : 'bg-raised text-fg border border-line'
      }`}>
        {isUser ? <UserIcon size={16} /> : <Bot size={16} />}
      </div>

      <div className={`flex-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
        {imageUrls.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {imageUrls.map((url, i) => (
              <img key={i} src={url} alt="" className="w-20 h-20 object-cover rounded border border-line" />
            ))}
          </div>
        )}

        {cleanText && (
          <div className={`px-3 py-2 rounded-lg text-sm break-words ${
            isUser
              ? 'bg-brand text-white whitespace-pre-wrap'
              : 'bg-raised text-fg border border-line'
          }`}>
            {isUser ? cleanText : renderMarkdownLite(cleanText)}
            {message.streaming && (
              <span className="inline-block w-1.5 h-3 bg-current ml-0.5 animate-pulse" />
            )}
          </div>
        )}

        {suggestions.map((s, i) => (
          <CopySuggestCard
            key={i}
            suggestion={s}
            bannerIds={message.attachedBannerIds && message.attachedBannerIds.length > 0
              ? message.attachedBannerIds
              : contextBannerIds}
            banners={banners}
            onApply={onApplySuggestion}
          />
        ))}

        {message.usage && !isUser && (
          <div className="text-[10px] text-subtle font-mono">
            {message.usage.prompt_tokens} → {message.usage.completion_tokens} tokens
          </div>
        )}
      </div>
    </div>
  );
};

// ────────────── Copy Suggest Card

const CopySuggestCard: React.FC<{
  suggestion: AdCopySuggestion;
  bannerIds: string[];
  banners: HistoryItem[];
  onApply?: Props['onApplySuggestion'];
}> = ({ suggestion, bannerIds, banners, onApply }) => {
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);

  const handle = async () => {
    if (!onApply) return;
    setApplying(true);
    try {
      await onApply(suggestion, bannerIds);
      setDone(true);
    } catch (e: any) {
      alert(`Apply lỗi: ${e?.message}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="bg-surface border border-brand/40 rounded-xl p-4 w-full space-y-2.5">
      <div className="flex items-center gap-1.5 text-brand text-sm font-semibold">
        <Sparkles size={14} /> AI đề xuất copy
      </div>

      <div className="space-y-2 text-sm">
        {suggestion.primary_text && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-muted text-xs uppercase tracking-wider font-mono">
                Primary text (FB body)
              </span>
              <span className={`text-xs font-mono ${
                suggestion.primary_text.length > 125
                  ? 'text-success'
                  : 'text-warning'
              }`}>
                {suggestion.primary_text.length} chars
                {suggestion.primary_text.length > 125 && ' · gấp ở 125'}
              </span>
            </div>
            <div className="bg-canvas border border-line rounded-lg p-3 text-fg whitespace-pre-wrap leading-relaxed">
              {suggestion.primary_text}
            </div>
          </div>
        )}
        {suggestion.headline && (
          <Row label="Headline">{suggestion.headline} <span className="text-subtle text-[10px]">({suggestion.headline.length}/40)</span></Row>
        )}
        {suggestion.description && (
          <Row label="Description">{suggestion.description} <span className="text-subtle text-[10px]">({suggestion.description.length}/30)</span></Row>
        )}
        {suggestion.cta && (
          <Row label="CTA"><span className="font-mono bg-brand/15 text-brand px-1.5 py-0.5 rounded text-[10px]">{suggestion.cta}</span></Row>
        )}
        {suggestion.audience && (
          <Row label="Audience">{suggestion.audience}</Row>
        )}
        {suggestion.tags && suggestion.tags.length > 0 && (
          <Row label="Tags">
            <div className="flex gap-1 flex-wrap">
              {suggestion.tags.map(t => (
                <span key={t} className="bg-raised border border-line text-muted text-[10px] px-1.5 py-0.5 rounded">#{t}</span>
              ))}
            </div>
          </Row>
        )}
      </div>

      <button
        onClick={handle}
        disabled={applying || done}
        className={`w-full text-sm py-2.5 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
          done
            ? 'status-success border cursor-default'
            : 'bg-brand hover:bg-brand-dark text-white'
        }`}
      >
        {applying ? <Loader2 size={14} className="animate-spin" />
          : done ? <>✓ Đã mở Tạo Creative</>
          : <><Wand2 size={14} /> Tạo Creative</>}
      </button>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start gap-2">
    <span className="text-subtle text-[10px] uppercase tracking-wider font-mono shrink-0 w-20 pt-0.5">{label}</span>
    <div className="flex-1 text-fg">{children}</div>
  </div>
);

// ────────────── Chat Input

export interface ChatInputHandle {
  setText: (t: string) => void;
  focus: () => void;
}

interface ChatInputProps {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
}

const ChatInput = React.forwardRef<ChatInputHandle, ChatInputProps>((
  { busy, onSend, onStop, onPaste },
  forwardedRef,
) => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    if (busy) return;
    if (!value.trim()) return;
    onSend(value);
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Critical: skip Enter while IME composition is active.
    // Vietnamese/CJK input uses Enter to commit composed characters — pressing Enter
    // during composition would cut off the user's text (e.g. "giúp tôi" -> "tôi").
    // nativeEvent.isComposing = true means IME is mid-compose.
    // keyCode 229 is the legacy signal for IME composition.
    const ime = (e.nativeEvent as any).isComposing || e.keyCode === 229;
    if (ime) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  React.useImperativeHandle(forwardedRef, () => ({
    setText: (t: string) => {
      setValue(t);
      // Defer resize until next tick after state applies
      setTimeout(() => { if (ref.current) autoResize(ref.current); }, 0);
    },
    focus: () => ref.current?.focus(),
  }));

  return (
    <div className="p-3 border-t border-line flex items-end gap-2 bg-canvas/30">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => { setValue(e.target.value); autoResize(e.target); }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder="Nhập tin nhắn... (Enter gửi · Shift+Enter xuống dòng)"
        rows={1}
        className="flex-1 bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none min-h-[40px] max-h-[200px]"
      />
      {busy ? (
        <button
          onClick={onStop}
          className="text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm font-medium"
          style={{ background: 'var(--danger-fg)' }}
        >
          <X size={14} /> Stop
        </button>
      ) : (
        <button
          onClick={send}
          disabled={!value.trim()}
          className="bg-brand hover:bg-brand-dark disabled:bg-raised disabled:text-subtle text-white p-2.5 rounded-lg transition-colors"
          title="Gửi (Enter)"
        >
          <Send size={14} />
        </button>
      )}
    </div>
  );
});
ChatInput.displayName = 'ChatInput';

// ────────────── Settings Modal

const ChatSettingsModal: React.FC<{
  session?: AdChatSession;
  temperature: number;
  onChangeTemp: (t: number) => void;
  onChangeSessionPrompt: (val: string) => Promise<void>;
  onClose: () => void;
}> = ({ session, temperature, onChangeTemp, onChangeSessionPrompt, onClose }) => {
  const [tab, setTab] = useState<'global' | 'session'>('global');
  const [globalPrompt, setGlobalPromptLocal] = useState(getGlobalSystemPrompt());
  const [sessionPrompt, setSessionPromptLocal] = useState(session?.systemPrompt || '');
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingSession, setSavingSession] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface">
          <div className="flex items-center gap-3">
            <div className="bg-brand text-white p-2 rounded-lg">
              <SettingsIcon size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-fg">Chat Settings</h3>
              <p className="text-sm text-muted">System prompt · Temperature · Coachio LLM</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={16} />
          </button>
        </header>

        <div className="border-b border-line bg-surface/30 px-5">
          <div className="flex gap-1">
            {(['global', 'session'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                disabled={t === 'session' && !session}
                className={`text-xs px-3 py-2 border-b-2 transition-colors disabled:opacity-40 ${
                  tab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {t === 'global' ? 'Mặc định (global)' : 'Phiên hiện tại'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'global' ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted block mb-1">System Prompt mặc định</label>
                <p className="text-[11px] text-subtle mb-2">Dùng cho mọi phiên không có prompt riêng. Lưu vào localStorage trên máy này.</p>
                <textarea
                  value={globalPrompt}
                  onChange={(e) => setGlobalPromptLocal(e.target.value)}
                  className="w-full bg-canvas border border-line rounded-md p-3 text-xs font-mono focus:outline-none focus:border-brand resize-y min-h-[200px]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setGlobalPromptLocal(DEFAULT_SYSTEM_PROMPT); }}
                  className="text-xs px-3 py-1.5 rounded-md bg-raised hover:bg-raised-2 text-fg"
                >
                  Reset về mặc định
                </button>
                <button
                  disabled={savingGlobal}
                  onClick={() => {
                    setSavingGlobal(true);
                    setGlobalSystemPrompt(globalPrompt);
                    setTimeout(() => setSavingGlobal(false), 300);
                  }}
                  className="text-xs px-4 py-1.5 rounded-md bg-brand hover:bg-brand-dark text-white font-medium"
                >
                  {savingGlobal ? 'Lưu...' : 'Lưu'}
                </button>
              </div>
            </>
          ) : session ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted block mb-1">
                  System Prompt phiên này (override)
                </label>
                <p className="text-[11px] text-subtle mb-2">
                  Trống = dùng global. Có giá trị = chỉ phiên này áp dụng prompt riêng.
                </p>
                <textarea
                  value={sessionPrompt}
                  onChange={(e) => setSessionPromptLocal(e.target.value)}
                  placeholder="Để trống = kế thừa global..."
                  className="w-full bg-canvas border border-line rounded-md p-3 text-xs font-mono focus:outline-none focus:border-brand resize-y min-h-[200px]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={async () => {
                    setSavingSession(true);
                    await onChangeSessionPrompt('').catch(() => {});
                    setSessionPromptLocal('');
                    setSavingSession(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-raised hover:bg-raised-2 text-fg"
                >
                  Bỏ override
                </button>
                <button
                  disabled={savingSession}
                  onClick={async () => {
                    setSavingSession(true);
                    await onChangeSessionPrompt(sessionPrompt).catch(() => {});
                    setSavingSession(false);
                  }}
                  className="text-xs px-4 py-1.5 rounded-md bg-brand hover:bg-brand-dark text-white font-medium"
                >
                  {savingSession ? 'Lưu...' : 'Lưu'}
                </button>
              </div>
            </>
          ) : null}

          <hr className="border-line" />

          <div>
            <label className="text-xs font-medium text-muted block mb-1">
              Temperature: <span className="font-mono text-fg">{temperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => onChangeTemp(Number(e.target.value))}
              className="w-full accent-brand"
            />
            <div className="flex justify-between text-[10px] text-subtle mt-1">
              <span>0 (deterministic)</span>
              <span>1 (creative)</span>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-md p-3 text-[11px] text-subtle space-y-1">
            <p><b>Model:</b> đặt ở header chat — chọn riêng cho từng phiên</p>
            <p><b>Backend:</b> Coachio LLM (X-API-Key)</p>
            <p><b>Multimodal:</b> tuỳ model — text + image bắt buộc cho banner vision</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ────────────── Model picker (header dropdown) ──────────────

const ModelPicker: React.FC<{
  models: CoachioModel[];
  value: string;
  onChange: (id: string) => void;
}> = ({ models, value, onChange }) => {
  if (models.length === 0) {
    return (
      <span className="text-[10px] text-subtle font-mono">{value.split('/')[1] || value}</span>
    );
  }
  // Group models by provider for nicer ordering
  const grouped: Record<string, CoachioModel[]> = {};
  for (const m of models) {
    const p = providerLabel(m.id);
    (grouped[p] ||= []).push(m);
  }
  const providers = Object.keys(grouped).sort();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Chọn model LLM cho phiên này"
      className="text-[11px] bg-canvas border border-line rounded-md px-2 py-1 text-fg font-mono focus:outline-none focus:border-brand max-w-[180px]"
    >
      {providers.map(p => (
        <optgroup key={p} label={p}>
          {grouped[p].map(m => (
            <option key={m.id} value={m.id}>
              {m.displayName.replace(/^[^:]+:\s*/, '')}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

// ────────────── Pins picker (campaign + adset) ──────────────

const PinsPickerModal: React.FC<{
  campaigns: import('../../types').AdCampaign[];
  adSets: import('../../types').AdSet[];
  current: SessionPins;
  onClose: () => void;
  onConfirm: (p: SessionPins) => void;
}> = ({ campaigns, adSets, current, onClose, onConfirm }) => {
  const [campaignId, setCampaignId] = useState<string | undefined>(current.campaignId);
  const [adsetId, setAdsetId] = useState<string | undefined>(current.adsetId);

  const adSetsForCampaign = campaignId
    ? adSets.filter(a => a.campaignId === campaignId)
    : [];

  useEffect(() => {
    if (adsetId && !adSetsForCampaign.find(a => a.id === adsetId)) {
      setAdsetId(undefined);
    }
  }, [campaignId]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface">
          <div className="flex items-center gap-3">
            <div className="bg-brand text-white p-2 rounded-lg">
              <Layers size={16} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-fg">Đích đến cho phiên này</h3>
              <p className="text-sm text-muted">Campaign + Ad Set sẽ tự điền khi Tạo Creative.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-raised text-muted hover:text-fg">
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Campaign</label>
            <select
              value={campaignId || ''}
              onChange={(e) => setCampaignId(e.target.value || undefined)}
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              <option value="">— Không pin campaign —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {campaignId && (
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Ad Set</label>
              <select
                value={adsetId || ''}
                onChange={(e) => setAdsetId(e.target.value || undefined)}
                disabled={adSetsForCampaign.length === 0}
                className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand disabled:opacity-50"
              >
                <option value="">— {adSetsForCampaign.length === 0 ? 'Campaign này chưa có ad set' : 'Không pin ad set'} —</option>
                {adSetsForCampaign.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {adSetsForCampaign.length === 0 && (
                <p className="text-xs text-muted mt-1">Tạo Ad Set ở tab Campaigns, hoặc bấm "Mới" trong dialog Tạo Creative.</p>
              )}
            </div>
          )}

          <p className="text-xs text-muted leading-relaxed">
            💡 Khi bấm <b className="text-fg">Tạo Creative</b> từ AI suggest, modal sẽ tự chọn pin này.
            Vẫn đổi được trong modal.
          </p>
        </div>

        <footer className="px-5 py-3 border-t border-line bg-surface flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-muted hover:text-fg hover:bg-raised">
            Huỷ
          </button>
          <button
            onClick={() => onConfirm({ campaignId, adsetId })}
            className="text-sm px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-medium"
          >
            Lưu pin
          </button>
        </footer>
      </div>
    </div>
  );
};
