// Industry / banner category picker — moved out of sidebar into a modal.
// Shows current selection + admin-curated ref thumbnails + limit slider.

import React from 'react';
import { X, Layers } from 'lucide-react';
import { RefCategory, RefBanner } from '../../services/refBannersService';

interface Props {
  industries: RefCategory[];
  selectedIndustry: string;
  onChangeIndustry: (id: string) => void;
  industryRefs: RefBanner[];
  industryRefLimit: number;
  onChangeLimit: (n: number) => void;
  onClose: () => void;
}

export const IndustryPickerModal: React.FC<Props> = ({
  industries, selectedIndustry, onChangeIndustry,
  industryRefs, industryRefLimit, onChangeLimit, onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-canvas border border-line rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-brand/15 text-brand p-2 rounded-md border border-brand/30">
              <Layers size={14} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Ngành / Loại banner</h3>
              <p className="text-[11px] text-subtle">
                Chọn ngành → hệ thống nạp ref banner curated + insights
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={14} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onChangeIndustry('')}
              className={`text-xs px-3 py-2.5 rounded-md border text-left transition-colors ${
                selectedIndustry === ''
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-line bg-canvas hover:bg-raised text-fg'
              }`}
            >
              — Không dùng —
            </button>
            {industries.map(c => (
              <button
                key={c.id}
                onClick={() => onChangeIndustry(c.id)}
                className={`text-xs px-3 py-2.5 rounded-md border text-left transition-colors flex items-center gap-2 ${
                  selectedIndustry === c.id
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-line bg-canvas hover:bg-raised text-fg'
                }`}
              >
                <span className="text-base">{c.emoji}</span>
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>

          {selectedIndustry && industryRefs.length > 0 && (
            <div className="space-y-2 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-fg font-medium">
                  Hệ thống nạp <span className="text-brand">{Math.min(industryRefLimit, industryRefs.length)}</span>
                  {' '}/ {industryRefs.length} refs
                </p>
                <select
                  value={industryRefLimit}
                  onChange={(e) => onChangeLimit(Number(e.target.value))}
                  className="text-xs bg-canvas border border-line rounded px-2 py-1 focus:outline-none focus:border-brand"
                >
                  {[1, 2, 3].map(n => <option key={n} value={n}>{n} ref</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {industryRefs.slice(0, industryRefLimit).map(r => (
                  <div key={r.id} className="aspect-square rounded border border-line overflow-hidden bg-canvas relative" title={r.label || ''}>
                    <img src={r.imageUrl} className="w-full h-full object-cover" alt="" />
                    {r.insights && (
                      <span className="absolute top-1 right-1 text-[9px] bg-brand text-white px-1 rounded">AI</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedIndustry && industryRefs.length === 0 && (
            <div className="border-t border-line pt-4">
              <p className="text-xs text-muted italic">
                Ngành này chưa có ref banner nào. Admin (son@lovinbot.ai) cần upload trước ở
                Settings → Refs (Admin).
              </p>
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line bg-surface flex justify-end">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white font-semibold"
          >
            Xong
          </button>
        </footer>
      </div>
    </div>
  );
};
