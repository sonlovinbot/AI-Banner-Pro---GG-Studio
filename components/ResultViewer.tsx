import React, { useRef, useState } from 'react';
import { Download, Maximize2, X, RefreshCw, Wand2, ImagePlus, Heart } from 'lucide-react';
import { GeneratedBanner, UploadedImage } from '../types';
import { fileToUploadedImage, extractImageFiles } from '../services/imageUtils';

const MAX_REGEN_EXTRAS = 3;

interface ResultViewerProps {
  results: GeneratedBanner[];
  onRegenerate?: (id: string, prompt: string, extras?: UploadedImage[]) => void;
  onToggleVote?: (banner: GeneratedBanner) => void;
  isVoted?: (id: string) => boolean;
}

export const ResultViewer: React.FC<ResultViewerProps> = ({ results, onRegenerate, onToggleVote, isVoted }) => {
  const [selectedImage, setSelectedImage] = useState<GeneratedBanner | null>(null);
  const [adjustPrompts, setAdjustPrompts] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, UploadedImage[]>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const handlePromptChange = (id: string, val: string) => {
    setAdjustPrompts(prev => ({ ...prev, [id]: val }));
  };

  const submitRegenerate = (id: string) => {
    if (!onRegenerate) return;
    const prompt = adjustPrompts[id] || '';
    const banner = results.find(r => r.id === id);
    if (!prompt && (!extras[id] || extras[id].length === 0)) return;
    if (banner?.status === 'loading') return;
    onRegenerate(id, prompt || 'Refine using the additional reference images provided.', extras[id]);
    setAdjustPrompts(prev => ({ ...prev, [id]: '' }));
    setExtras(prev => ({ ...prev, [id]: [] }));
  };

  const handleExtraFiles = async (id: string, files: FileList | File[] | null) => {
    if (!files || (files as any).length === 0) return;
    const current = extras[id] || [];
    const room = Math.max(0, MAX_REGEN_EXTRAS - current.length);
    if (room === 0) return;
    const toLoad = Array.from(files as any as Iterable<File>).slice(0, room);
    const loaded = await Promise.all(toLoad.map(fileToUploadedImage));
    setExtras(prev => ({ ...prev, [id]: [...(prev[id] || []), ...loaded] }));
  };

  const handlePasteOnCard = (id: string, e: React.ClipboardEvent) => {
    const files = extractImageFiles(e.clipboardData?.items);
    if (files.length === 0) return;
    e.preventDefault();
    handleExtraFiles(id, files);
  };

  const removeExtra = (id: string, extraId: string) => {
    setExtras(prev => ({ ...prev, [id]: (prev[id] || []).filter(x => x.id !== extraId) }));
  };

  if (results.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
        <div className="w-24 h-24 border-4 border-gray-800 border-dashed rounded-xl mb-4 animate-pulse"></div>
        <p>Generated banners will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
          {results.map((banner, index) => {
            const banExtras = extras[banner.id] || [];
            const voted = isVoted?.(banner.id) ?? false;
            return (
              <div
                key={banner.id}
                tabIndex={0}
                onPaste={(e) => handlePasteOnCard(banner.id, e)}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl flex flex-col relative group focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                title="Click vào card rồi Ctrl/Cmd+V để dán ảnh tham chiếu"
              >
                <div className="relative w-full aspect-square bg-gray-950 flex items-center justify-center">
                  {banner.status === 'loading' ? (
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCw className="animate-spin text-indigo-500" size={32} />
                      <span className="text-xs text-indigo-400 font-medium">Generating Variant {index + 1}...</span>
                    </div>
                  ) : banner.status === 'error' ? (
                    <div className="flex flex-col items-center gap-3 px-4 text-center">
                      <div className="text-red-400 text-sm">Failed to generate</div>
                      {onRegenerate && (
                        <button
                          onClick={() => onRegenerate(banner.id, '', extras[banner.id] || [])}
                          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors"
                          title="Tạo lại banner này"
                        >
                          <RefreshCw size={14} /> Tạo lại
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <img
                        src={banner.imageUrl}
                        alt="Generated Banner"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => setSelectedImage(banner)}
                          className="bg-white/10 backdrop-blur-md hover:bg-white/20 p-3 rounded-full text-white transition-all transform hover:scale-105"
                          title="View Fullscreen"
                        >
                          <Maximize2 size={24} />
                        </button>
                        <a
                          href={banner.imageUrl}
                          download={`banner-clone-${banner.id}.png`}
                          className="bg-indigo-600 hover:bg-indigo-500 p-3 rounded-full text-white transition-all transform hover:scale-105 shadow-lg"
                          title="Download"
                        >
                          <Download size={24} />
                        </a>
                      </div>
                      {onToggleVote && (
                        <button
                          onClick={() => onToggleVote(banner)}
                          className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur-md transition-all ${
                            voted
                              ? 'bg-rose-500/90 hover:bg-rose-500 text-white shadow-lg'
                              : 'bg-black/40 hover:bg-black/60 text-white/80 hover:text-white opacity-0 group-hover:opacity-100'
                          }`}
                          title={voted ? 'Bỏ vote' : 'Vote banner này (cho AI học)'}
                        >
                          <Heart size={18} fill={voted ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="p-3 border-t border-gray-800 bg-gray-900 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-400 font-mono truncate">ID: {banner.id.slice(0, 8)}</p>
                    {banner.duration && (
                      <span className="text-[10px] text-indigo-400 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                        {banner.duration.toFixed(1)}s
                      </span>
                    )}
                  </div>

                  {banExtras.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {banExtras.map(ex => (
                        <div key={ex.id} className="relative w-10 h-10 rounded border border-gray-700 overflow-hidden">
                          <img src={ex.url} className="w-full h-full object-cover" alt="extra" />
                          <button
                            onClick={() => removeExtra(banner.id, ex.id)}
                            className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-500 text-white rounded-full p-0.5"
                            title="Xoá"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                      <span className="text-[10px] text-gray-500 font-mono">{banExtras.length}/{MAX_REGEN_EXTRAS}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Adjust this variant..."
                      value={adjustPrompts[banner.id] || ''}
                      onChange={(e) => handlePromptChange(banner.id, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitRegenerate(banner.id)}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      disabled={banner.status === 'loading'}
                    />
                    <input
                      ref={(el) => { fileInputs.current[banner.id] = el; }}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => { handleExtraFiles(banner.id, e.target.files); e.target.value = ''; }}
                    />
                    <button
                      onClick={() => fileInputs.current[banner.id]?.click()}
                      disabled={banner.status === 'loading' || banExtras.length >= MAX_REGEN_EXTRAS}
                      className="bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 text-gray-300 p-1.5 rounded-md transition-colors border border-gray-700"
                      title={`Upload ảnh tham chiếu thêm (tối đa ${MAX_REGEN_EXTRAS})`}
                    >
                      <ImagePlus size={14} />
                    </button>
                    <button
                      onClick={() => submitRegenerate(banner.id)}
                      disabled={banner.status === 'loading' || (!adjustPrompts[banner.id] && banExtras.length === 0)}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white p-1.5 rounded-md transition-colors"
                      title="Regenerate with adjustment"
                    >
                      {banner.status === 'loading' ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Wand2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
              <a
                href={selectedImage.imageUrl}
                download={`banner-full-${selectedImage.id}.png`}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-full shadow-lg font-medium flex items-center gap-2"
              >
                <Download size={18} /> Download High-Res
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
