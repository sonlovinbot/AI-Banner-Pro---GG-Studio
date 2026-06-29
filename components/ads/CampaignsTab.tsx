import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, ChevronRight, ChevronDown, Edit3, Trash2, Loader2, AlertCircle,
  Layers, Target, X, Clipboard, Copy, Save, Sparkles, Send,
} from 'lucide-react';
import {
  AdCampaign, AdCampaignObjective, AdCampaignStatus, AdSet, AdSetStatus,
  AdCreative, HistoryItem, MetaAccount, MetaBidStrategy, MetaSpecialAdCategory, MetaOptimizationGoal,
  MetaBillingEvent, MetaDestinationType, AdSetTargeting,
} from '../../types';
import { CampaignWizard } from './CampaignWizard';
import { MetaPushModal } from './MetaPushModal';
import {
  listMetaAccountsFromCloud, MetaAccountsSetupRequiredError,
} from '../../services/metaAccountsService';
import {
  saveCampaignToCloud, deleteCampaignFromCloud, newCampaignDraft,
  OBJECTIVE_LABELS, BID_STRATEGY_LABELS, SPECIAL_AD_CATEGORY_LABELS,
} from '../../services/adCampaignService';
import {
  listAdSetsFromCloud, saveAdSetToCloud, deleteAdSetFromCloud, newAdSetDraft,
  AdSetSetupRequiredError,
  validOptimizationGoals, OPTIMIZATION_GOAL_LABELS, BILLING_EVENT_LABELS, DESTINATION_TYPE_LABELS,
} from '../../services/adSetService';
import { proxiedBannerUrl } from '../../services/cdnProxy';
import { Image as ImageIcon } from 'lucide-react';

interface Props {
  campaigns: AdCampaign[];
  creatives: AdCreative[];
  banners: HistoryItem[];
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  onEditCreative: (c: AdCreative) => void;
  /** Deep-link: queue a Studio handoff with campaign+adset pinned, then
   *  switch the Ads Manager tab to Studio. */
  onBrainstormForAdSet?: (campaignId: string, adsetId: string) => void;
}

export const CampaignsTab: React.FC<Props> = ({ campaigns, creatives, banners, loading, onRefresh, onEditCreative, onBrainstormForAdSet }) => {
  const handleBrainstorm = onBrainstormForAdSet || ((_c: string, _a: string) => {});
  const [showWizard, setShowWizard] = useState(false);
  const [adSets, setAdSets] = useState<AdSet[]>([]);
  const [adSetsLoading, setAdSetsLoading] = useState(true);
  const [adSetsError, setAdSetsError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedAdSet, setExpandedAdSet] = useState<string | null>(null);

  const [editingCampaign, setEditingCampaign] = useState<AdCampaign | null>(null);
  const [editingAdSet, setEditingAdSet] = useState<AdSet | null>(null);
  const [pushPreview, setPushPreview] = useState<AdCampaign | null>(null);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);

  useEffect(() => {
    listMetaAccountsFromCloud()
      .then(setMetaAccounts)
      .catch(e => {
        if (!(e instanceof MetaAccountsSetupRequiredError)) {
          console.warn('metaAccounts load failed', e);
        }
      });
  }, []);

  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAdSets = async () => {
    setAdSetsLoading(true);
    setAdSetsError(null);
    try {
      const data = await listAdSetsFromCloud();
      setAdSets(data);
    } catch (e: any) {
      if (e instanceof AdSetSetupRequiredError) {
        setSetupNeeded(true);
      } else {
        setAdSetsError(e?.message || 'Tải ad sets lỗi');
      }
    } finally {
      setAdSetsLoading(false);
    }
  };

  useEffect(() => { refreshAdSets(); }, []);

  const adSetsByCampaign = useMemo(() => {
    const m: Record<string, AdSet[]> = {};
    for (const a of adSets) {
      (m[a.campaignId] ||= []).push(a);
    }
    return m;
  }, [adSets]);

  const creativesByAdSet = useMemo(() => {
    const m: Record<string, AdCreative[]> = {};
    for (const c of creatives) {
      if (c.adsetId) (m[c.adsetId] ||= []).push(c);
    }
    return m;
  }, [creatives]);

  const bannerById = (id?: string): HistoryItem | undefined =>
    id ? banners.find(b => b.id === id) : undefined;

  /** Up to 3 banner thumbnails representative of a campaign (sourced from its creatives). */
  const campaignThumbs = (c: AdCampaign): HistoryItem[] => {
    const seen = new Set<string>();
    const out: HistoryItem[] = [];
    for (const cr of creatives) {
      if (cr.campaignId !== c.id || !cr.bannerId) continue;
      if (seen.has(cr.bannerId)) continue;
      const b = bannerById(cr.bannerId);
      if (b) { seen.add(b.id); out.push(b); }
      if (out.length >= 3) break;
    }
    return out;
  };

  const adSetThumbs = (a: AdSet): HistoryItem[] => {
    const seen = new Set<string>();
    const out: HistoryItem[] = [];
    for (const cr of (creativesByAdSet[a.id] || [])) {
      if (!cr.bannerId || seen.has(cr.bannerId)) continue;
      const b = bannerById(cr.bannerId);
      if (b) { seen.add(b.id); out.push(b); }
      if (out.length >= 3) break;
    }
    return out;
  };

  const orphanCreatives = useMemo(
    () => creatives.filter(c => !c.adsetId),
    [creatives],
  );

  const handleNewCampaign = () => {
    setEditingCampaign(newCampaignDraft('Campaign mới', 'OUTCOME_TRAFFIC'));
  };

  const handleDeleteCampaign = async (c: AdCampaign) => {
    const adSetsCount = (adSetsByCampaign[c.id] || []).length;
    if (!confirm(`Xoá campaign "${c.name}"${adSetsCount > 0 ? ` cùng ${adSetsCount} ad set` : ''}?`)) return;
    setError(null);
    setWorking(c.id);
    try {
      await deleteCampaignFromCloud(c.id);
      await Promise.all((adSetsByCampaign[c.id] || []).map(a => deleteAdSetFromCloud(a.id)));
      await Promise.all([onRefresh(), refreshAdSets()]);
    } catch (e: any) {
      setError(e?.message || 'Xoá campaign lỗi');
    } finally {
      setWorking(null);
    }
  };

  const handleNewAdSet = (campaignId: string) => {
    setEditingAdSet(newAdSetDraft(campaignId, 'Ad Set mới'));
  };

  const handleDeleteAdSet = async (a: AdSet) => {
    const count = (creativesByAdSet[a.id] || []).length;
    const detail = count > 0 ? ` (${count} creative sẽ về trạng thái không thuộc adset)` : '';
    if (!confirm(`Xoá ad set "${a.name}"${detail}?`)) return;
    setError(null);
    setWorking(a.id);
    try {
      await deleteAdSetFromCloud(a.id);
      await refreshAdSets();
    } catch (e: any) {
      setError(e?.message || 'Xoá adset lỗi');
    } finally {
      setWorking(null);
    }
  };

  if (loading || adSetsLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (setupNeeded) {
    return <AdSetSetupGuide />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-fg flex items-center gap-2">
            <Layers size={16} className="text-brand" />
            Campaign Manager
          </h2>
          <p className="text-[11px] text-subtle">
            Campaign → Ad Set → Creative. Push lên Meta sẽ tự map qua MCP (Sprint 5).
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowWizard(true)}
            className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 shadow-pop"
          >
            <Sparkles size={12} /> AI tạo campaign
          </button>
          <button
            onClick={handleNewCampaign}
            className="text-xs bg-canvas hover:bg-raised text-muted hover:text-fg px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 border border-line"
            title="Tạo campaign thủ công (không qua AI)"
          >
            <Plus size={12} /> Manual
          </button>
        </div>
      </div>

      {(error || adSetsError) && (
        <div className="bg-danger-soft border border-danger-fg/40 text-danger text-xs px-3 py-2 rounded flex items-center gap-2">
          <AlertCircle size={12} /> {error || adSetsError}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="bg-surface border border-line rounded-lg p-10 text-center">
          <Layers size={32} className="mx-auto text-muted mb-3" />
          <p className="text-sm text-fg mb-1">Chưa có campaign nào</p>
          <p className="text-[11px] text-subtle mb-4">Tạo campaign trước, rồi nạp ad set + creative bên trong</p>
          <button
            onClick={handleNewCampaign}
            className="text-xs bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-md inline-flex items-center gap-1.5 shadow-pop"
          >
            <Plus size={12} /> Tạo campaign đầu tiên
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => {
            const cAdSets = adSetsByCampaign[c.id] || [];
            const cCreatives = creatives.filter(cr => cr.campaignId === c.id);
            const open = expandedCampaign === c.id;
            return (
              <div key={c.id} className="bg-surface border border-line rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={() => setExpandedCampaign(open ? null : c.id)}
                    className="p-1 text-muted hover:text-fg shrink-0"
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <button
                    onClick={() => setExpandedCampaign(open ? null : c.id)}
                    className="shrink-0 hover:opacity-80 transition-opacity"
                    title={open ? 'Thu gọn' : 'Mở rộng'}
                  >
                    <ThumbStack items={campaignThumbs(c)} size={32} />
                  </button>

                  <button
                    onClick={() => setExpandedCampaign(open ? null : c.id)}
                    className="flex-1 min-w-0 text-left hover:opacity-90"
                    title={open ? 'Thu gọn' : 'Mở rộng'}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-fg truncate">{c.name}</p>
                      <StatusDot status={c.status} />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-subtle">
                      <span>{c.objective ? OBJECTIVE_LABELS[c.objective] : '— chưa chọn objective —'}</span>
                      <span>·</span>
                      <span>{cAdSets.length} ad set</span>
                      <span>·</span>
                      <span>{cCreatives.length} creative</span>
                      {c.useCBO && c.dailyBudget != null && (
                        <>
                          <span>·</span>
                          <span>CBO {formatMoney(c.dailyBudget)}/ngày</span>
                        </>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => setPushPreview(c)}
                    className="text-muted hover:text-brand p-1.5 rounded hover:bg-brand/10"
                    title="Preview Meta push payload"
                  >
                    <Send size={12} />
                  </button>
                  <button
                    onClick={() => setEditingCampaign(c)}
                    className="text-muted hover:text-fg p-1.5 rounded hover:bg-raised"
                    title="Sửa campaign"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteCampaign(c)}
                    disabled={working === c.id}
                    className="text-muted hover:text-danger p-1.5 rounded hover:bg-danger-soft"
                    title="Xoá campaign"
                  >
                    {working === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>

                {open && (
                  <div className="border-t border-line bg-canvas/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-subtle font-mono">Ad Sets ({cAdSets.length})</p>
                      <button
                        onClick={() => handleNewAdSet(c.id)}
                        className="text-[11px] text-muted hover:text-fg flex items-center gap-1 px-2 py-1 rounded border border-line hover:border-line-strong"
                      >
                        <Plus size={10} /> Ad Set mới
                      </button>
                    </div>

                    {cAdSets.length === 0 ? (
                      <p className="text-[11px] text-subtle py-3 text-center">Chưa có ad set. Tạo ad set để bắt đầu định nghĩa audience + budget.</p>
                    ) : (
                      cAdSets.map(a => {
                        const aCreatives = creativesByAdSet[a.id] || [];
                        const aOpen = expandedAdSet === a.id;
                        return (
                          <div key={a.id} className="bg-surface border border-line rounded-md">
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <button
                                onClick={() => setExpandedAdSet(aOpen ? null : a.id)}
                                className="p-0.5 text-muted hover:text-fg shrink-0"
                              >
                                {aOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                              </button>
                              <Target size={11} className="text-muted shrink-0" />
                              <button
                                onClick={() => setExpandedAdSet(aOpen ? null : a.id)}
                                className="flex-1 min-w-0 text-left hover:opacity-90"
                                title={aOpen ? 'Thu gọn' : 'Mở rộng'}
                              >
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-medium text-fg truncate">{a.name}</p>
                                  <StatusDot status={a.status} />
                                </div>
                                <p className="text-[10px] text-subtle truncate">
                                  {a.optimizationGoal ? OPTIMIZATION_GOAL_LABELS[a.optimizationGoal] || a.optimizationGoal : 'chưa chọn goal'}
                                  {' · '}
                                  {a.destinationType ? DESTINATION_TYPE_LABELS[a.destinationType] : '—'}
                                  {a.dailyBudget != null && ` · ${formatMoney(a.dailyBudget)}/ngày`}
                                  {' · '}
                                  {aCreatives.length} creative
                                </p>
                              </button>
                              <button
                                onClick={() => setEditingAdSet(a)}
                                className="text-muted hover:text-fg p-1 rounded hover:bg-raised"
                                title="Sửa ad set"
                              >
                                <Edit3 size={11} />
                              </button>
                              <button
                                onClick={() => handleDeleteAdSet(a)}
                                disabled={working === a.id}
                                className="text-muted hover:text-danger p-1 rounded hover:bg-danger-soft"
                                title="Xoá ad set"
                              >
                                {working === a.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={11} />}
                              </button>
                            </div>
                            {aOpen && (
                              <div className="border-t border-line px-3 py-2 bg-canvas/40 space-y-2">
                                {aCreatives.length === 0 ? (
                                  <p className="text-xs text-muted text-center py-2">
                                    Chưa có creative trong ad set này.
                                  </p>
                                ) : (
                                  <div className="space-y-1">
                                    {aCreatives.map(cr => {
                                      const cb = bannerById(cr.bannerId);
                                      return (
                                        <button
                                          key={cr.id}
                                          onClick={() => onEditCreative(cr)}
                                          className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-raised/40 transition-colors"
                                        >
                                          <Thumb item={cb} size={24} />
                                          <span className="text-xs text-fg truncate flex-1">
                                            {cr.name || cr.headline || cr.id.slice(0, 8)}
                                          </span>
                                          <StatusDot status={cr.status as any} />
                                          <span className="text-[10px] text-subtle font-mono">{cr.cta || '—'}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Deep-link entry to Studio with this campaign+adset pinned */}
                                <button
                                  onClick={() => handleBrainstorm(c.id, a.id)}
                                  className="w-full flex items-center justify-center gap-1.5 text-sm text-brand hover:bg-brand-soft border border-dashed border-brand/40 rounded-lg py-2 font-medium transition-colors"
                                  title="Mở Studio, chat AI viết copy, lưu thẳng vào ad set này"
                                >
                                  <Sparkles size={14} /> Brainstorm Creative cho Ad Set này
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {orphanCreatives.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-subtle font-mono mb-2">
            Creative chưa thuộc Campaign/Ad Set ({orphanCreatives.length})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {orphanCreatives.slice(0, 30).map(cr => {
              const cb = bannerById(cr.bannerId);
              return (
                <button
                  key={cr.id}
                  onClick={() => onEditCreative(cr)}
                  className="text-left bg-canvas border border-line rounded p-1.5 hover:border-line-strong flex items-center gap-2 group"
                  title={cr.name || cr.headline}
                >
                  <Thumb item={cb} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted group-hover:text-fg truncate">
                      {cr.name || cr.headline || cr.id.slice(0, 8)}
                    </p>
                    <p className="text-[10px] text-subtle truncate">
                      {cr.cta || '—'} · {cr.status}
                    </p>
                  </div>
                </button>
              );
            })}
            {orphanCreatives.length > 30 && (
              <p className="text-[10px] text-subtle col-span-full text-center mt-1">
                ... và {orphanCreatives.length - 30} creative khác
              </p>
            )}
          </div>
        </div>
      )}

      {editingCampaign && (
        <CampaignEditor
          campaign={editingCampaign}
          metaAccounts={metaAccounts}
          onClose={() => setEditingCampaign(null)}
          onSave={async (c) => {
            await saveCampaignToCloud(c);
            await onRefresh();
            setEditingCampaign(null);
          }}
        />
      )}

      {editingAdSet && (
        <AdSetEditor
          adSet={editingAdSet}
          campaign={campaigns.find(c => c.id === editingAdSet.campaignId)}
          onClose={() => setEditingAdSet(null)}
          onSave={async (a) => {
            await saveAdSetToCloud(a);
            await refreshAdSets();
            setEditingAdSet(null);
          }}
        />
      )}

      {showWizard && (
        <CampaignWizard
          banners={banners}
          onClose={() => setShowWizard(false)}
          onDone={async () => {
            await Promise.all([onRefresh(), refreshAdSets()]);
          }}
        />
      )}

      {pushPreview && (
        <MetaPushModal
          campaign={pushPreview}
          adSets={adSets}
          creatives={creatives}
          banners={banners}
          metaAccounts={metaAccounts}
          onClose={() => setPushPreview(null)}
          onPushed={async () => {
            await Promise.all([onRefresh(), refreshAdSets()]);
          }}
        />
      )}
    </div>
  );
};

// ────────────── Status dot (one-color spec) ──────────────

const StatusDot: React.FC<{ status: AdCampaignStatus | AdSetStatus }> = ({ status }) => {
  const varName =
    status === 'active'   ? 'var(--success-fg)' :
    status === 'paused'   ? 'var(--warning-fg)' :
    status === 'archived' ? 'var(--fg-subtle)' :
    'var(--fg-muted)';
  return (
    <span
      title={status}
      style={{ background: varName }}
      className="w-2 h-2 rounded-full inline-block shrink-0"
    />
  );
};

// ────────────── Thumbnail bits ──────────────

const Thumb: React.FC<{ item?: HistoryItem; size?: number; fallbackIcon?: React.ReactNode }> = ({ item, size = 28, fallbackIcon }) => {
  const sz = { width: size, height: size };
  if (item?.imageUrl) {
    return (
      <img
        src={proxiedBannerUrl(item.imageUrl)}
        alt=""
        style={sz}
        className="object-cover rounded border border-line shrink-0"
        title={item.promptUsed?.slice(0, 80)}
      />
    );
  }
  return (
    <div
      style={sz}
      className="rounded border border-line bg-raised text-muted flex items-center justify-center shrink-0"
    >
      {fallbackIcon || <ImageIcon size={Math.max(10, Math.floor(size * 0.45))} />}
    </div>
  );
};

const ThumbStack: React.FC<{ items: HistoryItem[]; size?: number; fallbackIcon?: React.ReactNode }> = ({ items, size = 28, fallbackIcon }) => {
  if (items.length === 0) {
    return <Thumb size={size} fallbackIcon={fallbackIcon} />;
  }
  if (items.length === 1) {
    return <Thumb item={items[0]} size={size} />;
  }
  // 2-3 stacked overlapping
  return (
    <div className="flex items-center -space-x-2 shrink-0">
      {items.slice(0, 3).map((it, i) => (
        <img
          key={it.id}
          src={proxiedBannerUrl(it.imageUrl)}
          alt=""
          style={{ width: size, height: size, zIndex: 3 - i }}
          className="object-cover rounded border border-line bg-canvas"
          title={it.promptUsed?.slice(0, 80)}
        />
      ))}
    </div>
  );
};

// ────────────── Format VND minor (cent) → display string ──────────────

function formatMoney(cents?: number): string {
  if (cents == null) return '—';
  // Treat minor unit as smallest sub-unit. For VND, Meta returns major as cents
  // (1 VND = 100 internal). Show whole VND for readability.
  const major = Math.round(cents / 100);
  return major.toLocaleString('vi-VN') + 'đ';
}

// ────────────── Campaign Editor ──────────────

interface CampaignEditorProps {
  campaign: AdCampaign;
  metaAccounts: MetaAccount[];
  onClose: () => void;
  onSave: (c: AdCampaign) => Promise<void>;
}

const CampaignEditor: React.FC<CampaignEditorProps> = ({ campaign, metaAccounts, onClose, onSave }) => {
  const [draft, setDraft] = useState<AdCampaign>(campaign);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof AdCampaign>(k: K, v: AdCampaign[K]) =>
    setDraft(prev => ({ ...prev, [k]: v }));

  const toggleCategory = (cat: MetaSpecialAdCategory) => {
    const cur = draft.specialAdCategories || [];
    update('specialAdCategories', cur.includes(cat) ? cur.filter(x => x !== cat) : [...cur, cat]);
  };

  const handleSave = async () => {
    setError(null);
    if (!draft.name.trim()) { setError('Cần đặt tên campaign'); return; }
    if (!draft.objective) { setError('Chọn objective'); return; }
    if (draft.useCBO && (draft.dailyBudget == null && draft.lifetimeBudget == null)) {
      setError('CBO bật → cần Daily HOẶC Lifetime budget');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...draft, updatedAt: Date.now() });
    } catch (e: any) {
      setError(e?.message || 'Lưu lỗi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Sửa Campaign" subtitle={`${draft.id.slice(0, 6)} · ${draft.status}`} onClose={onClose}>
      <div className="p-5 space-y-4">
        <Field label="Tên campaign">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="VD: Sale 8/3 — VN"
            className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Objective (ODAX) *">
            <select
              value={draft.objective || ''}
              onChange={(e) => update('objective', e.target.value as AdCampaignObjective || undefined)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              <option value="">— chọn —</option>
              {(Object.keys(OBJECTIVE_LABELS) as AdCampaignObjective[]).map(o => (
                <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>
              ))}
            </select>
          </Field>
          <Field label="Bid strategy">
            <select
              value={draft.bidStrategy || ''}
              onChange={(e) => update('bidStrategy', (e.target.value as MetaBidStrategy) || undefined)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              <option value="">— mặc định LOWEST_COST —</option>
              {(Object.keys(BID_STRATEGY_LABELS) as MetaBidStrategy[]).map(b => (
                <option key={b} value={b}>{BID_STRATEGY_LABELS[b]}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Status">
          <select
            value={draft.status}
            onChange={(e) => update('status', e.target.value as AdCampaignStatus)}
            className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
          >
            {(['draft', 'active', 'paused', 'archived'] as AdCampaignStatus[]).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <div className="border-t border-line pt-3">
          <label className="text-xs font-medium text-fg flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={!!draft.useCBO}
              onChange={(e) => update('useCBO', e.target.checked)}
            />
            CBO — Campaign Budget Optimization
            <span className="text-[10px] text-subtle font-normal">(Meta phân bổ ngân sách giữa các ad set)</span>
          </label>

          {draft.useCBO && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Field label="Daily budget (VND minor — 100 = 1đ)">
                <input
                  type="number"
                  value={draft.dailyBudget ?? ''}
                  onChange={(e) => update('dailyBudget', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="VD: 5000000 = 50.000đ/ngày"
                  className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
                />
              </Field>
              <Field label="Lifetime budget (alt)">
                <input
                  type="number"
                  value={draft.lifetimeBudget ?? ''}
                  onChange={(e) => update('lifetimeBudget', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="bỏ trống nếu dùng daily"
                  className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
                />
              </Field>
            </div>
          )}
          {!draft.useCBO && (
            <p className="text-[11px] text-subtle">Budget sẽ đặt ở từng ad set bên dưới.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Spend cap (lifetime)">
            <input
              type="number"
              value={draft.spendCap ?? ''}
              onChange={(e) => update('spendCap', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="optional"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
          </Field>
          <Field label="Meta Account *">
            {metaAccounts.length === 0 ? (
              <div className="status-warning border rounded-lg px-3 py-2 text-sm">
                Chưa có Meta Account nào. Vào <b className="text-fg">Settings → Meta Accounts</b> để thêm trước.
              </div>
            ) : (
              <select
                value={draft.metaAccountRefId || ''}
                onChange={(e) => update('metaAccountRefId', e.target.value || undefined)}
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
              >
                <option value="">— Chọn —</option>
                {metaAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.label}{a.isDefault ? ' · default' : ''} ({a.accountId})
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <Field label="Special Ad Categories">
          <p className="text-[10px] text-subtle mb-1.5">Chỉ chọn nếu campaign thuộc các loại bị Meta hạn chế targeting:</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SPECIAL_AD_CATEGORY_LABELS) as MetaSpecialAdCategory[]).map(cat => {
              const on = draft.specialAdCategories?.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                    on
                      ? 'bg-brand/15 text-brand border-brand/40'
                      : 'bg-canvas text-muted hover:text-fg border-line'
                  }`}
                >
                  {SPECIAL_AD_CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Notes (internal)">
          <textarea
            value={draft.notes || ''}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Ghi chú nội bộ — không đẩy lên Meta"
            className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand min-h-[60px] resize-y"
          />
        </Field>

        {error && (
          <div className="bg-danger-soft border border-danger-fg/40 text-danger text-xs px-3 py-2 rounded flex items-center gap-2">
            <AlertCircle size={12} /> {error}
          </div>
        )}
      </div>

      <Footer>
        <button onClick={onClose} className="text-xs px-4 py-2 rounded-md bg-raised hover:bg-raised-2 text-fg">
          Huỷ
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-4 py-2 rounded-md bg-brand hover:bg-brand-dark text-white font-medium shadow-pop disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Lưu
        </button>
      </Footer>
    </Modal>
  );
};

// ────────────── Ad Set Editor ──────────────

interface AdSetEditorProps {
  adSet: AdSet;
  campaign?: AdCampaign;
  onClose: () => void;
  onSave: (a: AdSet) => Promise<void>;
}

const AdSetEditor: React.FC<AdSetEditorProps> = ({ adSet, campaign, onClose, onSave }) => {
  const [draft, setDraft] = useState<AdSet>(adSet);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof AdSet>(k: K, v: AdSet[K]) =>
    setDraft(prev => ({ ...prev, [k]: v }));

  const updateTargeting = <K extends keyof AdSetTargeting>(k: K, v: AdSetTargeting[K]) =>
    setDraft(prev => ({ ...prev, targeting: { ...(prev.targeting || {}), [k]: v } }));

  const goalOptions = validOptimizationGoals(campaign?.objective, draft.destinationType);
  const cboOn = !!campaign?.useCBO;

  const handleSave = async () => {
    setError(null);
    if (!draft.name.trim()) { setError('Cần đặt tên ad set'); return; }
    if (!draft.optimizationGoal) { setError('Chọn optimization goal'); return; }
    if (!draft.billingEvent) { setError('Chọn billing event'); return; }
    if (!cboOn && draft.dailyBudget == null && draft.lifetimeBudget == null) {
      setError('Campaign không bật CBO → cần budget ở ad set');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...draft, updatedAt: Date.now() });
    } catch (e: any) {
      setError(e?.message || 'Lưu lỗi');
    } finally {
      setSaving(false);
    }
  };

  const targeting = draft.targeting || {};

  return (
    <Modal
      title="Sửa Ad Set"
      subtitle={`${campaign?.name || 'no campaign'} · ${draft.id.slice(0, 6)}`}
      onClose={onClose}
    >
      <div className="p-5 space-y-4">
        <Field label="Tên ad set">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="VD: VN 18-35 · Lookalike 1%"
            className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Destination type">
            <select
              value={draft.destinationType || ''}
              onChange={(e) => {
                const v = (e.target.value as MetaDestinationType) || undefined;
                update('destinationType', v);
                // optimization goal có thể không còn hợp lệ với destination mới
                update('optimizationGoal', undefined);
              }}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              <option value="">— chọn —</option>
              {(Object.keys(DESTINATION_TYPE_LABELS) as MetaDestinationType[]).map(d => (
                <option key={d} value={d}>{DESTINATION_TYPE_LABELS[d]}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={draft.status}
              onChange={(e) => update('status', e.target.value as AdSetStatus)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              {(['draft', 'active', 'paused', 'archived'] as AdSetStatus[]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Optimization goal *">
            <select
              value={draft.optimizationGoal || ''}
              onChange={(e) => update('optimizationGoal', (e.target.value as MetaOptimizationGoal) || undefined)}
              disabled={goalOptions.length === 0}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand disabled:opacity-50"
            >
              <option value="">— chọn goal —</option>
              {goalOptions.map(g => (
                <option key={g} value={g}>{OPTIMIZATION_GOAL_LABELS[g] || g}</option>
              ))}
            </select>
            {goalOptions.length === 0 && (
              <p className="text-[10px] text-subtle mt-1">Chọn objective (campaign) + destination_type trước.</p>
            )}
          </Field>
          <Field label="Billing event *">
            <select
              value={draft.billingEvent || ''}
              onChange={(e) => update('billingEvent', (e.target.value as MetaBillingEvent) || undefined)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              <option value="">— chọn —</option>
              {(Object.keys(BILLING_EVENT_LABELS) as MetaBillingEvent[]).map(b => (
                <option key={b} value={b}>{BILLING_EVENT_LABELS[b]}</option>
              ))}
            </select>
          </Field>
        </div>

        {!cboOn && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily budget (minor)">
              <input
                type="number"
                value={draft.dailyBudget ?? ''}
                onChange={(e) => update('dailyBudget', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="VD: 5000000 = 50k VND"
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
              />
            </Field>
            <Field label="Lifetime budget (alt)">
              <input
                type="number"
                value={draft.lifetimeBudget ?? ''}
                onChange={(e) => update('lifetimeBudget', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="bỏ trống nếu dùng daily"
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bid amount (minor, optional)">
            <input
              type="number"
              value={draft.bidAmount ?? ''}
              onChange={(e) => update('bidAmount', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="cần nếu bid_strategy != LOWEST_COST"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
          </Field>
          <Field label="Promoted Page ID">
            <input
              type="text"
              value={draft.promotedPageId || ''}
              onChange={(e) => update('promotedPageId', e.target.value)}
              placeholder="bắt buộc nếu destination ON_POST"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time (ISO 8601)">
            <input
              type="datetime-local"
              value={draft.startTime ? draft.startTime.slice(0, 16) : ''}
              onChange={(e) => update('startTime', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </Field>
          <Field label="End time">
            <input
              type="datetime-local"
              value={draft.endTime ? draft.endTime.slice(0, 16) : ''}
              onChange={(e) => update('endTime', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </Field>
        </div>

        {/* Targeting */}
        <div className="border-t border-line pt-3 space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-subtle font-mono">Targeting (cơ bản)</p>

          <Field label="Countries (ISO 2-letter, ngăn dấu phẩy)">
            <input
              type="text"
              value={(targeting.countries || []).join(', ')}
              onChange={(e) => updateTargeting('countries', e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))}
              placeholder="VD: VN, US, SG"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Age min">
              <input
                type="number"
                min={13}
                max={65}
                value={targeting.ageMin ?? ''}
                onChange={(e) => updateTargeting('ageMin', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="13"
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
              />
            </Field>
            <Field label="Age max">
              <input
                type="number"
                min={13}
                max={65}
                value={targeting.ageMax ?? ''}
                onChange={(e) => updateTargeting('ageMax', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="65"
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
              />
            </Field>
          </div>

          <Field label="Genders">
            <div className="flex gap-2">
              {(['male', 'female'] as const).map(g => {
                const on = (targeting.genders || []).includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => {
                      const cur = targeting.genders || [];
                      updateTargeting('genders', on ? cur.filter(x => x !== g) : [...cur, g]);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                      on ? 'bg-brand/15 text-brand border-brand/40' : 'bg-canvas text-muted hover:text-fg border-line'
                    }`}
                  >
                    {g === 'male' ? 'Nam' : 'Nữ'}
                  </button>
                );
              })}
              <span className="text-[11px] text-subtle self-center">(bỏ trống = all)</span>
            </div>
          </Field>

          <Field label="Interest labels (cache — Meta IDs cần thêm sau)">
            <input
              type="text"
              value={(targeting.interestLabels || []).join(', ')}
              onChange={(e) => updateTargeting('interestLabels', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="VD: cosmetics, beauty, skincare"
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            />
            <p className="text-[10px] text-subtle mt-1">Sprint 5 sẽ resolve label → Meta interest_id qua MCP.</p>
          </Field>
        </div>

        <label className="text-xs font-medium text-fg flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!draft.isDynamicCreative}
            onChange={(e) => update('isDynamicCreative', e.target.checked)}
          />
          Dynamic Creative
          <span className="text-[10px] text-subtle font-normal">(Meta auto kết hợp asset)</span>
        </label>

        {error && (
          <div className="bg-danger-soft border border-danger-fg/40 text-danger text-xs px-3 py-2 rounded flex items-center gap-2">
            <AlertCircle size={12} /> {error}
          </div>
        )}
      </div>

      <Footer>
        <button onClick={onClose} className="text-xs px-4 py-2 rounded-md bg-raised hover:bg-raised-2 text-fg">
          Huỷ
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-4 py-2 rounded-md bg-brand hover:bg-brand-dark text-white font-medium shadow-pop disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Lưu
        </button>
      </Footer>
    </Modal>
  );
};

// ────────────── Reusable Modal shell ──────────────

const Modal: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-canvas border border-line rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {subtitle && <p className="text-[11px] text-subtle">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg">
          <X size={16} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  </div>
);

const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <footer className="px-5 py-3 border-t border-line bg-surface/60 flex items-center justify-end gap-2">
    {children}
  </footer>
);

const Field: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[11px] font-medium text-muted block mb-1">{label}</label>
    {children}
  </div>
);

// ────────────── Setup guide ──────────────

const AD_SET_SQL = `-- ============================================================
-- Ads Manager Sprint 3 + Meta push setup
-- ============================================================

-- Ad sets table
CREATE TABLE IF NOT EXISTS ad_sets (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  campaign_id text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  optimization_goal text,
  billing_event text,
  daily_budget bigint,
  lifetime_budget bigint,
  bid_amount bigint,
  start_time timestamptz,
  end_time timestamptz,
  destination_type text,
  promoted_page_id text,
  lead_gen_form_id text,
  targeting jsonb,
  is_dynamic_creative boolean DEFAULT false,
  meta_ad_set_id text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_sets_user_campaign_idx ON ad_sets (user_id, campaign_id);
CREATE INDEX IF NOT EXISTS ad_sets_campaign_idx ON ad_sets (campaign_id, updated_at DESC);

ALTER TABLE ad_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ad_sets" ON ad_sets;
CREATE POLICY "own ad_sets" ON ad_sets FOR ALL
  USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- Meta Accounts (cấu hình global account/page/IG, campaign chỉ tham chiếu)
CREATE TABLE IF NOT EXISTS meta_accounts (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  account_id text NOT NULL,
  page_id text NOT NULL,
  instagram_actor_id text,
  is_default boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_accounts_user_idx ON meta_accounts (user_id, is_default DESC);

ALTER TABLE meta_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own meta_accounts" ON meta_accounts;
CREATE POLICY "own meta_accounts" ON meta_accounts FOR ALL
  USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- Extra columns for ad_campaigns
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS lifetime_budget bigint,
  ADD COLUMN IF NOT EXISTS spend_cap bigint,
  ADD COLUMN IF NOT EXISTS use_cbo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bid_strategy text,
  ADD COLUMN IF NOT EXISTS special_ad_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meta_account_id text,
  ADD COLUMN IF NOT EXISTS meta_account_ref_id text;

-- Link creatives ↔ adsets
ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS adset_id text;`;

const AdSetSetupGuide: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AD_SET_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="bg-surface border border-line rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="status-warning border p-2 rounded-lg">
            <AlertCircle size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-fg">Cần chạy SQL để bật Campaign Manager</h2>
            <p className="text-sm text-muted">File SQL đầy đủ ở <code className="bg-canvas text-fg px-1.5 py-0.5 rounded font-mono">db/setup.sql</code> trong repo, hoặc copy block dưới.</p>
          </div>
        </div>
        <ol className="text-sm text-muted space-y-1.5 mb-3 list-decimal list-inside">
          <li>Vào Supabase → <b className="text-fg">SQL Editor</b> → <b className="text-fg">New query</b></li>
          <li>Paste block SQL bên dưới (bấm Copy)</li>
          <li>Run → reload page (F5)</li>
        </ol>
        <div className="bg-canvas border border-line rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-line flex items-center justify-between bg-surface">
            <span className="text-xs font-mono text-muted">db/setup.sql</span>
            <button
              onClick={copy}
              className="text-sm bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium"
            >
              {copied ? '✓ Đã copy' : <><Clipboard size={12} /> Copy</>}
            </button>
          </div>
          <pre className="text-[10px] font-mono text-fg/80 p-3 overflow-x-auto max-h-[360px] whitespace-pre">
{AD_SET_SQL}
          </pre>
        </div>
      </div>
    </div>
  );
};
