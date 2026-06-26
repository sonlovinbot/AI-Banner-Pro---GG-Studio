import React, { useEffect, useState } from 'react';
import {
  Megaphone, Wand2, Layers, Send, BarChart3, Plus, Loader2, Copy, Trash2,
  Edit3, Tag, Filter, Search, X, ChevronDown,
} from 'lucide-react';
import { AppPage, AdCreative, AdCreativeStatus, AdCampaign, HistoryItem } from '../types';
import {
  listCreativesFromCloud,
  saveCreativeToCloud,
  deleteCreativeFromCloud,
  cloneCreativeInCloud,
} from '../services/adCreativeService';
import {
  listCampaignsFromCloud,
  saveCampaignToCloud,
  newCampaignDraft,
} from '../services/adCampaignService';
import { listHistoryFromCloud } from '../services/historyService';
import { proxiedBannerUrl } from '../services/cdnProxy';

type AdsTab = 'studio' | 'library' | 'queue' | 'analytics';

interface Props {
  onNavigate: (page: AppPage) => void;
}

const TAB_DEFS: { id: AdsTab; label: string; icon: React.ReactNode; accent: string }[] = [
  { id: 'studio',    label: 'Studio',    icon: <Wand2 size={14} />,    accent: 'text-brand' },
  { id: 'library',   label: 'Library',   icon: <Layers size={14} />,   accent: 'text-amber-400' },
  { id: 'queue',     label: 'Queue',     icon: <Send size={14} />,     accent: 'text-cyan-400' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={14} />, accent: 'text-emerald-400' },
];

const STATUS_PALETTE: Record<AdCreativeStatus, string> = {
  draft:    'bg-gray-500/15 text-muted border-line',
  ready:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  pushing:  'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  pushed:   'bg-sky-500/15 text-sky-300 border-sky-500/30',
  paused:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
  failed:   'bg-red-500/15 text-red-300 border-red-500/30',
  archived: 'bg-gray-500/15 text-subtle border-line',
};

export const AdsManagerPage: React.FC<Props> = ({ onNavigate }) => {
  const [tab, setTab] = useState<AdsTab>('library');
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [banners, setBanners] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdCreative | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<AdCreativeStatus | 'all'>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const refresh = async () => {
    setLoading(true);
    const [c, ca, h] = await Promise.all([
      listCreativesFromCloud(),
      listCampaignsFromCloud(),
      listHistoryFromCloud(),
    ]);
    setCreatives(c);
    setCampaigns(ca);
    setBanners(h);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const filtered = creatives.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (campaignFilter !== 'all' && c.campaignId !== campaignFilter) return false;
    if (tagFilter && !c.tags.includes(tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${c.name || ''} ${c.headline || ''} ${c.primaryText || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const allTags = Array.from(new Set(creatives.flatMap(c => c.tags))).sort();

  const handleClone = async (c: AdCreative) => {
    try {
      await cloneCreativeInCloud(c);
      await refresh();
    } catch (e: any) {
      alert(`Clone lỗi: ${e?.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xoá creative này?')) return;
    try {
      await deleteCreativeFromCloud(id);
      await refresh();
    } catch (e: any) {
      alert(`Xoá lỗi: ${e?.message}`);
    }
  };

  const handleSaveEdit = async (c: AdCreative) => {
    try {
      await saveCreativeToCloud(c);
      setEditing(null);
      await refresh();
    } catch (e: any) {
      alert(`Lưu lỗi: ${e?.message}`);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-canvas text-fg">
      {/* Tabs */}
      <div className="border-b border-line bg-surface/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-1 overflow-x-auto">
          {TAB_DEFS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? `bg-raised text-fg ${t.accent}`
                    : 'text-muted hover:text-fg hover:bg-raised'
                }`}
              >
                <span className={active ? t.accent : ''}>{t.icon}</span>
                {t.label}
                {t.id === 'library' && <span className="text-[10px] font-mono text-subtle">({creatives.length})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'library' && (
          <LibraryTab
            creatives={filtered}
            allTags={allTags}
            campaigns={campaigns}
            banners={banners}
            loading={loading}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            campaignFilter={campaignFilter} setCampaignFilter={setCampaignFilter}
            tagFilter={tagFilter} setTagFilter={setTagFilter}
            search={search} setSearch={setSearch}
            onEdit={setEditing}
            onClone={handleClone}
            onDelete={handleDelete}
            onRefresh={refresh}
            onNavigate={onNavigate}
          />
        )}

        {tab === 'studio' && (
          <PlaceholderTab
            icon={<Wand2 size={48} className="text-brand" />}
            title="Studio (Sprint 2)"
            description="Brainstorm: nhập brief sản phẩm + audience + mục tiêu → AI sinh 5 headline + 3 angle + 4 banner concept. Click concept → pre-fill Banner Tool."
          />
        )}

        {tab === 'queue' && (
          <PlaceholderTab
            icon={<Send size={48} className="text-cyan-400" />}
            title="Queue (Sprint 4)"
            description="Ready / Pushing / Pushed / Failed. Agent dùng MCP push lên Meta qua Pipeboard."
            stats={[
              { label: 'Ready', value: creatives.filter(c => c.status === 'ready').length, color: 'text-emerald-300' },
              { label: 'Pushed', value: creatives.filter(c => c.status === 'pushed').length, color: 'text-sky-300' },
              { label: 'Failed', value: creatives.filter(c => c.status === 'failed').length, color: 'text-red-300' },
            ]}
          />
        )}

        {tab === 'analytics' && (
          <PlaceholderTab
            icon={<BarChart3 size={48} className="text-emerald-400" />}
            title="Analytics (Sprint 6)"
            description="CTR / CPC / ROAS đọc từ Meta qua MCP. Winner picker auto chọn top 20% perf."
          />
        )}
      </div>

      {editing && (
        <CreativeEditor
          creative={editing}
          campaigns={campaigns}
          banners={banners}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
          onNewCampaign={async (name) => {
            const c = newCampaignDraft(name);
            await saveCampaignToCloud(c);
            await refresh();
            return c;
          }}
        />
      )}
    </div>
  );
};

// ──────────────────────────── Library Tab ────────────────────────────

interface LibraryTabProps {
  creatives: AdCreative[];
  allTags: string[];
  campaigns: AdCampaign[];
  banners: HistoryItem[];
  loading: boolean;
  statusFilter: AdCreativeStatus | 'all';
  setStatusFilter: (s: AdCreativeStatus | 'all') => void;
  campaignFilter: string;
  setCampaignFilter: (c: string) => void;
  tagFilter: string;
  setTagFilter: (t: string) => void;
  search: string;
  setSearch: (s: string) => void;
  onEdit: (c: AdCreative) => void;
  onClone: (c: AdCreative) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onNavigate: (p: AppPage) => void;
}

const LibraryTab: React.FC<LibraryTabProps> = ({
  creatives, allTags, campaigns, banners, loading,
  statusFilter, setStatusFilter, campaignFilter, setCampaignFilter,
  tagFilter, setTagFilter, search, setSearch,
  onEdit, onClone, onDelete, onNavigate,
}) => {
  const bannerById = (id?: string) => (id ? banners.find(b => b.id === id) : undefined);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-surface border border-line rounded-md px-3 py-1.5 flex-1 min-w-[200px]">
          <Search size={14} className="text-muted" />
          <input
            type="text"
            placeholder="Tìm theo tên / headline / primary text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted hover:text-fg">
              <X size={14} />
            </button>
          )}
        </div>

        <FilterPill label="Status" icon={<Filter size={12} />}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-transparent text-xs focus:outline-none cursor-pointer"
          >
            <option value="all">Tất cả</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="pushed">Pushed</option>
            <option value="paused">Paused</option>
            <option value="failed">Failed</option>
            <option value="archived">Archived</option>
          </select>
        </FilterPill>

        <FilterPill label="Campaign" icon={<Layers size={12} />}>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="bg-transparent text-xs focus:outline-none cursor-pointer"
          >
            <option value="all">Tất cả</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </FilterPill>

        {allTags.length > 0 && (
          <FilterPill label="Tag" icon={<Tag size={12} />}>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              <option value="">Tất cả</option>
              {allTags.map(t => (
                <option key={t} value={t}>#{t}</option>
              ))}
            </select>
          </FilterPill>
        )}

        <button
          onClick={() => onNavigate('history')}
          className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-pop"
          title="Mở History để dùng nút 'Send to Ads'"
        >
          <Plus size={14} /> Tạo từ Banner
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : creatives.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <Megaphone size={48} className="mx-auto mb-4 text-subtle" />
          <p className="text-sm mb-2">Chưa có creative nào.</p>
          <p className="text-xs text-subtle">
            Vào <button onClick={() => onNavigate('history')} className="text-brand underline">History</button> và bấm "Send to Ads" trên 1 banner.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {creatives.map(c => {
            const banner = bannerById(c.bannerId);
            const campaign = campaigns.find(cm => cm.id === c.campaignId);
            return (
              <div
                key={c.id}
                className="bg-surface border border-line hover:border-line-strong rounded-lg p-4 flex gap-4 transition-colors"
              >
                {/* Banner thumbnail */}
                <div className="w-24 h-24 shrink-0 bg-raised rounded overflow-hidden border border-line">
                  {banner ? (
                    <img src={proxiedBannerUrl(banner.imageUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-subtle text-[10px]">No banner</div>
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-fg truncate">{c.name || 'Untitled'}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_PALETTE[c.status]} shrink-0`}>
                      {c.status}
                    </span>
                  </div>

                  {c.headline && (
                    <p className="text-xs text-muted mb-1 line-clamp-1">
                      <span className="text-subtle">Headline:</span> {c.headline}
                    </p>
                  )}
                  {c.primaryText && (
                    <p className="text-[11px] text-subtle mb-2 line-clamp-1">{c.primaryText}</p>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.cta && c.cta !== 'NO_BUTTON' && (
                      <span className="text-[10px] bg-brand/10 text-brand border border-brand/30 px-1.5 py-0.5 rounded">
                        {c.cta}
                      </span>
                    )}
                    {campaign && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                        {campaign.name}
                      </span>
                    )}
                    {c.importedFromMeta && (
                      <span className="text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded" title={`Meta ad ${c.originalMetaAdId}`}>
                        📥 Meta
                      </span>
                    )}
                    {c.derivedFromCreativeId && (
                      <span className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded" title="Cloned from another creative">
                        🔀 derived
                      </span>
                    )}
                    {c.tags.map(t => (
                      <span key={t} className="text-[10px] bg-raised text-muted border border-line px-1.5 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => onEdit(c)}
                    className="text-xs bg-raised hover:bg-raised-2 text-fg px-3 py-1.5 rounded flex items-center gap-1 border border-line"
                  >
                    <Edit3 size={12} /> Edit
                  </button>
                  <button
                    onClick={() => onClone(c)}
                    className="text-xs bg-raised hover:bg-raised-2 text-fg px-3 py-1.5 rounded flex items-center gap-1 border border-line"
                  >
                    <Copy size={12} /> Clone
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded flex items-center gap-1 border border-red-500/30"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FilterPill: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div className="flex items-center gap-1.5 bg-surface border border-line rounded-md px-2 py-1.5 text-xs">
    <span className="text-muted">{icon}</span>
    <span className="text-subtle">{label}:</span>
    {children}
  </div>
);

// ──────────────────────────── Creative Editor ────────────────────────────

interface EditorProps {
  creative: AdCreative;
  campaigns: AdCampaign[];
  banners: HistoryItem[];
  onClose: () => void;
  onSave: (c: AdCreative) => void;
  onNewCampaign: (name: string) => Promise<AdCampaign>;
}

const CTA_OPTIONS = [
  'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'BUY_NOW', 'BOOK_TRAVEL', 'DOWNLOAD',
  'CONTACT_US', 'GET_QUOTE', 'MESSAGE_PAGE', 'SUBSCRIBE', 'WATCH_MORE',
  'GET_OFFER', 'INSTALL_MOBILE_APP', 'NO_BUTTON',
];

const CreativeEditor: React.FC<EditorProps> = ({ creative, campaigns, banners, onClose, onSave, onNewCampaign }) => {
  const [draft, setDraft] = useState<AdCreative>(creative);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const banner = banners.find(b => b.id === draft.bannerId);

  const update = <K extends keyof AdCreative>(key: K, value: AdCreative[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!t || draft.tags.includes(t)) { setTagInput(''); return; }
    update('tags', [...draft.tags, t]);
    setTagInput('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/15 text-amber-300 p-2 rounded-md border border-amber-500/30">
              <Megaphone size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Edit Ad Creative</h3>
              <p className="text-[11px] text-subtle">{draft.id.slice(0, 8)} · {draft.source}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Banner preview */}
          {banner && (
            <div className="flex gap-3 p-3 bg-surface rounded-lg border border-line">
              <img src={proxiedBannerUrl(banner.imageUrl)} alt="" className="w-20 h-20 object-cover rounded border border-line" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-subtle">Banner</p>
                <p className="text-xs text-fg truncate">{banner.aspectRatio} · {banner.quality}</p>
                <p className="text-[11px] text-muted truncate">{banner.promptUsed?.slice(0, 80)}</p>
              </div>
            </div>
          )}

          <Field label="Tên creative">
            <input
              type="text"
              value={draft.name || ''}
              onChange={(e) => update('name', e.target.value)}
              placeholder="VD: Sale 8/3 — Lifestyle 1:1"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </Field>

          <Field label={`Primary text (${(draft.primaryText || '').length}/125)`}>
            <textarea
              value={draft.primaryText || ''}
              onChange={(e) => update('primaryText', e.target.value.slice(0, 125))}
              placeholder="Text trên cùng — hiển thị phía trên ảnh banner..."
              className="w-full bg-canvas border border-line rounded-md p-3 text-sm focus:outline-none focus:border-brand h-20 resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Headline (${(draft.headline || '').length}/40)`}>
              <input
                type="text"
                value={draft.headline || ''}
                onChange={(e) => update('headline', e.target.value.slice(0, 40))}
                placeholder="Tiêu đề"
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
              />
            </Field>
            <Field label={`Description (${(draft.description || '').length}/30)`}>
              <input
                type="text"
                value={draft.description || ''}
                onChange={(e) => update('description', e.target.value.slice(0, 30))}
                placeholder="Mô tả ngắn"
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="CTA">
              <select
                value={draft.cta || 'SHOP_NOW'}
                onChange={(e) => update('cta', e.target.value as any)}
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
              >
                {CTA_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Destination URL">
              <input
                type="url"
                value={draft.destinationUrl || ''}
                onChange={(e) => update('destinationUrl', e.target.value)}
                placeholder="https://..."
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
              />
            </Field>
          </div>

          <Field label="Audience (free-text v1)">
            <input
              type="text"
              value={draft.audienceRef?.name || ''}
              onChange={(e) => update('audienceRef', { ...(draft.audienceRef || {}), name: e.target.value })}
              placeholder="VD: Nữ 25-35 · HCM · Luxury · thu nhập trung-cao"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </Field>

          <Field label="Campaign">
            <div className="flex gap-2">
              <select
                value={draft.campaignId || ''}
                onChange={(e) => update('campaignId', e.target.value || undefined)}
                className="flex-1 bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
              >
                <option value="">— Chưa gán —</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="Tạo campaign mới..."
                className="bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand w-40"
              />
              <button
                onClick={async () => {
                  if (!newCampaignName.trim()) return;
                  setSavingCampaign(true);
                  try {
                    const c = await onNewCampaign(newCampaignName.trim());
                    update('campaignId', c.id);
                    setNewCampaignName('');
                  } finally { setSavingCampaign(false); }
                }}
                disabled={!newCampaignName.trim() || savingCampaign}
                className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded disabled:opacity-50"
              >
                {savingCampaign ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
              </button>
            </div>
          </Field>

          <Field label="Status">
            <div className="flex gap-2 flex-wrap">
              {(['draft', 'ready', 'paused', 'archived'] as AdCreativeStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => update('status', s)}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    draft.status === s
                      ? `${STATUS_PALETTE[s]}`
                      : 'bg-surface border-line text-muted hover:bg-raised'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Tags">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {draft.tags.map(t => (
                <span key={t} className="text-[11px] bg-raised text-muted border border-line px-2 py-0.5 rounded flex items-center gap-1">
                  #{t}
                  <button onClick={() => update('tags', draft.tags.filter(x => x !== t))} className="hover:text-red-400">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Nhập tag rồi Enter..."
                className="flex-1 bg-canvas border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-brand"
              />
              <button onClick={addTag} className="text-xs bg-raised hover:bg-raised-2 text-fg px-3 py-1.5 rounded border border-line">
                Add tag
              </button>
            </div>
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-surface/60">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-md bg-raised hover:bg-raised-2 text-fg">
            Huỷ
          </button>
          <button
            onClick={() => onSave(draft)}
            className="text-xs px-4 py-2 rounded-md bg-brand hover:bg-brand-dark text-white font-medium shadow-pop"
          >
            Lưu
          </button>
        </footer>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[11px] font-medium text-muted block mb-1">{label}</label>
    {children}
  </div>
);

// ──────────────────────────── Placeholder Tabs ────────────────────────────

const PlaceholderTab: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  stats?: { label: string; value: number; color: string }[];
}> = ({ icon, title, description, stats }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center max-w-xl mx-auto">
    <div className="mb-4 opacity-80">{icon}</div>
    <h2 className="text-lg font-bold text-fg mb-2">{title}</h2>
    <p className="text-sm text-muted leading-relaxed mb-6">{description}</p>
    {stats && stats.length > 0 && (
      <div className="grid grid-cols-3 gap-4 w-full">
        {stats.map(s => (
          <div key={s.label} className="bg-surface border border-line rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-subtle uppercase tracking-wider mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    )}
    <div className="mt-8 text-[11px] text-subtle font-mono">
      Sẽ ship ở sprint tiếp theo · không block flow hiện tại
    </div>
  </div>
);
