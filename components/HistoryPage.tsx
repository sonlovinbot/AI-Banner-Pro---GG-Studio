import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, Maximize2, X, Trash2, Clock, AlertTriangle, Upload, FileJson, Database, Wand2 } from 'lucide-react';
import { HistoryItem, AppPage } from '../types';
import { HistoryEditModal } from './HistoryEditModal';
import {
  getHistory,
  removeFromHistory,
  clearHistory,
  exportHistoryAsJson,
  importHistoryFromJson,
  getEmbeddedHistoryCount,
  importEmbeddedHistory,
  ImportHistoryResult,
} from '../services/storageService';

interface HistoryPageProps {
  onNavigate: (page: AppPage) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onNavigate }) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<HistoryItem | null>(null);
  const [editTarget, setEditTarget] = useState<HistoryItem | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const embeddedCount = getEmbeddedHistoryCount();

  useEffect(() => {
    setItems(getHistory());
  }, []);

  const childCount = (id: string) => items.filter(x => x.parentId === id).length;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showResult = (result: ImportHistoryResult, source: string) => {
    setItems(getHistory());
    if (result.added === 0) {
      setToast({ kind: 'ok', msg: `${source}: không có item mới (${result.skipped} đã tồn tại)` });
    } else {
      setToast({ kind: 'ok', msg: `${source}: +${result.added} item${result.skipped ? `, bỏ qua ${result.skipped} trùng` : ''}` });
    }
  };

  const handleExport = () => {
    if (items.length === 0) return;
    const blob = new Blob([exportHistoryAsJson()], { type: 'application/json' });
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
      const result = importHistoryFromJson(text, 'merge');
      showResult(result, `Import ${file.name}`);
    } catch (e: any) {
      setToast({ kind: 'err', msg: `Import lỗi: ${e?.message || 'JSON không hợp lệ'}` });
    }
  };

  const handleRestoreSnapshot = () => {
    try {
      const result = importEmbeddedHistory('merge');
      showResult(result, 'Snapshot');
    } catch (e: any) {
      setToast({ kind: 'err', msg: `Snapshot lỗi: ${e?.message || 'unknown'}` });
    }
  };

  const handleRemove = (id: string) => {
    removeFromHistory(id);
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleClearAll = () => {
    clearHistory();
    setItems([]);
    setShowClearConfirm(false);
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-slate-200 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onNavigate('menu')}
              className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-emerald-400" />
              <h1 className="text-lg font-bold text-white">History</h1>
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">
                {items.length} banner{items.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
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
            {embeddedCount > 0 && (
              <button
                onClick={handleRestoreSnapshot}
                className="text-xs text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 border border-emerald-500/20"
                title={`Import ${embeddedCount} banner từ snapshot embed trong code`}
              >
                <Database size={14} /> Restore snapshot
                <span className="text-[10px] bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 rounded-full">{embeddedCount}</span>
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-sky-300 hover:text-sky-200 hover:bg-sky-500/10 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              title="Import từ file JSON"
            >
              <Upload size={14} /> Import
            </button>
            {items.length > 0 && (
              <button
                onClick={handleExport}
                className="text-xs text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                title="Export toàn bộ history ra file JSON"
              >
                <FileJson size={14} /> Export
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
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
          <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
            <div className="w-20 h-20 border-4 border-gray-800 border-dashed rounded-xl mb-4 opacity-50"></div>
            <p className="text-lg mb-2">No history yet</p>
            <p className="text-sm text-gray-600">Generated banners will appear here</p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => onNavigate('banner')}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition-colors text-sm"
              >
                Go to Banner Tool
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 border border-sky-500/30 px-6 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
              >
                <Upload size={16} /> Import JSON
              </button>
              {embeddedCount > 0 && (
                <button
                  onClick={handleRestoreSnapshot}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/30 px-6 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
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
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden group hover:border-gray-700 transition-colors"
              >
                <div className="relative aspect-square bg-gray-950">
                  <img
                    src={item.imageUrl}
                    alt="Banner"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => setEditTarget(item)}
                      className="bg-indigo-600 hover:bg-indigo-500 p-2.5 rounded-full text-white transition-all"
                      title="Edit (mở popup chỉnh sửa)"
                    >
                      <Wand2 size={18} />
                    </button>
                    <button
                      onClick={() => setSelectedImage(item)}
                      className="bg-white/10 backdrop-blur-md hover:bg-white/20 p-2.5 rounded-full text-white transition-all"
                      title="View"
                    >
                      <Maximize2 size={18} />
                    </button>
                    <a
                      href={item.imageUrl}
                      download={`banner-${item.id}.png`}
                      className="bg-emerald-600 hover:bg-emerald-500 p-2.5 rounded-full text-white transition-all"
                      title="Download"
                    >
                      <Download size={18} />
                    </a>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="bg-red-600/80 hover:bg-red-500 p-2.5 rounded-full text-white transition-all"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-3 border-t border-gray-800">
                  <p className="text-[11px] text-gray-500 mb-1">{formatDate(item.timestamp)}</p>
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
                    <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{item.aspectRatio}</span>
                    <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{item.quality}</span>
                    {item.model && (
                      <span
                        className="text-[10px] bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/20 truncate max-w-[120px]"
                        title={item.model}
                      >
                        {item.model}
                      </span>
                    )}
                    {item.duration && (
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">
                        {item.duration.toFixed(1)}s
                      </span>
                    )}
                  </div>
                  {item.promptUsed && (
                    <p className="text-[11px] text-gray-500 mt-2 line-clamp-2 leading-relaxed">{item.promptUsed}</p>
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
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            <X size={32} />
          </button>
          <div className="max-w-[95vw] max-h-[90vh] relative">
            <img
              src={selectedImage.imageUrl}
              alt="Full View"
              className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
              <button
                onClick={() => { setEditTarget(selectedImage); setSelectedImage(null); }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-full shadow-lg font-medium flex items-center gap-2"
              >
                <Wand2 size={18} /> Edit
              </button>
              <a
                href={selectedImage.imageUrl}
                download={`banner-full-${selectedImage.id}.png`}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-full shadow-lg font-medium flex items-center gap-2"
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`px-4 py-2.5 rounded-lg shadow-lg text-sm flex items-center gap-2 border ${
              toast.kind === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-red-500/10 border-red-500/30 text-red-200'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-400" />
              <h3 className="text-lg font-bold text-white">Clear All History?</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">
              This will permanently delete all {items.length} saved banners. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors text-sm"
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
