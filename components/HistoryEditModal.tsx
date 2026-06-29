import React, { useRef, useState, useEffect } from 'react';
import { X, Upload, Wand2, RefreshCw, Maximize2, Download, Clipboard, AlertCircle } from 'lucide-react';
import { HistoryItem, UploadedImage } from '../types';
import {
  fileToUploadedImage,
  extractImageFiles,
  filesToFileList,
  dataUrlOrUrlToUploadedImage,
  readImagesFromClipboard,
} from '../services/imageUtils';
import { getActiveBackend } from '../services/storageService';
import { addHistoryToCloud } from '../services/historyService';
import { proxiedBannerUrl } from './../services/cdnProxy';
import { generateBannerWithGemini } from '../services/geminiService';
import { generateBannerWithCoachio, getCoachioApiKey } from '../services/coachioService';

const MAX_EXTRAS = 3;

const ASPECT_OPTIONS = ['1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '5:4'];
const QUALITY_OPTIONS = ['1K', '2K', '4K'];

const DEFAULT_GEMINI_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_COACHIO_MODEL = 'gpt_image_2';

interface HistoryEditModalProps {
  item: HistoryItem;
  onClose: () => void;
  onUpdated?: () => void;
}

export const HistoryEditModal: React.FC<HistoryEditModalProps> = ({ item, onClose, onUpdated }) => {
  const [prompt, setPrompt] = useState('');
  const [extras, setExtras] = useState<UploadedImage[]>([]);
  const [aspectRatio, setAspectRatio] = useState<string>(item.aspectRatio || '1:1');
  const [quality, setQuality] = useState<string>(item.quality || '1K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ imageUrl: string; promptUsed: string; duration: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const backend = getActiveBackend();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addExtraFiles = async (files: FileList | File[]) => {
    const room = Math.max(0, MAX_EXTRAS - extras.length);
    if (room === 0) return;
    const toLoad = Array.from(files as any as Iterable<File>).slice(0, room);
    const loaded = await Promise.all(toLoad.map(fileToUploadedImage));
    setExtras(prev => [...prev, ...loaded]);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = extractImageFiles(e.clipboardData?.items);
    if (files.length === 0) return;
    e.preventDefault();
    addExtraFiles(filesToFileList(files));
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    setIsGenerating(true);
    setProgress('Preparing reference...');

    const source = proxiedBannerUrl(generated?.imageUrl || item.imageUrl);
    const base = await dataUrlOrUrlToUploadedImage(source, `base-${item.id}.png`);

    if (!base) {
      setErrorMsg('Không tải được ảnh gốc làm reference (CORS hoặc URL không truy cập được). Hãy upload lại ảnh thay thế.');
      setIsGenerating(false);
      return;
    }

    if (backend === 'coachio' && !getCoachioApiKey()) {
      setErrorMsg('Coachio API key chưa cấu hình. Vào API Settings ở menu chính.');
      setIsGenerating(false);
      return;
    }

    const referenceImage = base;
    const productImage = extras[0] ?? base;
    const extraRefs = extras.slice(extras[0] ? 1 : 0);

    const adj = prompt.trim();
    const editLine = adj ? `EDIT INSTRUCTION: ${adj}.` : '';
    const combinedPrompt = [
      'You are revising a previously generated banner. Use the FIRST image as the strict style/composition reference; respect its color palette, layout, and typography vibe.',
      'If a second image is provided, integrate it as the new product/focus.',
      'If additional reference images follow, treat them as supplementary style cues.',
      editLine,
      item.promptUsed ? `Original prompt context: ${item.promptUsed}` : '',
    ].filter(Boolean).join('\n');

    try {
      const start = Date.now();
      let imageUrl: string;

      // Pick a model that matches the ACTIVE backend.
      // The history item's recorded model might belong to the other backend.
      const isItemCoachioModel = item.model === 'gpt_image_2' || item.model === 'google_image_gen_banana_pro';
      const isItemGeminiModel = item.model?.startsWith('gemini');
      const modelForBackend = backend === 'coachio'
        ? (isItemCoachioModel ? item.model : DEFAULT_COACHIO_MODEL)
        : (isItemGeminiModel ? item.model : DEFAULT_GEMINI_MODEL);

      if (backend === 'coachio') {
        setProgress('Calling Coachio...');
        imageUrl = await generateBannerWithCoachio(
          referenceImage, productImage, combinedPrompt, '',
          aspectRatio, quality, modelForBackend,
          (s) => setProgress(s),
          extraRefs,
        );
      } else {
        setProgress('Calling Gemini...');
        imageUrl = await generateBannerWithGemini(
          referenceImage, productImage, combinedPrompt, '',
          aspectRatio, modelForBackend, quality,
          extraRefs,
        );
      }

      const duration = (Date.now() - start) / 1000;
      const newId = Math.random().toString(36).substring(7);

      const rootParentId = item.parentId || item.id;
      const nextVersion = (item.version ?? 1) + 1;

      let persistedUrl = imageUrl;
      try {
        const saved = await addHistoryToCloud({
          id: newId,
          imageUrl,
          promptUsed: combinedPrompt,
          timestamp: Date.now(),
          duration,
          model: modelForBackend,
          quality,
          aspectRatio,
          parentId: rootParentId,
          version: nextVersion,
        });
        persistedUrl = saved.imageUrl;
        onUpdated?.();
      } catch (e) {
        console.warn('addHistoryToCloud failed (still showing result)', e);
      }

      setGenerated({ imageUrl: persistedUrl, promptUsed: combinedPrompt, duration });
      setPrompt('');
      setExtras([]);
    } catch (err: any) {
      console.error('Edit regenerate failed', err);
      setErrorMsg(err?.message || 'Tạo lại banner thất bại');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  const displayUrl = proxiedBannerUrl(generated?.imageUrl || item.imageUrl);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-canvas border border-line rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
          <div className="flex items-center gap-3">
            <div className="bg-brand/20 text-brand p-2 rounded-md border border-brand/30">
              <Wand2 size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                Edit banner
                {item.version && item.version > 1 && (
                  <span className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-full px-2 py-0.5 font-mono">v{item.version}</span>
                )}
              </h3>
              <p className="text-[11px] text-subtle">
                Sửa prompt + thêm ảnh tham chiếu → tạo lại bằng backend đang active ({backend === 'coachio' ? 'Coachio' : 'Gemini'}).
                {item.parentId && <span className="text-purple-300/80"> · Chỉnh sửa từ banner gốc <span className="font-mono">{item.parentId.slice(0,6)}</span></span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          {/* Left: preview */}
          <div className="bg-canvas border-r border-line p-5 flex flex-col items-center gap-3 overflow-y-auto">
            <div className="relative w-full max-w-[480px] aspect-square bg-surface rounded-lg overflow-hidden border border-line flex items-center justify-center">
              {isGenerating ? (
                <div className="flex flex-col items-center gap-2 text-brand text-sm">
                  <RefreshCw size={28} className="animate-spin" />
                  <span>{progress || 'Generating...'}</span>
                </div>
              ) : (
                <img src={displayUrl} alt="Banner" className="w-full h-full object-contain" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={displayUrl}
                download={`banner-${(generated ? 'edited' : 'history')}-${item.id}.png`}
                className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-md flex items-center gap-1.5"
              >
                <Download size={12} /> Tải về
              </a>
              {generated && (
                <span className="text-[11px] bg-success-soft text-success border border-success-fg/40 px-2 py-1 rounded-full">
                  Bản chỉnh sửa · {generated.duration.toFixed(1)}s
                </span>
              )}
            </div>
            <p className="text-[11px] text-subtle text-center max-w-[480px] leading-relaxed">
              {item.aspectRatio} · {item.quality} · {item.model}
            </p>
          </div>

          {/* Right: controls */}
          <div className="p-5 overflow-y-auto space-y-4">
            <div>
              <label className="text-xs text-muted block mb-1">Prompt chỉnh sửa</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="VD: đổi nền sang tông tím, headline đỏ to hơn, thêm CTA 'Mua ngay'..."
                className="w-full bg-canvas border border-line rounded-md p-3 text-sm text-fg focus:outline-none focus:border-brand h-24 resize-none"
              />
            </div>

            <div
              tabIndex={0}
              onPaste={handlePaste}
              className="border-2 border-dashed border-line-strong rounded-lg p-3 focus:outline-none focus:border-brand focus:ring-2 focus:ring-indigo-500/20"
              title="Click vùng này rồi Ctrl/Cmd+V để dán ảnh"
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-xs text-muted">Ảnh tham chiếu thêm (tối đa {MAX_EXTRAS})</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={async () => {
                      const files = await readImagesFromClipboard();
                      if (files.length > 0) addExtraFiles(files);
                    }}
                    disabled={extras.length >= MAX_EXTRAS}
                    className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-raised hover:bg-raised-2 text-fg border border-line-strong disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Dán ảnh từ clipboard"
                  >
                    <Clipboard size={11} /> Dán
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={extras.length >= MAX_EXTRAS}
                    className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-brand hover:bg-brand-dark text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Upload size={11} /> Tải lên
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) addExtraFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                />
              </div>
              {extras.length === 0 ? (
                <div className="text-center text-subtle text-[11px] py-3 pointer-events-none flex flex-col items-center gap-1">
                  <span>Kéo / thả ảnh vào đây</span>
                  <span className="inline-flex items-center gap-1 text-subtle">
                    hoặc <Clipboard size={10} /> Ctrl/Cmd+V để dán
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {extras.map((ex) => (
                    <div key={ex.id} className="relative aspect-square rounded-md overflow-hidden bg-canvas border border-line">
                      <img src={ex.url} alt="extra" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setExtras(prev => prev.filter(x => x.id !== ex.id))}
                        className="absolute top-1 right-1 bg-black/70 hover:bg-danger-soft text-white rounded-full p-1"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-subtle mt-1 leading-snug">
                Ảnh đầu tiên sẽ thay vai trò <b>product</b>, các ảnh sau là style references bổ sung. Không upload gì thì ảnh banner gốc đóng vai cả 2.
              </p>
            </div>

            <div>
              <label className="text-xs text-muted block mb-1">Aspect Ratio</label>
              <div className="grid grid-cols-7 gap-1.5">
                {ASPECT_OPTIONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setAspectRatio(r)}
                    className={`text-[11px] py-1.5 rounded-md border transition-all ${
                      aspectRatio === r
                        ? 'bg-brand border-brand text-white'
                        : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted block mb-1">Chất lượng</label>
              <div className="grid grid-cols-3 gap-2">
                {QUALITY_OPTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`text-xs py-2 rounded-md border transition-all ${
                      quality === q
                        ? 'bg-brand border-brand text-white'
                        : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="bg-danger-soft border border-danger-fg/40 rounded-md p-3 flex items-start gap-2">
                <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger">{errorMsg}</p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full py-3 rounded-lg font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all ${
                isGenerating
                  ? 'bg-raised-2 cursor-not-allowed opacity-60 text-fg'
                  : backend === 'coachio'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500'
              }`}
            >
              {isGenerating ? (
                <><RefreshCw size={18} className="animate-spin" /> {progress || 'Đang tạo...'}</>
              ) : (
                <><Wand2 size={18} /> Tạo lại banner</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
