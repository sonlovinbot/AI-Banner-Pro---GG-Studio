// Industry / banner category picker. Loads admin-curated refs for the
// selected industry; user tick/untick which refs feed into the model.
// Hard cap at MAX_REFS actually sent (default 5). Refs are STYLE-ONLY —
// the model must not copy characters, speakers, or specific imagery.

import React from 'react';
import { X, Layers, Info, CheckCircle } from 'lucide-react';
import { RefCategory, RefBanner } from '../../services/refBannersService';

export const MAX_INDUSTRY_REFS = 5;

interface Props {
  industries: RefCategory[];
  selectedIndustry: string;
  onChangeIndustry: (id: string) => void;
  industryRefs: RefBanner[];
  selectedRefIds: Set<string>;
  onChangeSelectedRefIds: (next: Set<string>) => void;
  onClose: () => void;
}

export const IndustryPickerModal: React.FC<Props> = ({
  industries, selectedIndustry, onChangeIndustry,
  industryRefs, selectedRefIds, onChangeSelectedRefIds, onClose,
}) => {
  const selectedCount = industryRefs.filter(r => selectedRefIds.has(r.id)).length;
  const effectiveCount = Math.min(selectedCount, MAX_INDUSTRY_REFS);

  const toggleRef = (id: string) => {
    const next = new Set(selectedRefIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (selectedCount >= MAX_INDUSTRY_REFS) return;
      next.add(id);
    }
    onChangeSelectedRefIds(next);
  };

  const selectAll = () => {
    onChangeSelectedRefIds(new Set(industryRefs.slice(0, MAX_INDUSTRY_REFS).map(r => r.id)));
  };
  const clearAll = () => onChangeSelectedRefIds(new Set());

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
                Chọn ngành → tick refs để AI học phong cách (tối đa {MAX_INDUSTRY_REFS})
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
            <div className="space-y-2.5 border-t border-line pt-4">
              <div className="flex items-start gap-2 bg-warning-soft border border-warning-fg/30 rounded-md px-3 py-2">
                <Info size={12} className="text-warning-fg shrink-0 mt-0.5" />
                <p className="text-[11px] text-fg leading-snug">
                  <b>Style-only:</b> AI chỉ học bố cục, màu sắc, typography, cách sắp xếp
                  của các ref. <b>Không</b> copy nhân vật, mặt speaker, hoặc ảnh cụ thể
                  trong ref.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-fg font-medium">
                  <span className="text-brand">{effectiveCount}</span> / {industryRefs.length} refs nạp vào
                  {selectedCount > MAX_INDUSTRY_REFS && (
                    <span className="text-danger ml-1.5">(max {MAX_INDUSTRY_REFS})</span>
                  )}
                </p>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    onClick={selectAll}
                    disabled={selectedCount >= Math.min(industryRefs.length, MAX_INDUSTRY_REFS)}
                    className="text-brand hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Chọn tối đa
                  </button>
                  <span className="text-subtle">·</span>
                  <button
                    onClick={clearAll}
                    disabled={selectedCount === 0}
                    className="text-muted hover:text-fg hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Bỏ hết
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {industryRefs.map(r => {
                  const on = selectedRefIds.has(r.id);
                  const disabled = !on && selectedCount >= MAX_INDUSTRY_REFS;
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRef(r.id)}
                      disabled={disabled}
                      className={`aspect-square rounded-md border overflow-hidden bg-canvas relative transition-all ${
                        on
                          ? 'border-brand ring-2 ring-brand/30'
                          : disabled
                            ? 'border-line opacity-40 cursor-not-allowed'
                            : 'border-line hover:border-brand/60'
                      }`}
                      title={r.label || ''}
                    >
                      <img src={r.imageUrl} className="w-full h-full object-cover" alt="" />
                      <span className={`absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center ${
                        on ? 'bg-brand text-white' : 'bg-black/50 border border-white/40 text-white/60'
                      }`}>
                        {on && <CheckCircle size={12} />}
                      </span>
                      {r.insights && (
                        <span className="absolute top-1 right-1 text-[9px] bg-brand text-white px-1 rounded">AI</span>
                      )}
                    </button>
                  );
                })}
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
