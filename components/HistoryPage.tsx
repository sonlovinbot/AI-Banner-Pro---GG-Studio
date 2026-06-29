import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, Maximize2, X, Trash2, Clock, AlertTriangle, Upload, FileJson, Database, Wand2, Cloud, Loader2, Sparkles } from 'lucide-react';
import { HistoryItem, AppPage } from '../types';
import { HistoryEditModal } from './HistoryEditModal';
import { proxiedBannerUrl } from '../services/cdnProxy';
import { setStudioHandoff } from '../services/studioHandoffService';
import {
  getHistory,
  getEmbeddedHistoryCount,
  exportHistoryAsJson,
} from '../services/storageService';
import {
  listHistoryFromCloud,
  removeHistoryFromCloud,
  clearHistoryInCloud,
  bulkAddHistoryToCloud,
} from '../services/historyService';
import { EMBEDDED_HISTORY } from '../data/embeddedHistory';

interface HistoryPageProps {
  onNavigate: (page: AppPage, opts?: { adsTab?: string }) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onNavigate }) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<HistoryItem | null>(null);
  const [editTarget, setEditTarget] = useState<HistoryItem | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string; action?: { label: string; onClick: () => void } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const embeddedCount = getEmbeddedHistoryCount();
  const localCount = getHistory().length;

  const refresh = async () => {
    setLoading(true);
    const cloud = await listHistoryFromCloud();
    setItems(cloud);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const childCount = (id: string) => items.filter(x => x.parentId === id).length;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Brainstorm flow: queue banner attach via localStorage handoff, navigate
   *  to Studio tab via the new `adsTab` opts hint (deterministic — no relying
   *  on localStorage to pick the tab). */
  const handleBrainstormInStudio = (item: HistoryItem) => {
    setStudioHandoff({
      source: 'history',
      bannerIds: [item.id],
    });
    onNavigate('ads-manager', { adsTab: 'studio' });
  };

  const handleExport = () => {
    if (items.length === 0) return;
    const payload = JSON.stringify({
      type: 'banner_pro_history', version: 1, exportedAt: Date.now(),
      count: items.length, items,
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `banner-history-${stamp}-${items.length}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToast({ kind: 'ok', msg: `Đã xuất ${items.length} banner` });
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const incoming: HistoryItem[] = Array.isArray(raw) ? raw : (raw.items || []);
      const result = await bulkAddHistoryToCloud(incoming);
      await refresh();
      setToast({ kind: 'ok', msg: `Import ${file.name}: +${result.inserted} item, bỏ qua ${result.skipped} trùng` });
    } catch (e: any) {
      setToast({ kind: 'err', msg: `Import lỗi: ${e?.message || 'JSON không hợp lệ'}` });
    }
  };

  const handleRestoreSnapshot = async () => {
    try {
      const result = await bulkAddHistoryToCloud(EMBEDDED_HISTORY);
      await refresh();
      setToast({ kind: 'ok', msg: `Snapshot: +${result.inserted} item, bỏ qua ${result.skipped} trùng` });
    } catch (e: any) {
      setToast({ kind: 'err', msg: `Snapshot lỗi: ${e?.message || 'unknown'}` });
    }
  };

  const handleMigrateLocal = async () => {
    setMigrating(true);
    try {
      const local = getHistory();
      if (local.length === 0) {
        setToast({ kind: 'ok', msg: 'Local không có banner cũ để migrate' });
        return;
      }
      const result = await bulkAddHistoryToCloud(local);
      await refresh();
      setToast({ kind: 'ok', msg: `Migrate local: +${result.inserted} item lên cloud, bỏ qua ${result.skipped} trùng` });
    } catch (e: any) {
      setToast({ kind: 'err', msg: `Migrate lỗi: ${e?.message || 'unknown'}` });
    } finally {
      setMigrating(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeHistoryFromCloud(id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (e: any) {
      setToast({ kind: 'err', msg: `Xoá lỗi: ${e?.message}` });
    }
  };

  const handleClearAll = async () => {
    try {
      await clearHistoryInCloud();
      setItems([]);
      setShowClearConfirm(false);
    } catch (e: any) {
      setToast({ kind: 'err', msg: `Clear lỗi: ${e?.message}` });
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col">
      {/* Header */}
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onNavigate('menu')}
              className="p-2 rounded-lg hover:bg-raised transition-colors text-muted hover:text-fg"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-success" />
              <h1 className="text-lg font-bold text-fg">History</h1>
              <span className="text-xs text-success bg-success-soft border border-success-fg/40 px-2 py-1 rounded-full inline-flex items-center gap-1">
                <Cloud size={11} /> {loading ? '...' : items.length} cloud
              </span>
              {/* {localCount} local badge hidden after migration done */}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Migrate local button hidden — migration done */}
            {false && localCount > 0 && (
              <button
                onClick={handleMigrateLocal}
                disabled={migrating}
                className="text-xs text-warning hover:text-warning hover:bg-warning-soft px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 border border-warning-fg/40 disabled:opacity-50"
              >
                {migrating ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
                Migrate local ({localCount})
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = '';
              }}
            />
            {/* Restore snapshot button hidden */}
            {false && embeddedCount > 0 && (
              <button
                onClick={handleRestoreSnapshot}
                className="text-xs text-success hover:text-success hover:bg-success-soft px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 border border-success-fg/40"
              >
                <Database size={14} /> Restore snapshot
                <span className="text-[10px] bg-success-soft text-success px-1.5 py-0.5 rounded-full">{embeddedCount}</span>
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-info hover:text-info hover:bg-info-soft px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              title="Import từ file JSON"
            >
              <Upload size={14} /> Import
            </button>
            {items.length > 0 && (
              <button
                onClick={handleExport}
                className="text-xs text-brand hover:text-brand hover:bg-canvas px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                title="Export toàn bộ history ra file JSON"
              >
                <FileJson size={14} /> Export
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-danger hover:text-danger hover:bg-danger-soft px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Clear All
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-subtle">
            <div className="w-20 h-20 border-4 border-line border-dashed rounded-xl mb-4 opacity-50"></div>
            <p className="text-lg mb-2">No history yet</p>
            <p className="text-sm text-subtle">Generated banners will appear here</p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => onNavigate('banner')}
                className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg transition-colors text-sm"
              >
                Go to Banner Tool
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-info-soft hover:bg-info-soft text-info border border-info-fg/40 px-6 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
              >
                <Upload size={16} /> Import JSON
              </button>
              {/* Restore snapshot button hidden */}
              {false && embeddedCount > 0 && (
                <button
                  onClick={handleRestoreSnapshot}
                  className="bg-success-soft hover:bg-success-soft text-success border border-success-fg/40 px-6 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
                >
                  <Database size={16} /> Restore snapshot ({embeddedCount})
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map(item => (
              <div
                key={item.id}
                className="bg-surface border border-line rounded-xl overflow-hidden group hover:border-line-strong transition-colors"
              >
                <div className="relative aspect-square bg-canvas">
                  <img
                    src={proxiedBannerUrl(item.imageUrl)}
                    alt="Banner"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 transition-colors flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                    <div className="flex items-center justify-center gap-2">
                      <ThumbAction
                        kind="primary"
                        icon={<Sparkles size={18} />}
                        label="Brainstorm"
                        title="Brainstorm copy với AI ở Studio (banner tự attach)"
                        onClick={() => handleBrainstormInStudio(item)}
                      />
                      <ThumbAction
                        kind="neutral"
                        icon={<Wand2 size={18} />}
                        label="Edit"
                        title="Chỉnh sửa prompt + version mới"
                        onClick={() => setEditTarget(item)}
                      />
                      <ThumbAction
                        kind="neutral"
                        icon={<Maximize2 size={18} />}
                        label="Xem"
                        title="Phóng to xem chi tiết"
                        onClick={() => setSelectedImage(item)}
                      />
                      <ThumbAction
                        kind="neutral"
                        icon={<Download size={18} />}
                        label="Tải"
                        title="Tải ảnh về máy"
                        as="a"
                        href={proxiedBannerUrl(item.imageUrl)}
                        downloadName={`banner-${item.id}.png`}
                      />
                      <ThumbAction
                        kind="danger"
                        icon={<Trash2 size={18} />}
                        label="Xoá"
                        title="Xoá banner khỏi history"
                        onClick={() => handleRemove(item.id)}
                      />
                    </div>
                  </div>
                </div>
                <div className="p-3 border-t border-line">
                  <p className="text-[11px] text-subtle mb-1">{formatDate(item.timestamp)}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.version && item.version > 1 && (
                      <span
                        className="text-[10px] bg-purple-500/20 text-purple-200 px-1.5 py-0.5 rounded border border-purple-500/30 font-mono"
                        title={`Phiên bản v${item.version}, edit từ ${item.parentId?.slice(0,6) || '?'}`}
                      >
                        v{item.version}
                      </span>
                    )}
                    {childCount(item.id) > 0 && (
                      <span
                        className="text-[10px] bg-rose-500/10 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/20"
                        title={`${childCount(item.id)} bản chỉnh sửa từ banner này`}
                      >
                        +{childCount(item.id)} edits
                      </span>
                    )}
                    <span className="text-[10px] bg-raised text-muted px-1.5 py-0.5 rounded">{item.aspectRatio}</span>
                    <span className="text-[10px] bg-raised text-muted px-1.5 py-0.5 rounded">{item.quality}</span>
                    {item.model && (
                      <span
                        className="text-[10px] bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/20 truncate max-w-[120px]"
                        title={item.model}
                      >
                        {item.model}
                      </span>
                    )}
                    {item.duration && (
                      <span className="text-[10px] bg-canvas text-brand px-1.5 py-0.5 rounded border border-brand/20">
                        {item.duration.toFixed(1)}s
                      </span>
                    )}
                  </div>
                  {item.promptUsed && (
                    <p className="text-[11px] text-subtle mt-2 line-clamp-2 leading-relaxed">{item.promptUsed}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox (view only) */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4">
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-muted hover:text-fg p-2 rounded-full hover:bg-raised transition-colors"
          >
            <X size={32} />
          </button>
          <div className="max-w-[95vw] max-h-[90vh] relative">
            <img
              src={proxiedBannerUrl(selectedImage.imageUrl)}
              alt="Full View"
              className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
              <button
                onClick={() => { setEditTarget(selectedImage); setSelectedImage(null); }}
                className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-full shadow-lg font-medium flex items-center gap-2"
              >
                <Wand2 size={18} /> Edit
              </button>
              <a
                href={proxiedBannerUrl(selectedImage.imageUrl)}
                download={`banner-full-${selectedImage.id}.png`}
                className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-full shadow-lg font-medium flex items-center gap-2"
              >
                <Download size={18} /> Download
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <HistoryEditModal
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={() => setItems(getHistory())}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2">
          <div
            className={`px-4 py-3 rounded-lg shadow-2xl text-sm flex items-center gap-3 border-2 backdrop-blur-md ${
              toast.kind === 'ok'
                ? 'bg-success-soft border-success-fg/50 text-fg'
                : 'bg-danger-soft border-danger-fg/50 text-fg'
            }`}
          >
            <span className="text-base">{toast.kind === 'ok' ? '✓' : '✕'}</span>
            <span className="font-medium">{toast.msg}</span>
            {toast.action && (
              <button
                onClick={() => { toast.action!.onClick(); setToast(null); }}
                className="ml-2 text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded font-semibold transition-colors"
              >
                {toast.action.label} →
              </button>
            )}
            <button
              onClick={() => setToast(null)}
              className="ml-1 opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-danger" />
              <h3 className="text-lg font-bold text-fg">Clear All History?</h3>
            </div>
            <p className="text-sm text-muted mb-6">
              This will permanently delete all {items.length} saved banners. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg bg-raised text-fg hover:bg-raised-2 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg bg-danger-fg text-white hover:bg-danger-fg transition-colors text-sm"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ────────────── Thumbnail action button ──────────────

interface ThumbActionProps {
  kind: 'primary' | 'neutral' | 'danger';
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick?: () => void;
  as?: 'button' | 'a';
  href?: string;
  downloadName?: string;
}

/** Hover-reveals a label under the icon so the action is self-explanatory. */
const ThumbAction: React.FC<ThumbActionProps> = ({
  kind, icon, label, title, onClick, as = 'button', href, downloadName,
}) => {
  // Color discipline: 1 primary (brand), 1 neutral, 1 danger — clearly readable on hover.
  const baseColor =
    kind === 'primary' ? 'bg-brand hover:bg-brand-dark text-white' :
    kind === 'danger'  ? 'text-white' :
                         'bg-white/15 hover:bg-white/25 text-white backdrop-blur';
  const dangerStyle = kind === 'danger' ? { background: 'var(--danger-fg)' } as React.CSSProperties : undefined;
  const labelClass =
    kind === 'primary' ? 'text-white font-semibold' :
    kind === 'danger'  ? 'text-white font-semibold' :
                         'text-white/90 font-medium';

  const inner = (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`p-2.5 rounded-full transition-all ${baseColor}`}
        style={dangerStyle}
      >
        {icon}
      </div>
      <span className={`text-[10px] tracking-wide uppercase ${labelClass}`}>{label}</span>
    </div>
  );

  if (as === 'a') {
    return (
      <a href={href} download={downloadName} title={title} className="block">
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} title={title} type="button">
      {inner}
    </button>
  );
};
