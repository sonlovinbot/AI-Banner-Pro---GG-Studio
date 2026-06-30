import React, { useEffect, useMemo, useState } from 'react';
import {
  Send, Edit3, Trash2, Copy, CheckCircle, PauseCircle, PlayCircle,
  ArrowRight, Archive, RotateCw, AlertCircle, Megaphone, Loader2, RefreshCw,
} from 'lucide-react';
import { AdCreative, AdCreativeStatus, AdCampaign, AdSet, HistoryItem, MetaAccount } from '../../types';
import { saveCreativeToCloud, deleteCreativeFromCloud } from '../../services/adCreativeService';
import { proxiedBannerUrl } from '../../services/cdnProxy';
import { listMetaAccountsFromCloud, MetaAccountsSetupRequiredError } from '../../services/metaAccountsService';
import { syncAllPushedCampaigns, SyncSummary } from '../../services/metaSyncService';

interface Props {
  creatives: AdCreative[];
  campaigns: AdCampaign[];
  adSets: AdSet[];
  banners: HistoryItem[];
  loading: boolean;
  onEdit: (c: AdCreative) => void;
  onRefresh: () => Promise<void> | void;
}

type ColumnId = Exclude<AdCreativeStatus, 'archived'>;

// Columns share the same neutral background — only a small status dot in the
// header conveys the state. Avoids the "6-color Kanban rainbow" pattern.
const COLUMNS: { id: ColumnId; label: string; sub: string; dotVar: string }[] = [
  { id: 'draft',   label: 'Draft',   sub: 'đang soạn',                 dotVar: 'var(--fg-subtle)' },
  { id: 'ready',   label: 'Ready',   sub: 'sẵn sàng push',             dotVar: 'var(--success-fg)' },
  { id: 'pushing', label: 'Pushing', sub: 'agent đang đẩy',            dotVar: 'var(--info-fg)' },
  { id: 'pushed',  label: 'Pushed',  sub: 'đang chạy trên Meta',       dotVar: 'var(--success-fg)' },
  { id: 'paused',  label: 'Paused',  sub: 'tạm dừng',                  dotVar: 'var(--warning-fg)' },
  { id: 'failed',  label: 'Failed',  sub: 'lỗi push hoặc Meta reject', dotVar: 'var(--danger-fg)' },
];

export const QueueTab: React.FC<Props> = ({ creatives, campaigns, adSets, banners, loading, onEdit, onRefresh }) => {
  const [working, setWorking] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<AdCreativeStatus | null>(null);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<{ touched: number; total: number; errs: string[] } | null>(null);

  useEffect(() => {
    listMetaAccountsFromCloud()
      .then(setMetaAccounts)
      .catch(e => {
        if (!(e instanceof MetaAccountsSetupRequiredError)) console.warn('metaAccounts load failed', e);
      });
  }, []);

  const pushedCount = campaigns.filter(c => c.metaCampaignId).length;

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncSummary(null);
    try {
      const results: SyncSummary[] = await syncAllPushedCampaigns(campaigns, adSets, creatives, metaAccounts);
      const touched = results.reduce((s, r) => s + r.touched, 0);
      const errs = results.filter(r => r.error).map(r => `${r.campaignName}: ${r.error}`);
      await onRefresh();
      setSyncSummary({ touched, total: results.length, errs });
      if (errs.length === 0) setTimeout(() => setSyncSummary(null), 6_000);
    } finally {
      setSyncing(false);
    }
  };

  const onDragStart = (e: React.DragEvent, c: AdCreative) => {
    e.dataTransfer.setData('text/plain', c.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(c.id);
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
  };

  const onColumnDragOver = (e: React.DragEvent, status: AdCreativeStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== status) setDragOverCol(status);
  };

  const onColumnDrop = (e: React.DragEvent, target: AdCreativeStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragOverCol(null);
    setDraggingId(null);
    if (!id) return;
    const c = creatives.find(x => x.id === id);
    if (!c || c.status === target) return;
    move(c, target);
  };

  const bannerById = (id?: string) => (id ? banners.find(b => b.id === id) : undefined);
  const campaignById = (id?: string) => (id ? campaigns.find(c => c.id === id) : undefined);

  const grouped = useMemo(() => {
    const g: Record<ColumnId, AdCreative[]> = {
      draft: [], ready: [], pushing: [], pushed: [], paused: [], failed: [],
    };
    for (const c of creatives) {
      if (c.status === 'archived') continue;
      if (c.status in g) g[c.status as ColumnId].push(c);
    }
    return g;
  }, [creatives]);

  const archived = creatives.filter(c => c.status === 'archived');

  const move = async (c: AdCreative, to: AdCreativeStatus) => {
    if (c.status === to) return;
    setError(null);
    setWorking(c.id);
    try {
      await saveCreativeToCloud({ ...c, status: to, updatedAt: Date.now() });
      await onRefresh();
    } catch (e: any) {
      setError(`Đổi status lỗi: ${e?.message}`);
    } finally {
      setWorking(null);
    }
  };

  const remove = async (c: AdCreative) => {
    if (!confirm(`Xoá creative "${c.name || c.headline || c.id}"?`)) return;
    setError(null);
    setWorking(c.id);
    try {
      await deleteCreativeFromCloud(c.id);
      await onRefresh();
    } catch (e: any) {
      setError(`Xoá lỗi: ${e?.message}`);
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-fg flex items-center gap-2">
            <Send size={16} className="text-info" />
            Push Queue
          </h2>
          <p className="text-[11px] text-subtle">
            Push thực tế lên Meta qua MCP server (Pipeboard). Local status có thể lệch khi user pause/edit trực tiếp trên Meta — bấm "Sync from Meta" để pull về.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pushedCount > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="text-xs bg-brand hover:bg-brand-dark text-white flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium disabled:opacity-50"
              title={`Pull status của ${pushedCount} campaign đã push (tốn ~${pushedCount * 4} Pipeboard call)`}
            >
              {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Sync from Meta ({pushedCount})
            </button>
          )}
          {archived.length > 0 && (
            <button
              onClick={() => setShowArchived(s => !s)}
              className="text-xs text-muted hover:text-fg flex items-center gap-1 px-2 py-1 rounded border border-line"
            >
              <Archive size={11} /> Archive ({archived.length})
            </button>
          )}
        </div>
      </div>

      {syncSummary && (
        <div className={`text-xs px-3 py-2 rounded-lg border ${
          syncSummary.errs.length > 0 ? 'status-warning' : 'status-info'
        }`}>
          Sync xong {syncSummary.total} campaign — cập nhật <b>{syncSummary.touched}</b> thực thể từ Meta.
          {syncSummary.errs.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {syncSummary.errs.slice(0, 3).map((e, i) => (
                <li key={i} className="opacity-90 truncate">⚠ {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="bg-danger-soft border border-danger-fg/40 text-danger text-xs px-3 py-2 rounded flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {COLUMNS.map(col => {
          const isHover = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => onColumnDragOver(e, col.id)}
              onDragLeave={() => setDragOverCol(prev => prev === col.id ? null : prev)}
              onDrop={(e) => onColumnDrop(e, col.id)}
              className={`rounded-xl border flex flex-col min-h-[280px] transition-colors ${
                isHover ? 'border-brand bg-brand/5' : 'border-line bg-surface'
              }`}
            >
              <header className="px-3 py-2.5 border-b border-line flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: col.dotVar }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg truncate">{col.label}</p>
                    <p className="text-xs text-muted truncate">{col.sub}</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-fg bg-canvas border border-line px-2 py-0.5 rounded-md">
                  {grouped[col.id].length}
                </span>
              </header>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-22rem)]">
                {grouped[col.id].length === 0 ? (
                  <p className="text-xs text-muted text-center py-6">
                    {isHover ? 'Thả vào đây' : 'Trống'}
                  </p>
                ) : (
                  grouped[col.id].map(c => (
                    <CreativeCard
                      key={c.id}
                      creative={c}
                      banner={bannerById(c.bannerId)}
                      campaign={campaignById(c.campaignId)}
                      busy={working === c.id}
                      dragging={draggingId === c.id}
                      onDragStart={(e) => onDragStart(e, c)}
                      onDragEnd={onDragEnd}
                      onMove={(to) => move(c, to)}
                      onEdit={() => onEdit(c)}
                      onDelete={() => remove(c)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showArchived && archived.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Archive</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {archived.map(c => (
              <div key={c.id} className="text-[11px] bg-canvas border border-line rounded px-2 py-1.5 flex items-center justify-between gap-1">
                <span className="truncate text-muted">{c.name || c.headline || c.id.slice(0, 6)}</span>
                <button
                  onClick={() => move(c, 'draft')}
                  className="text-muted hover:text-fg shrink-0"
                  title="Restore về Draft"
                >
                  <RotateCw size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ────────────── Creative card ──────────────

const CreativeCard: React.FC<{
  creative: AdCreative;
  banner?: HistoryItem;
  campaign?: AdCampaign;
  busy: boolean;
  dragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onMove: (to: AdCreativeStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ creative: c, banner, campaign, busy, dragging, onDragStart, onDragEnd, onMove, onEdit, onDelete }) => {
  const transitions = nextTransitions(c.status);

  return (
    <div
      draggable={!busy}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-canvas border rounded-md p-2 space-y-1.5 transition-colors cursor-move ${
        dragging ? 'opacity-40 border-brand' : 'border-line hover:border-line-strong'
      }`}
    >
      <div className="flex gap-2">
        {banner ? (
          <img src={proxiedBannerUrl(banner.imageUrl)} alt="" className="w-12 h-12 rounded object-cover border border-line shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded bg-raised border border-line flex items-center justify-center text-muted shrink-0">
            <Megaphone size={16} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-fg truncate" title={c.name}>
            {c.name || c.headline || `Creative ${c.id.slice(0, 6)}`}
          </p>
          {campaign && (
            <p className="text-[10px] text-subtle truncate">{campaign.name}</p>
          )}
          {c.headline && (
            <p className="text-[10px] text-muted truncate">{c.headline}</p>
          )}
        </div>
      </div>

      {c.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {c.tags.slice(0, 3).map(t => (
            <span key={t} className="text-[9px] bg-raised text-muted px-1.5 py-px rounded">#{t}</span>
          ))}
          {c.tags.length > 3 && (
            <span className="text-[9px] text-subtle">+{c.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 pt-1 border-t border-line/40">
        <button
          onClick={onEdit}
          className="text-muted hover:text-fg p-1 rounded hover:bg-raised"
          title="Sửa creative"
        >
          <Edit3 size={11} />
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="text-muted hover:text-danger p-1 rounded hover:bg-danger-soft"
          title="Xoá"
        >
          <Trash2 size={11} />
        </button>
        <div className="flex-1" />
        {busy ? (
          <Loader2 size={11} className="animate-spin text-muted" />
        ) : (
          transitions.map(({ to, label, color, icon }) => (
            <button
              key={to}
              onClick={() => onMove(to)}
              className={`text-[10px] flex items-center gap-0.5 px-1.5 py-1 rounded ${color}`}
              title={label}
            >
              {icon} {label}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

function nextTransitions(s: AdCreativeStatus): {
  to: AdCreativeStatus; label: string; color: string; icon: React.ReactNode;
}[] {
  switch (s) {
    case 'draft':
      return [
        { to: 'ready',    label: 'Ready',    color: 'bg-success-soft text-success hover:bg-success-soft', icon: <CheckCircle size={9} /> },
        { to: 'archived', label: 'Archive',  color: 'bg-raised text-muted hover:text-fg',                          icon: <Archive size={9} /> },
      ];
    case 'ready':
      return [
        { to: 'pushed',   label: 'Pushed',   color: 'bg-info-soft text-info hover:bg-info-soft',              icon: <Send size={9} /> },
        { to: 'draft',    label: 'Draft',    color: 'bg-raised text-muted hover:text-fg',                          icon: <ArrowRight size={9} className="rotate-180" /> },
      ];
    case 'pushing':
      return [
        { to: 'pushed',   label: 'Pushed',   color: 'bg-info-soft text-info hover:bg-info-soft',              icon: <CheckCircle size={9} /> },
        { to: 'failed',   label: 'Failed',   color: 'bg-danger-soft text-danger hover:bg-danger-fg/25',              icon: <AlertCircle size={9} /> },
      ];
    case 'pushed':
      return [
        { to: 'paused',   label: 'Pause',    color: 'bg-warning-soft text-warning hover:bg-warning-soft',        icon: <PauseCircle size={9} /> },
        { to: 'archived', label: 'Archive',  color: 'bg-raised text-muted hover:text-fg',                          icon: <Archive size={9} /> },
      ];
    case 'paused':
      return [
        { to: 'pushed',   label: 'Resume',   color: 'bg-info-soft text-info hover:bg-info-soft',              icon: <PlayCircle size={9} /> },
        { to: 'archived', label: 'Archive',  color: 'bg-raised text-muted hover:text-fg',                          icon: <Archive size={9} /> },
      ];
    case 'failed':
      return [
        { to: 'ready',    label: 'Retry',    color: 'bg-success-soft text-success hover:bg-success-soft', icon: <RotateCw size={9} /> },
        { to: 'archived', label: 'Archive',  color: 'bg-raised text-muted hover:text-fg',                          icon: <Archive size={9} /> },
      ];
    default:
      return [];
  }
}
