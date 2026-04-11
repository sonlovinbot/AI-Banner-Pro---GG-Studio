import React, { useState } from 'react';
import { Download, Maximize2, X, RefreshCw, Wand2 } from 'lucide-react';
import { GeneratedBanner } from '../types';

interface ResultViewerProps {
  results: GeneratedBanner[];
  onRegenerate?: (id: string, prompt: string) => void;
}

export const ResultViewer: React.FC<ResultViewerProps> = ({ results, onRegenerate }) => {
  const [selectedImage, setSelectedImage] = useState<GeneratedBanner | null>(null);
  const [adjustPrompts, setAdjustPrompts] = useState<Record<string, string>>({});

  const handlePromptChange = (id: string, val: string) => {
    setAdjustPrompts(prev => ({ ...prev, [id]: val }));
  };

  const submitRegenerate = (id: string) => {
    if (onRegenerate && adjustPrompts[id]) {
        onRegenerate(id, adjustPrompts[id]);
        setAdjustPrompts(prev => ({ ...prev, [id]: '' }));
    }
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
        {/* Grid Layout that keeps items large as requested */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
          {results.map((banner, index) => (
            <div 
              key={banner.id} 
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl flex flex-col relative group"
            >
              <div className="relative w-full aspect-square bg-gray-950 flex items-center justify-center">
                {banner.status === 'loading' ? (
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="animate-spin text-indigo-500" size={32} />
                    <span className="text-xs text-indigo-400 font-medium">Generating Variant {index + 1}...</span>
                  </div>
                ) : banner.status === 'error' ? (
                  <div className="text-red-500 text-sm px-4 text-center">Failed to generate</div>
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
                
                {/* Prompt Adjustment Input */}
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
                  <button
                    onClick={() => submitRegenerate(banner.id)}
                    disabled={banner.status === 'loading' || !adjustPrompts[banner.id]}
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
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
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
