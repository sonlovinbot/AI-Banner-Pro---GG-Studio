// Content variants manager — one scroll, two stacked sections:
//   1. Manual biến thể (textareas, index 0 mirrors sidebar primary)
//   2. Brand briefs (compact ticklist beneath manual)
//
// Old design had tabs which added a click; both sources feed the same
// output count so they belong on one page.

import React, { useState } from 'react';
import {
  X, Plus, ListPlus, Save, Trash2, FolderOpen, Sparkles, CheckCircle,
} from 'lucide-react';
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
  contents: string[];
  onChangeContents: (next: string[]) => void;

  allBriefs: BrandBrief[];
  enabledBriefIds: Set<string>;
  onChangeEnabledBriefIds: (next: Set<string>) => void;

  onSaveSnippet?: (content: string) => void;
  onOpenLibrary?: () => void;
  onNavigateToBrandStyle?: (page: AppPage) => void;

  maxContents?: number;
  onClose: () => void;
}

export const MultiContentModal: React.FC<Props> = ({
  contents, onChangeContents,
  allBriefs, enabledBriefIds, onChangeEnabledBriefIds,
  onSaveSnippet, onOpenLibrary, onNavigateToBrandStyle,
  maxContents = 5,
  onClose,
}) => {
  const [focused, setFocused] = useState<number | null>(null);

  const setContent = (idx: number, v: string) => {
    onChangeContents(contents.map((c, i) => (i === idx ? v : c)));
  };
  const addContent = () => {
    if (contents.length >= maxContents) return;
    onChangeContents([...contents, '']);
    setFocused(contents.length);
  };
  const removeContent = (idx: number) => {
    onChangeContents(contents.filter((_, i) => i !== idx));
  };

  const toggleBrief = (id: string) => {
    const next = new Set(enabledBriefIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChangeEnabledBriefIds(next);
  };
  const enableAllBriefs = () => onChangeEnabledBriefIds(new Set(allBriefs.map(b => b.id)));
  const clearBriefs     = () => onChangeEnabledBriefIds(new Set());

  const nonEmptyManual = contents.filter(c => c.trim()).length;
  const enabledCount   = enabledBriefIds.size;
  const totalVariants  = nonEmptyManual + enabledCount;

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
              <ListPlus size={14} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Biến thể nội dung</h3>
              <p className="text-[11px] text-subtle">
                Mỗi biến thể = 1 nội dung khác nhau. Số bản/biến thể ở panel Đầu ra.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={14} />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-line bg-canvas/50 flex items-center justify-between">
          <span className="text-xs text-fg font-medium">
            Tổng <span className="text-brand">{totalVariants}</span> biến thể ·{' '}
            <span className="text-muted">{nonEmptyManual} tay + {enabledCount} brief</span>
          </span>
          {onOpenLibrary && (
            <button
              onClick={onOpenLibrary}
              className="text-[11px] flex items-center gap-1 text-muted hover:text-fg hover:underline"
            >
              <FolderOpen size={11} /> Thư viện nội dung
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ─── Manual ─── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-subtle uppercase tracking-wider">
                Nội dung tay ({nonEmptyManual}/{maxContents})
              </p>
            </div>
            {contents.map((c, idx) => (
              <div
                key={idx}
                className={`relative rounded-md border transition-colors ${
                  focused === idx ? 'border-brand bg-brand/5' : 'border-line bg-canvas hover:bg-raised/40'
                }`}
              >
                <textarea
                  autoFocus={focused === idx}
                  value={c}
                  onChange={(e) => setContent(idx, e.target.value)}
                  onFocus={() => setFocused(idx)}
                  onBlur={() => setFocused(null)}
                  placeholder={`Nội dung #${idx + 1} — VD: 'Hè rực rỡ, Sale 50%'`}
                  className="w-full bg-transparent px-3 py-2.5 pr-16 text-sm text-fg focus:outline-none rounded-md resize-none h-16"
                />
                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                  <span className="text-[10px] text-subtle font-mono bg-surface border border-line px-1.5 py-0.5 rounded">
                    #{idx + 1}
                  </span>
                  {onSaveSnippet && (
                    <button
                      onClick={() => onSaveSnippet(c)}
                      disabled={!c.trim()}
                      className="p-1 text-muted hover:text-success disabled:opacity-30 disabled:hover:text-muted"
                      title="Lưu vào thư viện"
                    >
                      <Save size={11} />
                    </button>
                  )}
                  {contents.length > 1 && (
                    <button
                      onClick={() => removeContent(idx)}
                      className="p-1 text-muted hover:text-danger"
                      title="Xoá biến thể"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={addContent}
              disabled={contents.length >= maxContents}
              className="w-full text-xs py-2 rounded-md border border-dashed border-line-strong text-muted hover:border-brand/60 hover:text-brand hover:bg-brand/5 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={12} /> Thêm nội dung tay
              <span className="text-[10px] text-subtle font-mono">
                {contents.length}/{maxContents}
              </span>
            </button>
          </section>

          {/* ─── Brand briefs (compact, below manual) ─── */}
          <section className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-subtle uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={11} className="text-brand" />
                Brand briefs ({enabledCount}/{allBriefs.length})
              </p>
              {allBriefs.length > 0 && (
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    onClick={enableAllBriefs}
                    disabled={enabledCount === allBriefs.length}
                    className="text-brand hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Tất cả
                  </button>
                  <span className="text-subtle">·</span>
                  <button
                    onClick={clearBriefs}
                    disabled={enabledCount === 0}
                    className="text-muted hover:text-fg hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Bỏ hết
                  </button>
                  {onNavigateToBrandStyle && (
                    <>
                      <span className="text-subtle">·</span>
                      <button
                        onClick={() => { onClose(); onNavigateToBrandStyle('brand-style'); }}
                        className="text-muted hover:text-fg hover:underline"
                        title="Sửa nội dung brief"
                      >
                        ✎ Sửa
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {allBriefs.length === 0 ? (
              <div className="text-center py-4 text-[11px] text-subtle italic border border-dashed border-line rounded-md">
                Brand này chưa có brief. Vào <b>Brand Style</b> → Import từ URL để tạo 10 briefs.
              </div>
            ) : (
              <div className="space-y-1">
                {allBriefs.map(b => {
                  const on = enabledBriefIds.has(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggleBrief(b.id)}
                      className={`w-full text-left rounded-md border p-2 transition-colors flex items-start gap-2 ${
                        on ? 'bg-brand/10 border-brand/40' : 'bg-canvas border-line hover:bg-raised'
                      }`}
                    >
                      <span className={`shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center ${
                        on ? 'bg-brand text-white' : 'border border-line bg-surface'
                      }`}>
                        {on && <CheckCircle size={11} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] font-medium text-fg leading-tight truncate">{b.title}</p>
                          <span className="text-[9px] font-mono uppercase text-subtle bg-raised border border-line px-1 py-px rounded shrink-0">
                            {TYPE_ABBR[b.briefType] || b.briefType}
                          </span>
                        </div>
                        {b.headline && (
                          <p className="text-[11px] text-fg/70 leading-snug line-clamp-1 mt-0.5">
                            <span className="text-subtle font-mono mr-1">H:</span>{b.headline}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-line bg-surface flex items-center justify-between">
          <p className="text-[11px] text-subtle">Áp dụng ngay — không cần Save</p>
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
