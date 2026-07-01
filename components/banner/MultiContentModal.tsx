// Content variants manager. Combines two variant sources in one place:
//   - Manual content strings (index 0 mirrors the sidebar textarea).
//   - Brand briefs loaded from the selected brand — user ticks which ones
//     count as variants. Merged with manual in the gen plan.
//
// Sidebar shows one primary content + a "N variants" chip that opens this
// modal. The old separate BriefsModal is folded in here.

import React, { useState } from 'react';
import {
  X, Plus, ListPlus, Save, Trash2, FolderOpen, Sparkles, Tag, CheckCircle,
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
  /** The manual content strings. Index 0 is treated as the "primary" that
   *  also lives in the sidebar textarea. */
  contents: string[];
  onChangeContents: (next: string[]) => void;

  /** All brand briefs available for this brand (auto-loaded when brand
   *  applied). Empty when no brand or brand has no briefs. */
  allBriefs: BrandBrief[];
  enabledBriefIds: Set<string>;
  onChangeEnabledBriefIds: (next: Set<string>) => void;

  /** Save a content string to the user's brand snippet library. */
  onSaveSnippet?: (content: string) => void;
  /** Open the existing Brand Content Library modal. */
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
  const [tab, setTab] = useState<'manual' | 'briefs'>('manual');

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
              <h3 className="text-sm font-semibold text-fg">Content variants</h3>
              <p className="text-[11px] text-subtle">
                Mỗi variant = 1 content khác nhau, sinh N phiên bản (tổng ở output row)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={14} />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-line bg-canvas/50 flex items-center justify-between">
          <span className="text-xs text-fg font-medium">
            <span className="text-brand">{totalVariants}</span> variants ·{' '}
            <span className="text-muted">{nonEmptyManual} manual + {enabledCount} brief</span>
          </span>
          {onOpenLibrary && (
            <button
              onClick={onOpenLibrary}
              className="text-[11px] flex items-center gap-1 text-muted hover:text-fg hover:underline"
            >
              <FolderOpen size={11} /> Thư viện content
            </button>
          )}
        </div>

        <div className="px-5 pt-3 border-b border-line flex gap-1">
          <TabButton active={tab === 'manual'} onClick={() => setTab('manual')} label="Manual" count={nonEmptyManual} />
          <TabButton active={tab === 'briefs'} onClick={() => setTab('briefs')} label="Brand briefs" count={enabledCount} total={allBriefs.length} />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'manual' && (
            <div className="space-y-2">
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
                    placeholder={`Content #${idx + 1} — e.g. 'Hè rực rỡ, Sale 50%'`}
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
                        title="Xoá variant"
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
                className="w-full text-xs py-2.5 rounded-md border border-dashed border-line-strong text-muted hover:border-brand/60 hover:text-brand hover:bg-brand/5 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} /> Thêm manual variant
                <span className="text-[10px] text-subtle font-mono">
                  {contents.length}/{maxContents}
                </span>
              </button>
            </div>
          )}

          {tab === 'briefs' && (
            <div className="space-y-3">
              {allBriefs.length === 0 ? (
                <div className="py-8 text-center text-muted text-sm">
                  <Sparkles size={20} className="mx-auto text-subtle mb-2" />
                  <p>Brand chưa có brief nào.</p>
                  <p className="text-[11px] text-subtle mt-1">
                    Vào <b>Brand Style</b> → mở brand → dùng <b>Import từ URL</b> để tạo 10 briefs tự động.
                  </p>
                  {onNavigateToBrandStyle && (
                    <button
                      onClick={() => { onClose(); onNavigateToBrandStyle('brand-style'); }}
                      className="mt-3 text-[11px] px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand-dark"
                    >
                      → Đi tới Brand Style
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-fg font-medium">
                      <span className="text-brand">{enabledCount}</span>/{allBriefs.length} brief chọn
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
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
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {allBriefs.map(b => {
                      const on = enabledBriefIds.has(b.id);
                      return (
                        <button
                          key={b.id}
                          onClick={() => toggleBrief(b.id)}
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
                </>
              )}
            </div>
          )}
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

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  total?: number;
}> = ({ active, onClick, label, count, total }) => (
  <button
    onClick={onClick}
    className={`text-xs px-3 py-2 rounded-t-md border-b-2 transition-colors flex items-center gap-1.5 ${
      active
        ? 'border-brand text-brand font-semibold'
        : 'border-transparent text-muted hover:text-fg'
    }`}
  >
    {label}
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
      active ? 'bg-brand/15 text-brand' : 'bg-raised text-subtle'
    }`}>
      {total != null ? `${count}/${total}` : count}
    </span>
  </button>
);
