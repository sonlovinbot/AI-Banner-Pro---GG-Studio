import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Palette, Loader2 } from 'lucide-react';
import { BrandProject } from '../../types';
import { listBrandProjectsFromCloud } from '../../services/brandProjectService';

interface Props {
  selectedId?: string;
  onClose: () => void;
  onConfirm: (project: BrandProject) => void;
}

export const BrandPickerModal: React.FC<Props> = ({ selectedId, onClose, onConfirm }) => {
  const [projects, setProjects] = useState<BrandProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string | undefined>(selectedId);

  useEffect(() => {
    listBrandProjectsFromCloud().then(p => {
      setProjects(p);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.brandInfo || '').toLowerCase().includes(q) ||
      (p.eventInfo || '').toLowerCase().includes(q),
    );
  }, [projects, search]);

  const confirm = () => {
    const p = projects.find(x => x.id === picked);
    if (p) onConfirm(p);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
          <div className="flex items-center gap-3">
            <div className="bg-brand text-white p-2 rounded-lg">
              <Palette size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Nạp Brand vào ngữ cảnh</h3>
              <p className="text-[11px] text-subtle">Brand info + product + style sẽ tự ghép vào system prompt</p>
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
              placeholder="Tìm brand theo tên / mô tả..."
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
            <div className="text-center py-12 text-muted text-sm">
              {projects.length === 0
                ? 'Chưa có Brand nào. Vào trang Brand Style để tạo.'
                : 'Không tìm thấy brand khớp.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => {
                const active = picked === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPicked(p.id)}
                    className={`w-full flex gap-3 text-left p-3 rounded-lg border transition-all ${
                      active
                        ? 'bg-canvas border-brand ring-2 ring-brand/30'
                        : 'bg-surface border-line hover:border-line-strong'
                    }`}
                  >
                    {p.logo?.url ? (
                      <img src={p.logo.url} alt="" className="w-12 h-12 object-cover rounded border border-line shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-brand text-white flex items-center justify-center text-sm font-bold shrink-0">
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-fg truncate">{p.name}</p>
                      <p className="text-[11px] text-muted line-clamp-2 mt-0.5">
                        {p.brandInfo?.slice(0, 200) || 'Chưa có brand info'}
                      </p>
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {p.styleReferences?.length > 0 && (
                          <span className="text-[10px] bg-raised text-muted px-1.5 py-0.5 rounded">
                            {p.styleReferences.length} style refs
                          </span>
                        )}
                        {p.productReferences?.length > 0 && (
                          <span className="text-[10px] bg-raised text-muted px-1.5 py-0.5 rounded">
                            {p.productReferences.length} products
                          </span>
                        )}
                        {p.eventInfo && (
                          <span className="text-[10px] bg-raised text-muted px-1.5 py-0.5 rounded">
                            event/product info
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between px-5 py-3 border-t border-line bg-surface/60">
          <span className="text-xs text-subtle">{projects.length} brand · {picked ? 'đã chọn 1' : 'chưa chọn'}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs px-4 py-2 rounded-md bg-raised hover:bg-raised-2 text-fg">
              Huỷ
            </button>
            <button
              onClick={confirm}
              disabled={!picked}
              className="text-sm px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
            >
              Nạp vào chat
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

/** Build a compact brand context string to prepend to the system prompt. */
export function buildBrandContext(p: BrandProject): string {
  const parts: string[] = [];
  parts.push('=== BRAND CONTEXT ===');
  parts.push(`Brand name: ${p.name}`);
  if (p.brandInfo?.trim()) {
    parts.push(`\nBrand info:\n${p.brandInfo.trim()}`);
  }
  if (p.eventInfo?.trim()) {
    parts.push(`\nProduct / event:\n${p.eventInfo.trim()}`);
  }
  if (p.jsonPrompt?.trim()) {
    parts.push(`\nStyle prompt (visual reference):\n${p.jsonPrompt.trim()}`);
  }
  parts.push('\nKhi viết copy, hãy bám brand voice + USP của brand này. Không phá brand identity.');
  parts.push('======================');
  return parts.join('\n');
}
