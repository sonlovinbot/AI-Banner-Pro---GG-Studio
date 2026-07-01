// Popup for picking which brand briefs to feed into the multi-content gen.
// Was previously an inline expanded card in BannerTool sidebar — took too
// much vertical space + made the sidebar scroll heavy. Now shown as a modal
// triggered from the BrandRow chip.

import React from 'react';
import { X, CheckCircle, Sparkles, Tag } from 'lucide-react';
import { BrandBrief, BriefType, AppPage } from '../../types';

const TYPE_ABBR: Partial<Record<BriefType, string>> = {
  'offer-emphasis':       'OFFER',
  'instructor-authority': 'INSTR',
  'catchy-headline':      'HOOK',
  'neutral-info':         'INFO',
  'social-proof':         'PROOF',
  'urgency-fomo':         'URGE',
  'problem-solution':     'PROB',
  'benefit-led':          'BENE',
  'aspirational':         'ASPIR',
  'question-hook':        'QUES',
};

interface Props {
  briefs: BrandBrief[];
  enabledIds: Set<string>;
  onChangeEnabled: (next: Set<string>) => void;
  onClose: () => void;
  onNavigateToBrandStyle?: (page: AppPage) => void;
}

export const BriefsModal: React.FC<Props> = ({
  briefs, enabledIds, onChangeEnabled, onClose, onNavigateToBrandStyle,
}) => {
  const enabledCount = enabledIds.size;

  const toggle = (id: string) => {
    const next = new Set(enabledIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChangeEnabled(next);
  };

  const selectAll = () => onChangeEnabled(new Set(briefs.map(b => b.id)));
  const clearAll  = () => onChangeEnabled(new Set());

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-canvas border border-line rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-brand/15 text-brand p-2 rounded-md border border-brand/30">
              <Sparkles size={14} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Brand briefs</h3>
              <p className="text-[11px] text-subtle">
                Chọn brief muốn dùng cho gen này — mỗi brief = 1 content variant
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-raised text-muted hover:text-fg"
          >
            <X size={14} />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-line bg-canvas/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-fg font-medium">
              <span className="text-brand">{enabledCount}</span>/{briefs.length} chọn
            </span>
            <span className="text-subtle">·</span>
            <button
              onClick={selectAll}
              disabled={enabledCount === briefs.length}
              className="text-brand hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Tất cả
            </button>
            <span className="text-subtle">·</span>
            <button
              onClick={clearAll}
              disabled={enabledCount === 0}
              className="text-muted hover:text-fg hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Bỏ hết
            </button>
          </div>
          {onNavigateToBrandStyle && (
            <button
              onClick={() => { onClose(); onNavigateToBrandStyle('brand-style'); }}
              className="text-[11px] text-muted hover:text-fg hover:underline"
              title="Sửa nội dung brief hoặc regen từ URL"
            >
              ✎ Sửa brief tại Brand Style
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {briefs.length === 0 ? (
            <div className="py-12 text-center text-muted text-sm">
              <p>Brand này chưa có brief nào.</p>
              <p className="text-[11px] text-subtle mt-1">
                Vào <b>Brand Style</b> → mở brand → dùng <b>Import từ URL</b> để tạo 10 briefs tự động.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {briefs.map(b => {
                const on = enabledIds.has(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggle(b.id)}
                    className={`w-full text-left rounded-md border p-3 transition-colors ${
                      on
                        ? 'bg-brand/10 border-brand/50'
                        : 'bg-canvas border-line hover:bg-raised'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center ${
                        on ? 'bg-brand text-white' : 'border border-line bg-surface'
                      }`}>
                        {on && <CheckCircle size={12} />}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-fg leading-tight">{b.title}</p>
                          <span className="text-[9px] font-mono uppercase text-subtle bg-raised border border-line px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                            <Tag size={8} /> {TYPE_ABBR[b.briefType] || b.briefType}
                          </span>
                        </div>
                        {b.headline && (
                          <p className="text-[12px] text-fg/80 leading-snug line-clamp-2">
                            <span className="text-subtle font-mono mr-1">H:</span>{b.headline}
                          </p>
                        )}
                        {b.primaryText && (
                          <p className="text-[11px] text-muted leading-snug line-clamp-2">
                            {b.primaryText}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line bg-surface flex items-center justify-between">
          <p className="text-[11px] text-subtle">
            Áp dụng ngay — không cần Save
          </p>
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
