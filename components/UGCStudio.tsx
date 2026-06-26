import React, { useState } from 'react';
import {
  UserSquare2, Wand2, Settings2, AlertCircle, Cpu, Maximize2, Type, ArrowLeft, Key, Zap,
  Palette, Hash, X,
} from 'lucide-react';
import {
  UploadedImage, GeneratedBanner, AppPage, LibraryCategory, LibraryImage, BrandProject,
} from '../types';
import { ImageUploader } from './ImageUploader';
import { ResultViewer } from './ResultViewer';
import { generateUgcWithGemini } from '../services/geminiService';
import { generateUgcWithCoachio, getCoachioApiKey } from '../services/coachioService';
import {
  getGeminiApiKey, getActiveBackend, setActiveBackend,
  getLibrary,
} from '../services/storageService';
import { addHistoryToCloud } from '../services/historyService';
import { listBrandProjectsFromCloud } from '../services/brandProjectService';
import {
  listLibraryFromCloud,
  addFileToLibrary,
  removeLibraryItemFromCloud,
  bulkMigrateLibrary,
} from '../services/imageLibraryService';
import { libraryItemToUploadedImageAsync } from '../services/imageUtils';
import { ApiKeySettings } from './ApiKeySettings';

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type BackendType = 'gemini' | 'coachio';

interface Props {
  onNavigate: (page: AppPage) => void;
}

export const UGCStudio: React.FC<Props> = ({ onNavigate }) => {
  const [faceImages, setFaceImages] = useState<UploadedImage[]>([]);
  const [fashionImages, setFashionImages] = useState<UploadedImage[]>([]);
  const [prodImages, setProdImages] = useState<UploadedImage[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [brandContent, setBrandContent] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('4:5');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-pro-image-preview');
  const [coachioModel, setCoachioModel] = useState<string>('gpt_image_2');
  const [imageSize, setImageSize] = useState<string>('1K');
  const [variantCount, setVariantCount] = useState<number>(4);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [results, setResults] = useState<GeneratedBanner[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backend, setBackendState] = useState<BackendType>(getActiveBackend());
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [, setGenerationProgress] = useState<Record<string, string>>({});

  const [faceLibrary, setFaceLibrary] = useState<LibraryImage[]>([]);
  const [fashionLibrary, setFashionLibrary] = useState<LibraryImage[]>([]);
  const [prodLibrary, setProdLibrary] = useState<LibraryImage[]>([]);
  const localFaceCount = getLibrary('face').length;
  const localFashionCount = getLibrary('ref').length;
  const localProdCount = getLibrary('prod').length;

  React.useEffect(() => {
    listLibraryFromCloud('face').then(setFaceLibrary).catch(() => {});
    listLibraryFromCloud('ref').then(setFashionLibrary).catch(() => {});
    listLibraryFromCloud('prod').then(setProdLibrary).catch(() => {});
  }, []);
  const [brandProjects, setBrandProjects] = useState<BrandProject[]>([]);
  React.useEffect(() => { listBrandProjectsFromCloud().then(setBrandProjects).catch(() => {}); }, []);
  const [activeBrandId, setActiveBrandId] = useState<string>('');

  const hasCoachioKey = !!getCoachioApiKey();
  const hasGoogleKey =
    !!getGeminiApiKey() ||
    (import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== 'your_api_key_here');

  const setBackend = (b: BackendType) => { setBackendState(b); setActiveBackend(b); };

  const processFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
    });

  const persistToLibrary = async (file: File, category: LibraryCategory) => {
    try {
      const item = await addFileToLibrary(file, category);
      if (category === 'face') setFaceLibrary(prev => [item, ...prev]);
      else if (category === 'ref') setFashionLibrary(prev => [item, ...prev]);
      else setProdLibrary(prev => [item, ...prev]);
    } catch (e) { console.error('Library save to cloud failed', e); }
  };

  const setterFor = (slot: 'face' | 'fashion' | 'prod') =>
    slot === 'face' ? setFaceImages : slot === 'fashion' ? setFashionImages : setProdImages;

  const categoryFor = (slot: 'face' | 'fashion' | 'prod'): LibraryCategory =>
    slot === 'face' ? 'face' : slot === 'fashion' ? 'ref' : 'prod';

  const handleUpload = async (files: FileList, slot: 'face' | 'fashion' | 'prod') => {
    const fileArray = Array.from(files);
    const processed = await Promise.all(
      fileArray.map(async (file) => {
        try {
          const base64 = await processFile(file);
          return {
            uploaded: {
              id: Math.random().toString(36).substring(7),
              url: URL.createObjectURL(file),
              file, base64, mimeType: file.type,
            } as UploadedImage,
            file,
          };
        } catch { return null; }
      })
    );
    const newImages = processed.filter(Boolean).map(p => p!.uploaded);
    setterFor(slot)(prev => [...prev, ...newImages]);
    const category = categoryFor(slot);
    await Promise.all(processed.filter(Boolean).map(p => persistToLibrary(p!.file, category)));
  };

  const handleRemove = (id: string, slot: 'face' | 'fashion' | 'prod') => {
    setterFor(slot)(prev => prev.filter(i => i.id !== id));
  };

  const handleLibrarySelect = async (item: LibraryImage, slot: 'face' | 'fashion' | 'prod') => {
    try {
      const uploaded = await libraryItemToUploadedImageAsync(item);
      setterFor(slot)(prev => [...prev, uploaded]);
    } catch (e) { console.warn('library select failed', e); }
  };

  const handleLibraryDelete = async (id: string, slot: 'face' | 'fashion' | 'prod') => {
    try {
      await removeLibraryItemFromCloud(id);
      if (slot === 'face') setFaceLibrary(prev => prev.filter(i => i.id !== id));
      else if (slot === 'fashion') setFashionLibrary(prev => prev.filter(i => i.id !== id));
      else setProdLibrary(prev => prev.filter(i => i.id !== id));
    } catch (e) { console.warn('library delete failed', e); }
  };

  const migrateLocalLibraries = async () => {
    try {
      const f = await bulkMigrateLibrary(getLibrary('face'), 'face');
      const s = await bulkMigrateLibrary(getLibrary('ref'), 'ref');
      const p = await bulkMigrateLibrary(getLibrary('prod'), 'prod');
      const [face, fashion, prod] = await Promise.all([
        listLibraryFromCloud('face'),
        listLibraryFromCloud('ref'),
        listLibraryFromCloud('prod'),
      ]);
      setFaceLibrary(face);
      setFashionLibrary(fashion);
      setProdLibrary(prod);
      setErrorMsg(`Migrate: +${f.inserted} face, +${s.inserted} fashion, +${p.inserted} prod`);
    } catch (e: any) {
      setErrorMsg(`Migrate lỗi: ${e?.message || 'unknown'}`);
    }
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

    const styleKeys = new Set(fashionImages.map(i => i.url || i.base64));
    const prodKeys = new Set(prodImages.map(i => i.url || i.base64));

    Promise.all(
      styleSource
        .filter(i => !styleKeys.has(i.url || i.base64 || ''))
        .map(i => libraryItemToUploadedImageAsync(i).catch(() => null)),
    ).then(items => {
      const fresh = items.filter(Boolean) as any;
      if (fresh.length) setFashionImages(prev => [...prev, ...fresh]);
    });

    Promise.all(
      productSource
        .filter(i => !prodKeys.has(i.url || i.base64 || ''))
        .map(i => libraryItemToUploadedImageAsync(i).catch(() => null)),
    ).then(items => {
      const fresh = items.filter(Boolean) as any;
      if (fresh.length) setProdImages(prev => [...prev, ...fresh]);
    });

    const composedBrand = [project.brandInfo, project.eventInfo].filter(s => s.trim()).join('\n');
    if (composedBrand) setBrandContent(composedBrand);

    if (project.jsonPrompt.trim()) {
      const jsonLine = `Brand reference (JSON): ${project.jsonPrompt.trim()}`;
      setUserPrompt(prev => prev.trim() ? `${prev}\n${jsonLine}` : jsonLine);
    }
    setActiveBrandId(project.id);
  };

  const generateSingle = async (
    placeholder: GeneratedBanner,
    face: UploadedImage,
    fashion: UploadedImage,
    product: UploadedImage,
    combinedPrompt: string,
  ) => {
    const startTime = Date.now();
    let imageUrl: string;
    if (backend === 'coachio') {
      imageUrl = await generateUgcWithCoachio(
        face, fashion, product, combinedPrompt, brandContent,
        aspectRatio, imageSize, coachioModel,
        (status) => setGenerationProgress(prev => ({ ...prev, [placeholder.id]: status })),
      );
    } else {
      imageUrl = await generateUgcWithGemini(
        face, fashion, product, combinedPrompt, brandContent,
        aspectRatio, selectedModel, imageSize,
      );
    }
    const duration = (Date.now() - startTime) / 1000;
    let persistedUrl = imageUrl;
    try {
      const saved = await addHistoryToCloud({
        id: placeholder.id,
        imageUrl,
        promptUsed: combinedPrompt,
        timestamp: Date.now(),
        duration,
        model: `UGC · ${backend === 'coachio' ? coachioModel : selectedModel}`,
        quality: imageSize,
        aspectRatio,
      });
      persistedUrl = saved.imageUrl;
    } catch (e) {
      console.warn('addHistoryToCloud (UGC) failed', e);
    }
    return { imageUrl: persistedUrl, duration };
  };

  const handleGenerate = async () => {
    if (faceImages.length === 0 || fashionImages.length === 0 || prodImages.length === 0) {
      setErrorMsg('Vui lòng upload ít nhất 1 ảnh ở Face, Fashion + Style và Product.');
      return;
    }
    if (backend === 'coachio' && !getCoachioApiKey()) {
      setErrorMsg('Coachio API key chưa cấu hình.');
      setShowApiKeySettings(true);
      return;
    }
    if (backend === 'gemini' && !hasGoogleKey) {
      setErrorMsg('Google API key chưa cấu hình.');
      setShowApiKeySettings(true);
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setGenerationProgress({});

    const placeholders: GeneratedBanner[] = Array.from({ length: variantCount }).map(() => ({
      id: Math.random().toString(36).substring(7),
      imageUrl: '', promptUsed: '', status: 'loading', timestamp: Date.now(),
    }));
    setResults(placeholders);

    const varietyPrompts = [
      'Candid lifestyle shot, soft daylight.',
      'Studio-grade lighting, premium look.',
      'Outdoor casual scene with natural mood.',
      'Close-up POV, social-media native composition.',
      'Editorial-style framing, cinematic colors.',
    ];

    const promises = placeholders.map(async (placeholder) => {
      try {
        const face = getRandomItem<UploadedImage>(faceImages);
        const fashion = getRandomItem<UploadedImage>(fashionImages);
        const product = getRandomItem<UploadedImage>(prodImages);
        const nuance = getRandomItem<string>(varietyPrompts);
        const combinedPrompt = `${userPrompt}. ${nuance}`.trim();

        const { imageUrl, duration } = await generateSingle(placeholder, face, fashion, product, combinedPrompt);
        setResults(prev => prev.map(p =>
          p.id === placeholder.id
            ? { ...p, imageUrl, status: 'success', promptUsed: combinedPrompt, duration, refImage: fashion, prodImage: product }
            : p,
        ));
      } catch (err: any) {
        console.error('UGC generation failed', err);
        if (err.message?.includes('API key') || err.message?.includes('Unauthorized')) {
          setErrorMsg('API key error. Kiểm tra lại key trong Settings.');
        } else if (err.message?.includes('credits')) {
          setErrorMsg('Insufficient Coachio credits.');
        } else {
          setErrorMsg(err.message || 'Generation failed');
        }
        setResults(prev => prev.map(p => p.id === placeholder.id ? { ...p, status: 'error' } : p));
      }
    });

    await Promise.all(promises);
    setIsGenerating(false);
    setGenerationProgress({});
  };

  const handleRegenerate = async (id: string, adjustmentPrompt: string) => {
    const target = results.find(r => r.id === id);
    if (!target || !target.refImage || !target.prodImage) return;
    if (faceImages.length === 0) { setErrorMsg('Cần ít nhất 1 face để regenerate.'); return; }

    setResults(prev => prev.map(p => p.id === id ? { ...p, status: 'loading' } : p));
    try {
      const combinedPrompt = `${target.promptUsed}. Adjustment: ${adjustmentPrompt}`;
      const face = getRandomItem<UploadedImage>(faceImages);
      const { imageUrl, duration } = await generateSingle({ ...target, id }, face, target.refImage, target.prodImage, combinedPrompt);
      setResults(prev => prev.map(p => p.id === id ? { ...p, imageUrl, status: 'success', promptUsed: combinedPrompt, duration } : p));
    } catch (err: any) {
      setErrorMsg(err.message || 'Regeneration failed');
      setResults(prev => prev.map(p => p.id === id ? { ...p, status: 'error' } : p));
    }
  };

  const bananaProAspectRatios = ['1:1', '9:16', '16:9', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
  const gptImage2AspectRatios = ['auto', '1:1', '5:4', '9:16', '21:9', '16:9', '4:3', '3:2', '4:5', '3:4', '2:3'];
  const geminiAspectRatios = ['1:1', '9:16', '16:9'];
  const currentAspectRatios = backend === 'coachio'
    ? (coachioModel === 'gpt_image_2' ? gptImage2AspectRatios : bananaProAspectRatios)
    : geminiAspectRatios;

  const isGptImage2 = backend === 'coachio' && coachioModel === 'gpt_image_2';
  const isResolutionDisabled = (size: string) => {
    if (!isGptImage2) return false;
    if (aspectRatio === 'auto' && size !== '1K') return true;
    if (aspectRatio === '1:1' && size === '4K') return true;
    return false;
  };

  React.useEffect(() => {
    if (!isGptImage2) return;
    if (aspectRatio === 'auto' && imageSize !== '1K') setImageSize('1K');
    else if (aspectRatio === '1:1' && imageSize === '4K') setImageSize('2K');
  }, [isGptImage2, aspectRatio, imageSize]);

  React.useEffect(() => {
    if (!currentAspectRatios.includes(aspectRatio)) setAspectRatio(currentAspectRatios[0]);
  }, [coachioModel, backend]);

  const accent = backend === 'coachio'
    ? { bg: 'bg-orange-600', border: 'border-orange-500' }
    : { bg: 'bg-cyan-600', border: 'border-cyan-500' };

  return (
    <div className="flex h-screen w-full bg-canvas text-fg font-sans">
      {/* Sidebar */}
      <div className="w-80 sm:w-96 flex-shrink-0 bg-surface border-r border-line flex flex-col h-full overflow-hidden">
        <div className="p-6 border-b border-line flex items-center gap-3">
          <button
            onClick={() => onNavigate('menu')}
            className="p-2 rounded-lg hover:bg-raised text-muted hover:text-fg"
            title="Back to Menu"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="bg-cyan-600 p-2 rounded-lg text-white">
            <UserSquare2 size={24} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-fg tracking-tight">UGC Studio</h1>
            <p className="text-xs text-cyan-400 font-mono">Face-consistent</p>
          </div>
          <button
            onClick={() => setShowApiKeySettings(true)}
            className={`p-2 rounded-lg transition-colors ${
              hasCoachioKey
                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                : 'bg-raised text-muted hover:bg-raised-2 hover:text-white'
            }`}
            title="API Key Settings"
          >
            <Key size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Backend */}
          <div>
            <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap size={14} /> Backend
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setBackend('gemini')}
                className={`text-xs py-2.5 px-3 rounded-md border text-center transition-all relative ${
                  backend === 'gemini'
                    ? 'bg-cyan-600 border-cyan-500 text-white'
                    : 'bg-raised border-line-strong text-muted hover:bg-raised-2'
                }`}
              >
                Gemini Direct
                {hasGoogleKey && <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full" />}
              </button>
              <button
                onClick={() => hasCoachioKey ? setBackend('coachio') : setShowApiKeySettings(true)}
                className={`text-xs py-2.5 px-3 rounded-md border text-center transition-all relative ${
                  backend === 'coachio'
                    ? 'bg-orange-600 border-orange-500 text-white'
                    : 'bg-raised border-line-strong text-muted hover:bg-raised-2'
                }`}
              >
                Coachio AI
                {hasCoachioKey && <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full" />}
              </button>
            </div>
          </div>

          <div className="h-px bg-raised" />

          {/* Assets */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider">Assets</h2>
              {(localFaceCount + localFashionCount + localProdCount) > 0 && (
                <button
                  onClick={migrateLocalLibraries}
                  className="text-[10px] text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20"
                  title="Migrate face/fashion/product library lên cloud"
                >
                  Migrate library ({localFaceCount + localFashionCount + localProdCount})
                </button>
              )}
            </div>
            <ImageUploader
              title="Face"
              images={faceImages}
              onUpload={(f) => handleUpload(f, 'face')}
              onRemove={(id) => handleRemove(id, 'face')}
              library={faceLibrary}
              onLibrarySelect={(item) => handleLibrarySelect(item, 'face')}
              onLibraryDelete={(id) => handleLibraryDelete(id, 'face')}
            />
            <ImageUploader
              title="Fashion + Style"
              images={fashionImages}
              onUpload={(f) => handleUpload(f, 'fashion')}
              onRemove={(id) => handleRemove(id, 'fashion')}
              library={fashionLibrary}
              onLibrarySelect={(item) => handleLibrarySelect(item, 'fashion')}
              onLibraryDelete={(id) => handleLibraryDelete(id, 'fashion')}
            />
            <ImageUploader
              title="Product"
              images={prodImages}
              onUpload={(f) => handleUpload(f, 'prod')}
              onRemove={(id) => handleRemove(id, 'prod')}
              library={prodLibrary}
              onLibrarySelect={(item) => handleLibrarySelect(item, 'prod')}
              onLibraryDelete={(id) => handleLibraryDelete(id, 'prod')}
            />
          </div>

          <div className="h-px bg-raised" />

          {/* Configuration */}
          <div>
            <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-4 flex items-center gap-2">
              <Settings2 size={14} /> Configuration
            </h2>

            {/* Brand */}
            <div className="mb-4">
              <label className="text-sm text-muted mb-1 flex items-center gap-1.5">
                <Palette size={14} /> Brand
              </label>
              {brandProjects.length === 0 ? (
                <button
                  onClick={() => onNavigate('brand-style')}
                  className="w-full text-xs py-2 px-3 rounded-md border border-dashed border-line-strong bg-surface text-muted hover:bg-raised hover:border-pink-500/50 hover:text-pink-300 text-left transition-colors"
                >
                  + Tạo Brand Style để dùng nhanh
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={activeBrandId}
                    onChange={(e) => applyBrandProject(e.target.value)}
                    className="flex-1 bg-canvas border border-line rounded-md px-3 py-2 text-sm text-fg focus:outline-none focus:border-pink-500"
                  >
                    <option value="">— Không dùng brand —</option>
                    {brandProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {activeBrandId && (
                    <button onClick={() => setActiveBrandId('')} className="p-2 rounded-md bg-raised hover:bg-raised-2 text-muted hover:text-fg" title="Bỏ chọn">
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Model */}
            {backend === 'gemini' && (
              <div className="mb-4">
                <label className="text-sm text-muted mb-1 flex items-center gap-1.5"><Cpu size={14} /> Model</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' },
                    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' },
                  ].map(m => {
                    const active = selectedModel === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        className={`py-2 px-3 rounded-md border text-left transition-all ${
                          active ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                        }`}
                      >
                        <div className="text-xs font-medium">{m.name}</div>
                        <div className={`text-[10px] mt-0.5 font-mono ${active ? 'text-cyan-100/80' : 'text-subtle'}`}>{m.id}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {backend === 'coachio' && (
              <div className="mb-4">
                <label className="text-sm text-muted mb-1 flex items-center gap-1.5"><Cpu size={14} /> Model</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'google_image_gen_banana_pro', name: 'Nano Banana Pro' },
                    { id: 'gpt_image_2', name: 'GPT Image 2' },
                  ].map(m => {
                    const active = coachioModel === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setCoachioModel(m.id)}
                        className={`py-2 px-3 rounded-md border text-left transition-all ${
                          active ? 'bg-orange-600 border-orange-500 text-white' : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                        }`}
                      >
                        <div className="text-xs font-medium">{m.name}</div>
                        <div className={`text-[10px] mt-0.5 font-mono ${active ? 'text-orange-100/80' : 'text-subtle'}`}>{m.id}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Variants */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-muted flex items-center gap-1.5"><Hash size={14} /> Số bản tạo</label>
                <span className="text-[11px] text-fg font-mono bg-raised px-2 py-0.5 rounded">{variantCount}</span>
              </div>
              <input
                type="range" min={1} max={10} step={1} value={variantCount}
                onChange={(e) => setVariantCount(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between text-[9px] text-subtle mt-0.5 px-0.5">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>

            {/* Quality */}
            <div className="mb-4">
              <label className="text-sm text-muted mb-1 flex items-center gap-1.5"><Maximize2 size={14} /> Quality</label>
              <div className="grid grid-cols-3 gap-2">
                {['1K', '2K', '4K'].map(size => {
                  const disabled = isResolutionDisabled(size);
                  const active = imageSize === size;
                  return (
                    <button
                      key={size}
                      onClick={() => !disabled && setImageSize(size)}
                      disabled={disabled}
                      className={`text-xs py-2 rounded-md border transition-all ${
                        disabled
                          ? 'bg-surface border-line text-subtle cursor-not-allowed opacity-50'
                          : active
                            ? `${accent.bg} ${accent.border} text-white`
                            : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aspect */}
            <div className="mb-4">
              <label className="text-sm text-muted mb-1 block">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {currentAspectRatios.map(r => {
                  const active = aspectRatio === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={`text-xs py-2 rounded-md border transition-all ${
                        active ? `${accent.bg} ${accent.border} text-white` : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Brand content */}
            <div className="mb-4">
              <label className="text-sm text-muted mb-1 flex items-center gap-1.5"><Type size={14} /> Brand Content</label>
              <textarea
                value={brandContent}
                onChange={(e) => setBrandContent(e.target.value)}
                placeholder="Tên brand, slogan, tone of voice…"
                className="w-full bg-canvas border border-line rounded-md p-3 text-sm text-fg focus:outline-none focus:border-cyan-500 h-20 resize-none"
              />
            </div>

            <div className="mb-2">
              <label className="text-sm text-muted mb-1 block">Prompt Adjustments</label>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="VD: ngồi quán cafe, ánh sáng tự nhiên, đang cầm sản phẩm…"
                className="w-full bg-canvas border border-line rounded-md p-3 text-sm text-fg focus:outline-none focus:border-cyan-500 h-20 resize-none"
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

        <div className="p-6 bg-surface border-t border-line">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all ${
              isGenerating
                ? 'bg-raised-2 cursor-not-allowed opacity-50 text-fg'
                : backend === 'coachio'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500'
                  : 'bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500'
            }`}
          >
            {isGenerating ? (
              <><Wand2 className="animate-spin" size={20} /> Generating {variantCount} variant{variantCount !== 1 ? 's' : ''}…</>
            ) : (
              <><Wand2 size={20} /> Generate UGC</>
            )}
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col h-full bg-canvas relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 border-b border-line bg-surface/50 backdrop-blur-sm z-10">
          <h2 className="font-medium text-fg">UGC Workspace</h2>
          <div className="flex items-center gap-4 text-xs text-subtle">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
              {isGenerating ? 'Generating' : 'Ready'}
            </span>
            <span className={`px-2 py-0.5 rounded-full border ${
              backend === 'coachio'
                ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'
            }`}>
              {backend === 'coachio' ? 'Coachio AI' : 'Gemini Direct'}
            </span>
            <span>Quality: {imageSize}</span>
          </div>
        </header>
        <main className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-gray-950 to-gray-950 pointer-events-none" />
          <ResultViewer results={results} onRegenerate={handleRegenerate} />
        </main>
      </div>

      {showApiKeySettings && <ApiKeySettings onClose={() => setShowApiKeySettings(false)} />}
    </div>
  );
};
