// Multi-content variants manager. Old inline UI had:
//   - Textareas stacked in the sidebar (took a lot of space)
//   - "Multi-content mode" checkbox with wall of text
//   - Save-to-library / Library buttons scattered
// Now: sidebar shows one primary content + a "N variants" chip that opens
// this modal. Modal handles adding / editing / removing content variants.

import React, { useState } from 'react';
import {
  X, Plus, ListPlus, Save, Trash2, FolderOpen, Sparkles, Tag,
} from 'lucide-react';
import { BrandBrief } from '../../types';

interface Props {
  /** The manual content strings. Index 0 is treated as the "primary" that
   *  also lives in the sidebar textarea. */
  contents: string[];
  onChangeContents: (next: string[]) => void;

  /** Currently-enabled brand briefs — read-only display, user unticks in
   *  the BriefsModal. */
  enabledBriefs: BrandBrief[];
  onUnlinkBrief?: (id: string) => void;

  /** Save a content string to the user's brand snippet library. */
  onSaveSnippet?: (content: string) => void;
  /** Open the existing Brand Content Library modal. */
  onOpenLibrary?: () => void;

  maxContents?: number;
  onClose: () => void;
}

export const MultiContentModal: React.FC<Props> = ({
  contents, onChangeContents,
  enabledBriefs, onUnlinkBrief,
  onSaveSnippet, onOpenLibrary,
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

  const nonEmptyManual = contents.filter(c => c.trim()).length;
  const totalVariants  = nonEmptyManual + enabledBriefs.length;

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
                Mỗi variant = 1 content, sinh N phiên bản (tổng banner tính ở output row)
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
            <span className="text-muted">{nonEmptyManual} manual + {enabledBriefs.length} brief</span>
          </span>
          {onOpenLibrary && (
            <button
              onClick={onOpenLibrary}
              className="text-[11px] flex items-center gap-1 text-muted hover:text-fg hover:underline"
            >
              <FolderOpen size={11} /> Thư viện
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Manual variants */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-subtle uppercase tracking-wider">
              Manual
            </p>
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

          {/* Enabled briefs (read-only summary) */}
          {enabledBriefs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-subtle uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={11} className="text-brand" /> Briefs áp dụng ({enabledBriefs.length})
              </p>
              <div className="space-y-1">
                {enabledBriefs.map(b => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 px-3 py-2 bg-brand/5 border border-brand/20 rounded-md"
                  >
                    <Tag size={11} className="text-brand shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-fg truncate">{b.title}</p>
                      {b.headline && <p className="text-[10px] text-muted truncate">H: {b.headline}</p>}
                    </div>
                    {onUnlinkBrief && (
                      <button
                        onClick={() => onUnlinkBrief(b.id)}
                        className="p-1 text-muted hover:text-danger shrink-0"
                        title="Bỏ brief này khỏi gen"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-subtle">
                Bỏ chọn brief trong <b>Brand briefs</b> modal (chip xanh cạnh brand) để chỉnh mặc định.
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
