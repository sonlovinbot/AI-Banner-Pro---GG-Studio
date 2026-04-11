import React, { useState } from 'react';
import { Layers, Wand2, Settings2, AlertCircle, Cpu, Maximize2, Type, ArrowLeft, Key, Zap } from 'lucide-react';
import { UploadedImage, GeneratedBanner, AppPage } from '../types';
import { ImageUploader } from './ImageUploader';
import { ResultViewer } from './ResultViewer';
import { generateBannerWithGemini } from '../services/geminiService';
import { generateBannerWithCoachio, getCoachioApiKey } from '../services/coachioService';
import { saveToHistory, getGeminiApiKey, getActiveBackend, setActiveBackend } from '../services/storageService';
import { ApiKeySettings } from './ApiKeySettings';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type BackendType = 'gemini' | 'coachio';

interface BannerToolProps {
  onNavigate: (page: AppPage) => void;
}

export const BannerTool: React.FC<BannerToolProps> = ({ onNavigate }) => {
  const [refImages, setRefImages] = useState<UploadedImage[]>([]);
  const [prodImages, setProdImages] = useState<UploadedImage[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [brandContent, setBrandContent] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3-pro-image-preview");
  const [imageSize, setImageSize] = useState<string>("1K");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [results, setResults] = useState<GeneratedBanner[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backend, setBackendState] = useState<BackendType>(getActiveBackend());
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, string>>({});

  const hasCoachioKey = !!getCoachioApiKey();
  const hasGoogleKey = !!getGeminiApiKey() || (import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== 'your_api_key_here');

  const setBackend = (b: BackendType) => {
    setBackendState(b);
    setActiveBackend(b);
  };

  const processFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleUpload = async (files: FileList, type: 'ref' | 'prod') => {
    const newImages: UploadedImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await processFile(file);
        newImages.push({
          id: Math.random().toString(36).substring(7),
          url: URL.createObjectURL(file),
          file,
          base64,
          mimeType: file.type
        });
      } catch (err) {
        console.error("File processing error", err);
      }
    }

    if (type === 'ref') {
      setRefImages(prev => [...prev, ...newImages]);
    } else {
      setProdImages(prev => [...prev, ...newImages]);
    }
  };

  const handleRemove = (id: string, type: 'ref' | 'prod') => {
    if (type === 'ref') {
      setRefImages(prev => prev.filter(img => img.id !== id));
    } else {
      setProdImages(prev => prev.filter(img => img.id !== id));
    }
  };

  const generateSingle = async (
    placeholder: GeneratedBanner,
    selectedRef: UploadedImage,
    selectedProd: UploadedImage,
    combinedPrompt: string
  ) => {
    const startTime = Date.now();
    let imageUrl: string;

    if (backend === 'coachio') {
      imageUrl = await generateBannerWithCoachio(
        selectedRef, selectedProd, combinedPrompt, brandContent,
        aspectRatio, imageSize,
        (status) => setGenerationProgress(prev => ({ ...prev, [placeholder.id]: status }))
      );
    } else {
      imageUrl = await generateBannerWithGemini(
        selectedRef, selectedProd, combinedPrompt, brandContent,
        aspectRatio, selectedModel, imageSize
      );
    }

    const duration = (Date.now() - startTime) / 1000;

    saveToHistory({
      id: placeholder.id,
      imageUrl,
      promptUsed: combinedPrompt,
      timestamp: Date.now(),
      duration,
      model: backend === 'coachio' ? 'coachio-banana-pro' : selectedModel,
      quality: imageSize,
      aspectRatio,
    });

    return { imageUrl, duration };
  };

  const handleGenerate = async () => {
    if (refImages.length === 0 || prodImages.length === 0) {
      setErrorMsg("Please upload at least one Reference image and one Product image.");
      return;
    }

    if (backend === 'coachio' && !getCoachioApiKey()) {
      setErrorMsg("Coachio API key not set. Click the key icon to configure.");
      setShowApiKeySettings(true);
      return;
    }

    if (backend === 'gemini') {
      if (!hasGoogleKey) {
        try {
          const hasKey = await window.aistudio?.hasSelectedApiKey?.();
          if (hasKey === false) {
            await window.aistudio.openSelectKey();
          }
        } catch (e) {
          setErrorMsg("Google API key not set. Please configure it in API Settings.");
          setShowApiKeySettings(true);
          return;
        }
      }
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setGenerationProgress({});

    const variantCount = backend === 'coachio' ? 5 : 5;
    const placeholders: GeneratedBanner[] = Array.from({ length: variantCount }).map(() => ({
      id: Math.random().toString(36).substring(7),
      imageUrl: '',
      promptUsed: '',
      status: 'loading',
      timestamp: Date.now()
    }));

    setResults(placeholders);

    const promises = placeholders.map(async (placeholder) => {
      try {
        const selectedRef = getRandomItem(refImages) as UploadedImage;
        const selectedProd = getRandomItem(prodImages) as UploadedImage;

        const varietyPrompts = [
          "Focus on clean lines and minimalism.",
          "Use bold, high-contrast aesthetics.",
          "Create a soft, elegant atmosphere.",
          "Make it dynamic and energetic.",
          "Ensure a balanced, professional composition."
        ];
        const randomNuance = getRandomItem(varietyPrompts);
        const combinedPrompt = `${userPrompt}. ${randomNuance}`;

        const { imageUrl, duration } = await generateSingle(
          placeholder, selectedRef, selectedProd, combinedPrompt
        );

        setResults(prev => prev.map(p =>
          p.id === placeholder.id
            ? { ...p, imageUrl, status: 'success', promptUsed: combinedPrompt, duration, refImage: selectedRef, prodImage: selectedProd }
            : p
        ));
      } catch (err: any) {
        console.error("Generation failed for one item", err);

        if (err.message?.includes("API key") || err.message?.includes("API Key") || err.message?.includes("Unauthorized")) {
          setErrorMsg(backend === 'coachio'
            ? "Coachio API key error. Please check your key in Settings."
            : "Gemini API key error. Please check your VITE_GEMINI_API_KEY in .env.local"
          );
        } else if (err.message?.includes("credits")) {
          setErrorMsg("Insufficient Coachio credits. Please top up your account.");
        } else {
          setErrorMsg(err.message || "Generation failed");
        }

        setResults(prev => prev.map(p =>
          p.id === placeholder.id ? { ...p, status: 'error' } : p
        ));
      }
    });

    await Promise.all(promises);
    setIsGenerating(false);
    setGenerationProgress({});
  };

  const handleRegenerate = async (id: string, adjustmentPrompt: string) => {
    const target = results.find(r => r.id === id);
    if (!target || !target.refImage || !target.prodImage) {
      setErrorMsg("Cannot regenerate: missing reference or product image.");
      return;
    }

    setResults(prev => prev.map(p => p.id === id ? { ...p, status: 'loading' } : p));

    try {
      const combinedPrompt = `${target.promptUsed}. Adjustment: ${adjustmentPrompt}`;

      const newPlaceholder = { ...target, id };
      const { imageUrl, duration } = await generateSingle(
        newPlaceholder, target.refImage, target.prodImage, combinedPrompt
      );

      setResults(prev => prev.map(p =>
        p.id === id
          ? { ...p, imageUrl, status: 'success', promptUsed: combinedPrompt, duration }
          : p
      ));
    } catch (err: any) {
      console.error("Regeneration failed", err);
      setErrorMsg(err.message || "Regeneration failed");
      setResults(prev => prev.map(p => p.id === id ? { ...p, status: 'error' } : p));
    }
  };

  const coachioAspectRatios = ['1:1', '9:16', '16:9', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
  const geminiAspectRatios = ['1:1', '9:16', '16:9'];
  const currentAspectRatios = backend === 'coachio' ? coachioAspectRatios : geminiAspectRatios;

  return (
    <div className="flex h-screen w-full bg-gray-950 text-slate-200 font-sans">

      {/* Sidebar Controls */}
      <div className="w-80 sm:w-96 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex items-center gap-3">
          <button
            onClick={() => onNavigate('menu')}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
            title="Back to Menu"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Layers size={24} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white tracking-tight">BannerClone</h1>
            <p className="text-xs text-indigo-400 font-mono">Nano Banana Pro</p>
          </div>
          <button
            onClick={() => setShowApiKeySettings(true)}
            className={`p-2 rounded-lg transition-colors ${
              hasCoachioKey
                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            title="API Key Settings"
          >
            <Key size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Backend Selection */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap size={14} /> Backend
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setBackend('gemini')}
                className={`text-xs py-2.5 px-3 rounded-md border text-center transition-all relative ${
                  backend === 'gemini'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Gemini Direct
                {hasGoogleKey && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full"></span>
                )}
              </button>
              <button
                onClick={() => {
                  if (!hasCoachioKey) {
                    setShowApiKeySettings(true);
                  } else {
                    setBackend('coachio');
                  }
                }}
                className={`text-xs py-2.5 px-3 rounded-md border text-center transition-all relative ${
                  backend === 'coachio'
                    ? 'bg-orange-600 border-orange-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Coachio AI
                {hasCoachioKey && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full"></span>
                )}
              </button>
            </div>
          </div>

          <div className="h-px bg-gray-800" />

          {/* Inputs */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Assets</h2>
            <ImageUploader
              title="Style Reference(s)"
              images={refImages}
              onUpload={(f) => handleUpload(f, 'ref')}
              onRemove={(id) => handleRemove(id, 'ref')}
            />
            <ImageUploader
              title="Product Image(s)"
              images={prodImages}
              onUpload={(f) => handleUpload(f, 'prod')}
              onRemove={(id) => handleRemove(id, 'prod')}
            />
          </div>

          <div className="h-px bg-gray-800" />

          {/* Configuration */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Settings2 size={14} /> Configuration
            </h2>

            {/* Model Selection (only for Gemini) */}
            {backend === 'gemini' && (
              <div className="mb-4">
                <label className="text-sm text-gray-400 mb-1 block flex items-center gap-1.5">
                  <Cpu size={14} /> Model
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' },
                    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' }
                  ].map(model => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`text-xs py-2 px-3 rounded-md border text-left transition-all ${
                        selectedModel === model.id
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {model.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Coachio model info */}
            {backend === 'coachio' && (
              <div className="mb-4">
                <label className="text-sm text-gray-400 mb-1 block flex items-center gap-1.5">
                  <Cpu size={14} /> Model
                </label>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-md px-3 py-2 text-xs text-orange-400">
                  Nano Banana Pro (google_image_gen_banana_pro)
                </div>
              </div>
            )}

            {/* Quality Selection */}
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 block flex items-center gap-1.5">
                <Maximize2 size={14} /> Quality
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['1K', '2K', '4K'].map(size => (
                  <button
                    key={size}
                    onClick={() => setImageSize(size)}
                    className={`text-xs py-2 rounded-md border transition-all ${
                      imageSize === size
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {size}
                    {backend === 'coachio' && (
                      <span className="block text-[9px] text-gray-500 mt-0.5">
                        {size === '4K' ? '4 cr' : '3 cr'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 block">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {currentAspectRatios.map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`text-xs py-2 rounded-md border transition-all ${
                      aspectRatio === ratio
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 block flex items-center gap-1.5">
                <Type size={14} /> Brand Content
              </label>
              <textarea
                value={brandContent}
                onChange={(e) => setBrandContent(e.target.value)}
                placeholder="e.g. 'Summer Sale 50% Off', Brand Name..."
                className="w-full bg-gray-950 border border-gray-800 rounded-md p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors h-20 resize-none"
              />
            </div>

            <div className="mb-2">
              <label className="text-sm text-gray-400 mb-1 block">Prompt Adjustments (Optional)</label>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="e.g. Make the background darker..."
                className="w-full bg-gray-950 border border-gray-800 rounded-md p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors h-20 resize-none"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-200">{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-900 border-t border-gray-800">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all transform ${
              isGenerating
                ? 'bg-gray-700 cursor-not-allowed opacity-50'
                : backend === 'coachio'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 hover:scale-[1.02] active:scale-95'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:scale-[1.02] active:scale-95'
            }`}
          >
            {isGenerating ? (
              <>
                <Wand2 className="animate-spin" size={20} /> Generating 5 Variants...
              </>
            ) : (
              <>
                <Wand2 size={20} /> Generate via {backend === 'coachio' ? 'Coachio' : 'Gemini'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full bg-gray-950 relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm z-10">
          <h2 className="font-medium text-gray-300">Generated Workspace</h2>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></span>
              {isGenerating ? 'Generating' : 'Ready'}
            </span>
            <span className={`px-2 py-0.5 rounded-full border ${
              backend === 'coachio'
                ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
            }`}>
              {backend === 'coachio' ? 'Coachio AI' : 'Gemini Direct'}
            </span>
            <span>Quality: {imageSize}</span>
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-gray-950 to-gray-950 pointer-events-none" />
          <ResultViewer results={results} onRegenerate={handleRegenerate} />
        </main>
      </div>

      {/* API Key Settings Modal */}
      {showApiKeySettings && (
        <ApiKeySettings onClose={() => setShowApiKeySettings(false)} />
      )}
    </div>
  );
};
