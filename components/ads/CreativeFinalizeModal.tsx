// Single-screen "finalize a creative" modal — entry point from Studio chat
// (or anywhere else that has a draft copy + banner). Handles picking the
// destination Campaign + AdSet (creating new on the fly), editing the copy,
// and saving the creative either as Draft or Ready.

import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Save, Loader2, Layers, Target, AlertCircle, Plus, Image as ImageIcon,
  CheckCircle, Sparkles, Edit3,
} from 'lucide-react';
import {
  AdCampaign, AdSet, AdCreative, AdCopySuggestion, AdCTA,
  AdCampaignObjective, HistoryItem,
} from '../../types';
import {
  saveCampaignToCloud, newCampaignDraft, OBJECTIVE_LABELS,
} from '../../services/adCampaignService';
import {
  saveAdSetToCloud, newAdSetDraft,
} from '../../services/adSetService';
import { saveCreativeToCloud } from '../../services/adCreativeService';
import { proxiedBannerUrl } from '../../services/cdnProxy';

interface Props {
  /** Original AI suggestion or seed copy. Fields are editable in this modal. */
  seed: Partial<AdCopySuggestion>;
  /** Banners attached to the source context (chat session / handoff). */
  bannerIds: string[];
  /** All campaigns currently in cloud — for the picker. */
  campaigns: AdCampaign[];
  /** All ad sets currently in cloud — for the picker. */
  adSets: AdSet[];
  /** History banners — for thumbnail render. */
  banners: HistoryItem[];
  /** Pre-selected pins from Studio session context. */
  pinnedCampaignId?: string;
  pinnedAdsetId?: string;
  onClose: () => void;
  /** Called after successful save. */
  onSaved: (saved: AdCreative) => Promise<void> | void;
}

type Mode = 'pick' | 'new-campaign' | 'new-adset';

export const CreativeFinalizeModal: React.FC<Props> = ({
  seed, bannerIds, campaigns, adSets, banners,
  pinnedCampaignId, pinnedAdsetId,
  onClose, onSaved,
}) => {
  // Resolve initial campaign + adset using priority:
  // 1) pinned from session 2) first banner's existing creative's campaign 3) default user has 4) none
  const initialCampaignId = pinnedCampaignId
    || (campaigns.length === 1 ? campaigns[0].id : undefined);
  const initialAdsetId = pinnedAdsetId
    || (initialCampaignId && adSets.filter(a => a.campaignId === initialCampaignId).length === 1
      ? adSets.find(a => a.campaignId === initialCampaignId)!.id
      : undefined);

  // Picker state
  const [campaignId, setCampaignId] = useState<string | undefined>(initialCampaignId);
  const [adsetId, setAdsetId] = useState<string | undefined>(initialAdsetId);
  const [mode, setMode] = useState<Mode>('pick');

  // Quick-create scratch
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignObjective, setNewCampaignObjective] = useState<AdCampaignObjective>('OUTCOME_TRAFFIC');
  const [newAdsetName, setNewAdsetName] = useState('');

  // Editable copy
  const [name, setName] = useState<string>(seed.headline?.slice(0, 80) || seed.primary_text?.slice(0, 60) || 'Creative mới');
  const [primaryText, setPrimaryText] = useState(seed.primary_text || '');
  const [headline, setHeadline] = useState(seed.headline || '');
  const [description, setDescription] = useState(seed.description || '');
  const [cta, setCta] = useState<AdCTA>(seed.cta || 'SHOP_NOW');
  const [destinationUrl, setDestinationUrl] = useState(seed.destination_url || '');
  const [saveStatus, setSaveStatus] = useState<'draft' | 'ready'>('draft');

  // Banner selection — default = first attached banner. User can pick from list.
  const [selectedBannerId, setSelectedBannerId] = useState<string | undefined>(bannerIds[0]);
  const selectedBanner = banners.find(b => b.id === selectedBannerId);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtered adsets for the current campaign
  const adSetsForCampaign = useMemo(
    () => campaignId ? adSets.filter(a => a.campaignId === campaignId) : [],
    [adSets, campaignId],
  );

  // When campaign changes, drop adset if it doesn't belong there
  useEffect(() => {
    if (adsetId && !adSetsForCampaign.find(a => a.id === adsetId)) {
      setAdsetId(undefined);
    }
  }, [adSetsForCampaign, adsetId]);

  // ────────── Quick-create handlers ──────────

  const createCampaignInline = async () => {
    if (!newCampaignName.trim()) { setError('Nhập tên campaign'); return; }
    setError(null);
    setSaving(true);
    try {
      const draft = newCampaignDraft(newCampaignName.trim(), newCampaignObjective);
      const saved = await saveCampaignToCloud(draft);
      // Locally insert — caller will refresh after save. We just need the id.
      campaigns.push(saved);
      setCampaignId(saved.id);
      setAdsetId(undefined);
      setNewCampaignName('');
      setMode('pick');
    } catch (e: any) {
      setError(e?.message || 'Tạo campaign lỗi');
    } finally {
      setSaving(false);
    }
  };

  const createAdsetInline = async () => {
    if (!campaignId) { setError('Chọn campaign trước'); return; }
    if (!newAdsetName.trim()) { setError('Nhập tên ad set'); return; }
    setError(null);
    setSaving(true);
    try {
      const draft = newAdSetDraft(campaignId, newAdsetName.trim());
      const saved = await saveAdSetToCloud(draft);
      adSets.push(saved);
      setAdsetId(saved.id);
      setNewAdsetName('');
      setMode('pick');
    } catch (e: any) {
      setError(e?.message || 'Tạo ad set lỗi');
    } finally {
      setSaving(false);
    }
  };

  // ────────── Save ──────────

  const handleSave = async () => {
    setError(null);
    if (!campaignId) { setError('Chọn Campaign'); return; }
    if (!adsetId) { setError('Chọn Ad Set'); return; }
    if (!selectedBannerId) { setError('Chọn banner'); return; }
    if (!primaryText.trim() && !headline.trim()) {
      setError('Cần primaryText hoặc headline');
      return;
    }

    setSaving(true);
    try {
      const draft: AdCreative = {
        id: Math.random().toString(36).substring(2, 8) + Date.now().toString(36),
        campaignId,
        adsetId,
        bannerId: selectedBannerId,
        name: name.trim() || 'Creative mới',
        primaryText: primaryText.trim() || undefined,
        headline: headline.trim() || undefined,
        description: description.trim() || undefined,
        cta,
        destinationUrl: destinationUrl.trim() || undefined,
        status: saveStatus,
        tags: [],
        source: 'agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const saved = await saveCreativeToCloud(draft);
      await onSaved(saved);
    } catch (e: any) {
      setError(e?.message || 'Lưu lỗi');
      setSaving(false);
    }
  };

  // ────────── Render ──────────

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-brand text-white p-2 rounded-lg shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-fg">Tạo Creative</h3>
              <p className="text-sm text-muted">Chọn Campaign + AdSet, chỉnh copy lần cuối, lưu vào Library.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-raised text-muted hover:text-fg">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1 — Destination */}
          <section className="space-y-3">
            <SectionLabel n={1} title="Đích đến" />

            {/* Campaign picker */}
            <Field label={<>Campaign <Star /></>}>
              {mode === 'new-campaign' ? (
                <div className="flex flex-col gap-2 bg-surface border border-line rounded-lg p-3">
                  <input
                    type="text"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="Tên campaign mới (vd: Sale 8/3 — VN)"
                    autoFocus
                    className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                  />
                  <select
                    value={newCampaignObjective}
                    onChange={(e) => setNewCampaignObjective(e.target.value as AdCampaignObjective)}
                    className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                  >
                    {(Object.keys(OBJECTIVE_LABELS) as AdCampaignObjective[]).map(o => (
                      <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>
                    ))}
                  </select>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setMode('pick'); setNewCampaignName(''); }}
                      className="text-sm px-3 py-1.5 rounded-lg text-muted hover:text-fg">Huỷ</button>
                    <button onClick={createCampaignInline} disabled={saving || !newCampaignName.trim()}
                      className="text-sm px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white font-medium disabled:opacity-50 flex items-center gap-1.5">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      Tạo & dùng
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={campaignId || ''}
                    onChange={(e) => setCampaignId(e.target.value || undefined)}
                    className="flex-1 bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                  >
                    <option value="">— Chọn campaign —</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.objective ? ` · ${c.objective.replace('OUTCOME_', '')}` : ''}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setMode('new-campaign')}
                    className="text-sm bg-canvas hover:bg-raised text-fg border border-line-strong px-3 py-2 rounded-lg flex items-center gap-1.5 font-medium shrink-0"
                  >
                    <Plus size={14} /> Mới
                  </button>
                </div>
              )}
            </Field>

            {/* AdSet picker (only shows once campaign is set) */}
            {campaignId && (
              <Field label={<>Ad Set <Star /></>}>
                {mode === 'new-adset' ? (
                  <div className="flex flex-col gap-2 bg-surface border border-line rounded-lg p-3">
                    <input
                      type="text"
                      value={newAdsetName}
                      onChange={(e) => setNewAdsetName(e.target.value)}
                      placeholder="Tên ad set mới (vd: Nữ 25-35 · HCM)"
                      autoFocus
                      className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                    />
                    <p className="text-xs text-muted">
                      Ad set sẽ tạo nhanh với targeting mặc định (VN, 18-55). Vào tab Campaigns để chỉnh chi tiết sau.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setMode('pick'); setNewAdsetName(''); }}
                        className="text-sm px-3 py-1.5 rounded-lg text-muted hover:text-fg">Huỷ</button>
                      <button onClick={createAdsetInline} disabled={saving || !newAdsetName.trim()}
                        className="text-sm px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white font-medium disabled:opacity-50 flex items-center gap-1.5">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Tạo & dùng
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={adsetId || ''}
                      onChange={(e) => setAdsetId(e.target.value || undefined)}
                      disabled={adSetsForCampaign.length === 0}
                      className="flex-1 bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand disabled:opacity-50"
                    >
                      <option value="">
                        — {adSetsForCampaign.length === 0 ? 'Campaign này chưa có ad set, tạo mới →' : 'Chọn ad set'} —
                      </option>
                      {adSetsForCampaign.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setMode('new-adset')}
                      className="text-sm bg-canvas hover:bg-raised text-fg border border-line-strong px-3 py-2 rounded-lg flex items-center gap-1.5 font-medium shrink-0"
                    >
                      <Plus size={14} /> Mới
                    </button>
                  </div>
                )}
              </Field>
            )}
          </section>

          {/* Step 2 — Banner */}
          <section className="space-y-3">
            <SectionLabel n={2} title="Banner" />
            {bannerIds.length === 0 ? (
              <div className="status-warning border rounded-lg px-3 py-2.5 text-sm flex items-center gap-2">
                <AlertCircle size={14} /> Không có banner nào attach. Quay lại Studio attach banner trước.
              </div>
            ) : bannerIds.length === 1 ? (
              <div className="flex items-center gap-3 bg-surface border border-line rounded-lg p-3">
                {selectedBanner && (
                  <img src={proxiedBannerUrl(selectedBanner.imageUrl)} alt="" className="w-20 h-20 rounded-lg object-cover border border-line" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg">{selectedBanner?.aspectRatio} · {selectedBanner?.quality}</p>
                  <p className="text-xs text-muted truncate">{selectedBanner?.promptUsed?.slice(0, 120) || '—'}</p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted mb-2">{bannerIds.length} banner attach — chọn 1 cho creative này:</p>
                <div className="grid grid-cols-4 gap-2">
                  {bannerIds.slice(0, 12).map(id => {
                    const b = banners.find(x => x.id === id);
                    if (!b) return null;
                    const on = selectedBannerId === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedBannerId(id)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                          on ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-line-strong'
                        }`}
                      >
                        <img src={proxiedBannerUrl(b.imageUrl)} alt="" className="w-full h-full object-cover" />
                        {on && (
                          <div className="absolute top-1 right-1 bg-brand text-white w-5 h-5 rounded-full flex items-center justify-center">
                            <CheckCircle size={12} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Step 3 — Copy */}
          <section className="space-y-3">
            <SectionLabel n={3} title="Copy" />

            <Field label="Tên creative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Sale 8/3 — Lifestyle 1:1"
                className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
              />
            </Field>

            <Field label={`Primary text (${primaryText.length}/2200)`}>
              <textarea
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value.slice(0, 2200))}
                placeholder="Body FB feed — hook 100 chars đầu, USP, CTA cảm xúc, có thể xuống dòng."
                className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand min-h-[100px] resize-y"
              />
              {primaryText.length > 125 && (
                <p className="text-xs text-muted mt-1">
                  Mobile cắt ở 125: <span className="text-fg">{primaryText.slice(0, 125)}</span>…
                </p>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Headline (${headline.length}/40)`}>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value.slice(0, 40))}
                  placeholder="Câu chốt deal"
                  className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                />
              </Field>
              <Field label={`Description (${description.length}/30)`}>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 30))}
                  placeholder="Phụ"
                  className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="CTA">
                <select
                  value={cta}
                  onChange={(e) => setCta(e.target.value as AdCTA)}
                  className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
                >
                  {CTA_OPTIONS.map(c => (<option key={c} value={c}>{c}</option>))}
                </select>
              </Field>
              <Field label="Destination URL">
                <input
                  type="url"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                />
              </Field>
            </div>
          </section>

          {error && (
            <div className="status-danger border text-sm px-3 py-2.5 rounded-lg flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-line bg-surface flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Lưu là:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setSaveStatus('draft')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  saveStatus === 'draft' ? 'bg-brand text-white' : 'bg-canvas text-muted hover:text-fg border border-line'
                }`}
              >
                Draft
              </button>
              <button
                onClick={() => setSaveStatus('ready')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  saveStatus === 'ready' ? 'bg-brand text-white' : 'bg-canvas text-muted hover:text-fg border border-line'
                }`}
              >
                Ready
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-muted hover:text-fg hover:bg-raised">
              Huỷ
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !campaignId || !adsetId || !selectedBannerId}
              className="text-sm px-5 py-2 rounded-lg bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Lưu creative
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

// ────────── helpers ──────────

const CTA_OPTIONS: AdCTA[] = [
  'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'BUY_NOW', 'BOOK_TRAVEL', 'DOWNLOAD',
  'CONTACT_US', 'GET_QUOTE', 'MESSAGE_PAGE', 'SUBSCRIBE', 'WATCH_MORE',
  'GET_OFFER', 'INSTALL_MOBILE_APP', 'NO_BUTTON',
];

const Star: React.FC = () => <span className="text-danger">*</span>;

const SectionLabel: React.FC<{ n: number; title: string }> = ({ n, title }) => (
  <div className="flex items-center gap-2">
    <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">{n}</span>
    <h4 className="text-sm font-semibold text-fg uppercase tracking-wider">{title}</h4>
  </div>
);

const Field: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-xs font-medium text-muted block mb-1">{label}</label>
    {children}
  </div>
);
