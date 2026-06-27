import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Image as ImageIcon, Loader2 } from 'lucide-react';
import { HistoryItem } from '../../types';
import { listHistoryFromCloud } from '../../services/historyService';
import { proxiedBannerUrl } from '../../services/cdnProxy';

interface Props {
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (banners: HistoryItem[]) => void;
}

export const BannerPickerModal: React.FC<Props> = ({ selectedIds, onClose, onConfirm }) => {
  const [banners, setBanners] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedIds));

  useEffect(() => {
    listHistoryFromCloud().then(b => { setBanners(b); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return banners;
    const q = search.toLowerCase();
    return banners.filter(b =>
      (b.promptUsed || '').toLowerCase().includes(q) ||
      b.model.toLowerCase().includes(q) ||
      b.aspectRatio.includes(q),
    );
  }, [banners, search]);

  const toggle = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    const map = new Map(banners.map(b => [b.id, b]));
    const out = Array.from(picked).map(id => map.get(id)).filter((b): b is HistoryItem => !!b);
    onConfirm(out);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
          <div className="flex items-center gap-3">
            <div className="bg-brand/10 text-brand p-2 rounded-md border border-brand/30">
              <ImageIcon size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Chọn banner từ History</h3>
              <p className="text-[11px] text-subtle">{picked.size} đã chọn — AI sẽ "nhìn" được banner để viết content</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-line">
          <div className="flex items-center gap-2 bg-surface border border-line rounded-md px-3 py-1.5">
            <Search size={14} className="text-muted" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo prompt / model / aspect..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted hover:text-fg">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">Không tìm thấy banner.</div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(b => {
                const sel = picked.has(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggle(b.id)}
                    className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                      sel ? 'border-brand ring-2 ring-brand/40' : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <img
                      src={proxiedBannerUrl(b.imageUrl)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {sel && (
                      <div className="absolute top-1 right-1 bg-brand text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">
                        ✓
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[9px] text-white/90 truncate">{b.aspectRatio} · {b.quality}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between px-5 py-3 border-t border-line bg-surface/60">
          <span className="text-xs text-subtle">{picked.size}/{banners.length} chọn</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs px-4 py-2 rounded-md bg-raised hover:bg-raised-2 text-fg">
              Huỷ
            </button>
            <button
              onClick={confirm}
              className="text-xs px-4 py-2 rounded-md bg-brand hover:bg-brand-dark text-white font-medium shadow-pop"
            >
              Xác nhận ({picked.size})
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
