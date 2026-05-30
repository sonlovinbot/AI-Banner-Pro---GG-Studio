import React, { useState } from 'react';
import { Layers, Wand2, Settings2, AlertCircle, Cpu, Maximize2, Type, ArrowLeft, Key, Zap, FolderOpen, Trash2, X, Palette, Hash } from 'lucide-react';
import { UploadedImage, GeneratedBanner, AppPage, LibraryCategory, LibraryImage, BrandSnippet, BrandProject } from '../types';
import { ImageUploader } from './ImageUploader';
import { ResultViewer } from './ResultViewer';
import { generateBannerWithGemini } from '../services/geminiService';
import { generateBannerWithCoachio, getCoachioApiKey } from '../services/coachioService';
import {
  saveToHistory,
  getGeminiApiKey,
  getActiveBackend,
  setActiveBackend,
  getLibrary,
  addToLibrary,
  removeFromLibrary,
  getBrandLibrary,
  addToBrandLibrary,
  removeFromBrandLibrary,
  getBrandProjects,
} from '../services/storageService';
import { compressForLibrary, libraryItemToUploadedImage } from '../services/imageUtils';
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
  const [coachioModel, setCoachioModel] = useState<string>("google_image_gen_banana_pro");
  const [imageSize, setImageSize] = useState<string>("1K");
  const [variantCount, setVariantCount] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [results, setResults] = useState<GeneratedBanner[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backend, setBackendState] = useState<BackendType>(getActiveBackend());
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, string>>({});
  const [refLibrary, setRefLibrary] = useState<LibraryImage[]>(() => getLibrary('ref'));
  const [prodLibrary, setProdLibrary] = useState<LibraryImage[]>(() => getLibrary('prod'));
  const [brandLibrary, setBrandLibrary] = useState<BrandSnippet[]>(() => getBrandLibrary());
  const [showBrandLibrary, setShowBrandLibrary] = useState(false);
  const [expandedBrandIds, setExpandedBrandIds] = useState<Set<string>>(new Set());

  const toggleBrandExpanded = (id: string) => {
    setExpandedBrandIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [brandProjects] = useState<BrandProject[]>(() => getBrandProjects());
  const [activeBrandId, setActiveBrandId] = useState<string>('');

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

  const persistToLibrary = async (file: File, category: LibraryCategory) => {
    try {
      const { base64, mimeType } = await compressForLibrary(file);
      const item: LibraryImage = {
        id: Math.random().toString(36).substring(7),
        base64,
        mimeType,
        fileName: file.name,
        addedAt: Date.now(),
      };
      const next = addToLibrary(category, item);
      if (category === 'ref') setRefLibrary(next); else setProdLibrary(next);
    } catch (err) {
      console.error('Library save failed', err);
    }
  };

  const handleUpload = async (files: FileList, type: LibraryCategory) => {
    const fileArray = Array.from(files);

    const processed = await Promise.all(
      fileArray.map(async (file) => {
        try {
          const base64 = await processFile(file);
          return {
            uploaded: {
              id: Math.random().toString(36).substring(7),
              url: URL.createObjectURL(file),
              file,
              base64,
              mimeType: file.type,
            } as UploadedImage,
            file,
          };
        } catch (err) {
          console.error('File processing error', err);
          return null;
        }
      })
    );

    const newImages = processed.filter(Boolean).map(p => p!.uploaded);
    if (type === 'ref') setRefImages(prev => [...prev, ...newImages]);
    else setProdImages(prev => [...prev, ...newImages]);

    await Promise.all(
      processed.filter(Boolean).map(p => persistToLibrary(p!.file, type))
    );
  };

  const handleLibrarySelect = (item: LibraryImage, type: LibraryCategory) => {
    const uploaded = libraryItemToUploadedImage(item);
    if (type === 'ref') setRefImages(prev => [...prev, uploaded]);
    else setProdImages(prev => [...prev, uploaded]);
  };

  const handleLibraryDelete = (id: string, type: LibraryCategory) => {
    const next = removeFromLibrary(type, id);
    if (type === 'ref') setRefLibrary(next); else setProdLibrary(next);
  };

  const handleBrandDelete = (id: string) => {
    setBrandLibrary(removeFromBrandLibrary(id));
  };

  const handleBrandSave = () => {
    if (!brandContent.trim()) return;
    setBrandLibrary(addToBrandLibrary(brandContent));
  };

  const applyBrandProject = (projectId: string) => {
    if (!projectId) { setActiveBrandId(''); return; }
    const project = brandProjects.find(p => p.id === projectId);
    if (!project) return;

    const styleSource: LibraryImage[] = [
      ...(project.logo ? [project.logo] : []),
      ...(project.styleReferences ?? project.references ?? []),
    ];
    const productSource: LibraryImage[] = project.productReferences ?? [];

    const styleExisting = new Set(refImages.map(i => i.base64));
    const newStyle = styleSource
      .filter(i => !styleExisting.has(i.base64))
      .map(libraryItemToUploadedImage);
    if (newStyle.length) setRefImages(prev => [...prev, ...newStyle]);

    const prodExisting = new Set(prodImages.map(i => i.base64));
    const newProd = productSource
      .filter(i => !prodExisting.has(i.base64))
      .map(libraryItemToUploadedImage);
    if (newProd.length) setProdImages(prev => [...prev, ...newProd]);

    const composedBrand = [project.brandInfo, project.eventInfo].filter(s => s.trim()).join('\n');
    if (composedBrand) setBrandContent(composedBrand);

    if (project.jsonPrompt.trim()) {
      const jsonLine = `Brand reference (JSON): ${project.jsonPrompt.trim()}`;
      setUserPrompt(prev => prev.trim() ? `${prev}\n${jsonLine}` : jsonLine);
    }

    setActiveBrandId(project.id);
  };

  const clearBrandSelection = () => setActiveBrandId('');

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
        aspectRatio, imageSize, coachioModel,
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
      model: backend === 'coachio' ? coachioModel : selectedModel,
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

    if (brandContent.trim()) {
      setBrandLibrary(addToBrandLibrary(brandContent));
    }

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

  const bananaProAspectRatios = ['1:1', '9:16', '16:9', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
  const gptImage2AspectRatios = ['auto', '1:1', '5:4', '9:16', '21:9', '16:9', '4:3', '3:2', '4:5', '3:4', '2:3'];
  const geminiAspectRatios = ['1:1', '9:16', '16:9'];
  const currentAspectRatios =
    backend === 'coachio'
      ? (coachioModel === 'gpt_image_2' ? gptImage2AspectRatios : bananaProAspectRatios)
      : geminiAspectRatios;

  const isGptImage2 = backend === 'coachio' && coachioModel === 'gpt_image_2';
  const accent = backend === 'coachio'
    ? { bg: 'bg-orange-600', border: 'border-orange-500' }
    : { bg: 'bg-indigo-600', border: 'border-indigo-500' };
  const isResolutionDisabled = (size: string) => {
    if (!isGptImage2) return false;
    if (aspectRatio === 'auto' && size !== '1K') return true;
    if (aspectRatio === '1:1' && size === '4K') return true;
    return false;
  };

  // Auto-correct invalid combos for GPT Image 2
  React.useEffect(() => {
    if (!isGptImage2) return;
    if (aspectRatio === 'auto' && imageSize !== '1K') setImageSize('1K');
    else if (aspectRatio === '1:1' && imageSize === '4K') setImageSize('2K');
  }, [isGptImage2, aspectRatio, imageSize]);

  // Reset aspect ratio if switching to a model that doesn't support it
  React.useEffect(() => {
    if (!currentAspectRatios.includes(aspectRatio)) {
      setAspectRatio(currentAspectRatios[0]);
    }
  }, [coachioModel, backend]);

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
              library={refLibrary}
              onLibrarySelect={(item) => handleLibrarySelect(item, 'ref')}
              onLibraryDelete={(id) => handleLibraryDelete(id, 'ref')}
            />
            <ImageUploader
              title="Product Image(s)"
              images={prodImages}
              onUpload={(f) => handleUpload(f, 'prod')}
              onRemove={(id) => handleRemove(id, 'prod')}
              library={prodLibrary}
              onLibrarySelect={(item) => handleLibrarySelect(item, 'prod')}
              onLibraryDelete={(id) => handleLibraryDelete(id, 'prod')}
            />
          </div>

          <div className="h-px bg-gray-800" />

          {/* Configuration */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Settings2 size={14} /> Configuration
            </h2>

            {/* Brand Selector */}
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 flex items-center gap-1.5">
                <Palette size={14} /> Brand
              </label>
              {brandProjects.length === 0 ? (
                <button
                  onClick={() => onNavigate('brand-style')}
                  className="w-full text-xs py-2 px-3 rounded-md border border-dashed border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800 hover:border-pink-500/50 hover:text-pink-300 text-left transition-colors"
                >
                  + Tạo Brand Style để sử dụng nhanh
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={activeBrandId}
                    onChange={(e) => applyBrandProject(e.target.value)}
                    className="flex-1 bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
                  >
                    <option value="">— Không dùng brand —</option>
                    {brandProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {activeBrandId && (
                    <button
                      onClick={clearBrandSelection}
                      className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                      title="Bỏ chọn brand"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate('brand-style')}
                    className="text-[11px] px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                    title="Quản lý brand"
                  >
                    Quản lý
                  </button>
                </div>
              )}
              {activeBrandId && (
                <p className="text-[10px] text-pink-300/80 mt-1.5">
                  Đã áp dụng: {brandProjects.find(p => p.id === activeBrandId)?.name}
                </p>
              )}
            </div>

            {/* Model Selection (only for Gemini) */}
            {backend === 'gemini' && (
              <div className="mb-4">
                <label className="text-sm text-gray-400 mb-1 flex items-center gap-1.5">
                  <Cpu size={14} /> Model
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' },
                    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' }
                  ].map(model => {
                    const active = selectedModel === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        className={`py-2 px-3 rounded-md border text-left transition-all ${
                          active
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <div className="text-xs font-medium leading-tight">{model.name}</div>
                        <div className={`text-[10px] mt-0.5 font-mono ${active ? 'text-indigo-100/80' : 'text-gray-500'}`}>
                          {model.id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Coachio model selection */}
            {backend === 'coachio' && (
              <div className="mb-4">
                <label className="text-sm text-gray-400 mb-1 flex items-center gap-1.5">
                  <Cpu size={14} /> Model
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'google_image_gen_banana_pro', name: 'Nano Banana Pro' },
                    { id: 'gpt_image_2', name: 'GPT Image 2' },
                  ].map(model => {
                    const active = coachioModel === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => setCoachioModel(model.id)}
                        className={`py-2 px-3 rounded-md border text-left transition-all ${
                          active
                            ? 'bg-orange-600 border-orange-500 text-white shadow-sm'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <div className="text-xs font-medium leading-tight">{model.name}</div>
                        <div className={`text-[10px] mt-0.5 font-mono ${active ? 'text-orange-100/80' : 'text-gray-500'}`}>
                          {model.id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Variants Count */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Hash size={14} /> Số bản tạo
                </label>
                <span className="text-[11px] text-gray-300 font-mono bg-gray-800 px-2 py-0.5 rounded">
                  {variantCount}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={variantCount}
                onChange={(e) => setVariantCount(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5 px-0.5">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>

            {/* Quality Selection */}
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 flex items-center gap-1.5">
                <Maximize2 size={14} /> Quality
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['1K', '2K', '4K'].map(size => {
                  const disabled = isResolutionDisabled(size);
                  const active = imageSize === size;
                  const credit = isGptImage2
                    ? (size === '1K' ? '0.81 cr' : size === '2K' ? '1.35 cr' : '3.2 cr')
                    : (size === '4K' ? '4 cr' : '3 cr');
                  return (
                    <button
                      key={size}
                      onClick={() => !disabled && setImageSize(size)}
                      disabled={disabled}
                      title={disabled ? `Not supported with aspect_ratio "${aspectRatio}"` : undefined}
                      className={`text-xs py-2 rounded-md border transition-all ${
                        disabled
                          ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                          : active
                            ? `${accent.bg} ${accent.border} text-white`
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {size}
                      {backend === 'coachio' && (
                        <span className={`block text-[9px] mt-0.5 ${active && !disabled ? 'text-white/70' : 'text-gray-500'}`}>{credit}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 block">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {currentAspectRatios.map(ratio => {
                  const active = aspectRatio === ratio;
                  return (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`text-xs py-2 rounded-md border transition-all ${
                        active
                          ? `${accent.bg} ${accent.border} text-white`
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {ratio}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Type size={14} /> Brand Content
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleBrandSave}
                    disabled={!brandContent.trim()}
                    className="text-[11px] px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Lưu nội dung này vào thư viện"
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => setShowBrandLibrary(true)}
                    className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
                    title="Mở thư viện brand content"
                  >
                    <FolderOpen size={11} /> Thư viện
                    {brandLibrary.length > 0 && (
                      <span className="bg-indigo-500/30 text-indigo-200 rounded-full px-1.5 py-px text-[9px] font-mono">
                        {brandLibrary.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
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
                <Wand2 className="animate-spin" size={20} /> Generating {variantCount} variant{variantCount !== 1 ? 's' : ''}...
              </>
            ) : (
              <>
                <Wand2 size={20} /> Generate via {backend === 'coachio' ? (coachioModel === 'gpt_image_2' ? 'GPT Image 2' : 'Nano Banana Pro') : 'Gemini'}
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

      {/* Brand Content Library Modal */}
      {showBrandLibrary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
          onClick={() => setShowBrandLibrary(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/10 text-indigo-400 p-2 rounded-md"><Type size={18} /></div>
                <div>
                  <h3 className="text-base font-semibold text-white">Thư viện Brand Content</h3>
                  <p className="text-xs text-gray-500">Bấm vào dòng để chèn vào ô brand · {brandLibrary.length}/10</p>
                </div>
              </div>
              <button
                onClick={() => setShowBrandLibrary(false)}
                className="p-2 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {brandLibrary.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-16">
                  Chưa có brand content nào được lưu.
                  <br />
                  <span className="text-xs">Nội dung sẽ được lưu khi bạn bấm "Lưu" hoặc khi sinh banner.</span>
                </div>
              ) : (
                <ul className="space-y-2">
                  {brandLibrary.map(item => {
                    const expanded = expandedBrandIds.has(item.id);
                    const isLong = item.content.length > 140 || (item.content.match(/\n/g)?.length ?? 0) >= 2;
                    return (
                      <li key={item.id} className="bg-gray-950 border border-gray-800 hover:border-indigo-500/60 rounded-md transition-colors">
                        <div className="flex items-stretch gap-0">
                          <div
                            className={`flex-1 p-3 text-sm text-gray-200 whitespace-pre-wrap break-words cursor-pointer ${
                              expanded ? '' : 'line-clamp-3'
                            }`}
                            onClick={() => toggleBrandExpanded(item.id)}
                            title="Bấm để xem thêm / thu gọn"
                          >
                            {item.content}
                          </div>
                          <div className="flex flex-col border-l border-gray-800">
                            <button
                              type="button"
                              onClick={() => {
                                setBrandContent(item.content);
                                setShowBrandLibrary(false);
                              }}
                              className="flex-1 px-3 text-[11px] text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                              title="Dùng nội dung này"
                            >
                              Dùng
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBrandDelete(item.id)}
                              className="flex-1 px-3 text-gray-400 hover:bg-red-500/80 hover:text-white border-t border-gray-800 transition-colors"
                              title="Remove"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        {isLong && (
                          <button
                            type="button"
                            onClick={() => toggleBrandExpanded(item.id)}
                            className="block w-full text-[10px] text-gray-500 hover:text-indigo-300 px-3 py-1 text-left border-t border-gray-800/50"
                          >
                            {expanded ? '↑ Thu gọn' : '↓ Xem thêm'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
