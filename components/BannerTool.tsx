import React, { useState } from 'react';
import { Layers, Wand2, Settings2, AlertCircle, Cpu, Maximize2, Type, ArrowLeft, Key, Zap, FolderOpen, Trash2, X, Palette, Hash, Plus, Megaphone, ListPlus, Save } from 'lucide-react';
import { UploadedImage, GeneratedBanner, AppPage, LibraryCategory, LibraryImage, BrandSnippet, BrandProject, VotedBanner } from '../types';
import { ImageUploader } from './ImageUploader';
import { ResultViewer } from './ResultViewer';
import { generateBannerWithGemini } from '../services/geminiService';
import { generateBannerWithCoachio, getCoachioApiKey } from '../services/coachioService';
import {
  getGeminiApiKey,
  getActiveBackend,
  setActiveBackend,
  getLibrary,
} from '../services/storageService';
import { addHistoryToCloud } from '../services/historyService';
import {
  listVotesFromCloud,
  addVoteToCloud,
  removeVoteFromCloud,
} from '../services/votesService';
import {
  listSnippetsFromCloud,
  addSnippetToCloud,
  removeSnippetFromCloud,
} from '../services/brandSnippetService';
import {
  listBrandProjectsFromCloud,
} from '../services/brandProjectService';
import {
  listLibraryFromCloud,
  addFileToLibrary,
  addDataUrlToLibrary,
  removeLibraryItemFromCloud,
  bulkMigrateLibrary,
} from '../services/imageLibraryService';
import { libraryItemToUploadedImage, libraryItemToUploadedImageAsync, dataUrlOrUrlToUploadedImage } from '../services/imageUtils';
import { proxiedBannerUrl } from '../services/cdnProxy';
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

type BannerType = 'general' | 'ads' | 'sale' | 'awareness' | 'software';

const MAX_CONTENTS = 5;
const MAX_VERSIONS_PER_CONTENT = 3;

const BANNER_TYPE_OPTIONS: { id: BannerType; label: string; hint: string }[] = [
  { id: 'general',   label: 'General',                hint: 'Banner tổng quát, không ràng buộc đặc thù.' },
  { id: 'ads',       label: 'Performance Ads',        hint: 'Headline + value prop + CTA mạnh + logo nổi.' },
  { id: 'sale',      label: 'Sale / Promo',           hint: 'Nhấn giảm giá + urgency + CTA gấp.' },
  { id: 'awareness', label: 'Brand Awareness',        hint: 'Tối giản, lifestyle, brand identity dẫn dắt.' },
  { id: 'software',  label: 'Software / Thumbnail',   hint: 'Screenshot / app preview, kiểu YouTube thumbnail — headline khổng lồ, contrast cao.' },
];

function getBannerTypePrompt(type: BannerType): string {
  switch (type) {
    case 'ads':
      return [
        'BANNER TYPE: Performance Ad (paid social / display).',
        'Required elements:',
        '- Bold scannable HEADLINE (3-7 words, biggest typography).',
        '- Clear VALUE PROPOSITION under the headline (1 line, plain language).',
        '- Prominent CALL-TO-ACTION button ("Shop Now", "Buy Now", "Learn More") in a solid high-contrast color.',
        '- Brand logo visible (corner or near headline).',
        '- Product as the undeniable focal point with crisp lighting.',
        '- Strong visual hierarchy — fully readable in 2 seconds at thumbnail size.',
        '- Avoid clutter and tiny text.',
      ].join('\n');
    case 'sale':
      return [
        'BANNER TYPE: Sale / Promotion ad.',
        'Required elements:',
        '- HUGE discount/offer badge (e.g. "-50%", "BUY 1 GET 1", "FREE SHIP") as the dominant text.',
        '- URGENCY copy ("Today Only", "Limited Stock", "Ends Tonight").',
        '- Clear CTA button.',
        '- Bright attention-grabbing palette, high saturation.',
        '- Product clearly shown but secondary to the offer.',
      ].join('\n');
    case 'awareness':
      return [
        'BANNER TYPE: Brand Awareness.',
        'Required elements:',
        '- Hero lifestyle composition, premium mood.',
        '- Brand identity (logo + tagline) placed elegantly.',
        '- Minimal copy — imagery carries the emotion.',
        '- Soft aspirational lighting and a cohesive palette.',
      ].join('\n');
    case 'software':
      return [
        'BANNER TYPE: Software / App / SaaS showcase (YouTube-thumbnail energy).',
        'Treat the PRODUCT IMAGE as a screenshot / UI / dashboard / app screen — NOT a physical object. Keep the screen pixels crisp; never blur or stylize the screen content.',
        'Required elements:',
        '- The SCREENSHOT is the dominant hero — present it on a device frame OR floating cleanly with a slight 3D tilt and a soft drop shadow.',
        '- HUGE bold HEADLINE (2-5 words max, heavy sans-serif). Add a contrasting STROKE/OUTLINE on the text so it stays readable on any background.',
        '- One ANNOTATION callout (a circle, arrow, marker, or highlight box) drawing attention to a specific feature in the screenshot.',
        '- Brand / app NAME or LOGO placed clearly (corner or beside the headline).',
        '- High-contrast solid color or vivid duotone gradient background — keep it clean, no busy textures.',
        '- A small badge in a corner ("NEW", "FREE", "DEMO", "v2", "▶︎" play icon) to hint at curiosity / value.',
        '- Reading order must work in 1-2 seconds at thumbnail size: headline → screenshot → badge.',
        '- Avoid: tiny screenshots, low-contrast text, cluttered backgrounds, more than 6 words in the headline, photorealistic objects that hide the UI.',
      ].join('\n');
    case 'general':
    default:
      return '';
  }
}

interface BannerToolProps {
  onNavigate: (page: AppPage) => void;
}

export const BannerTool: React.FC<BannerToolProps> = ({ onNavigate }) => {
  const [refImages, setRefImages] = useState<UploadedImage[]>([]);
  const [prodImages, setProdImages] = useState<UploadedImage[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [brandContent, setBrandContent] = useState<string>("");
  const [bannerType, setBannerType] = useState<BannerType>('general');
  const [multiContent, setMultiContent] = useState<boolean>(false);
  const [contents, setContents] = useState<string[]>([""]);
  const [versionsPerContent, setVersionsPerContent] = useState<number>(2);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3-pro-image-preview");
  const [coachioModel, setCoachioModel] = useState<string>("gpt_image_2");
  const [imageSize, setImageSize] = useState<string>("1K");
  const [variantCount, setVariantCount] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [results, setResults] = useState<GeneratedBanner[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backend, setBackendState] = useState<BackendType>(getActiveBackend());
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, string>>({});
  const [refLibrary, setRefLibrary] = useState<LibraryImage[]>([]);
  const [prodLibrary, setProdLibrary] = useState<LibraryImage[]>([]);

  // Migrate counts surfaced in case user has legacy localStorage items
  const localRefCount = getLibrary('ref').length;
  const localProdCount = getLibrary('prod').length;

  React.useEffect(() => {
    listLibraryFromCloud('ref').then(setRefLibrary).catch(() => {});
    listLibraryFromCloud('prod').then(setProdLibrary).catch(() => {});
  }, []);
  const [brandLibrary, setBrandLibrary] = useState<BrandSnippet[]>([]);
  const [showBrandLibrary, setShowBrandLibrary] = useState(false);
  const [expandedBrandIds, setExpandedBrandIds] = useState<Set<string>>(new Set());

  const toggleBrandExpanded = (id: string) => {
    setExpandedBrandIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [brandProjects, setBrandProjects] = useState<BrandProject[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string>('');
  const [votes, setVotes] = useState<VotedBanner[]>([]);

  // Initial cloud loads
  React.useEffect(() => {
    listVotesFromCloud().then(setVotes).catch(() => {});
    listSnippetsFromCloud().then(setBrandLibrary).catch(() => {});
    listBrandProjectsFromCloud().then(setBrandProjects).catch(() => {});
  }, []);

  const libraryIdForVote = (bannerId: string) => `voted-${bannerId}`;

  const toggleVote = async (banner: GeneratedBanner) => {
    if (banner.status !== 'success' || !banner.imageUrl) return;
    const already = votes.some(v => v.id === banner.id);

    if (already) {
      try {
        await removeVoteFromCloud(banner.id);
        setVotes(prev => prev.filter(v => v.id !== banner.id));
        // Remove from cloud ref library mirror (best effort)
        const mirrorId = libraryIdForVote(banner.id);
        const mirror = refLibrary.find(r => r.id === mirrorId);
        if (mirror) {
          await removeLibraryItemFromCloud(mirrorId).catch(() => {});
          setRefLibrary(prev => prev.filter(r => r.id !== mirrorId));
        }
      } catch (e) {
        console.warn('Remove vote failed', e);
      }
      return;
    }

    // Mirror into the cloud ref library so future generations can reuse the
    // liked banner as a style reference picker entry.
    try {
      const added = await addDataUrlToLibrary(
        proxiedBannerUrl(banner.imageUrl),
        `liked-banner-${banner.id}.jpg`,
        'ref',
      );
      setRefLibrary(prev => [added, ...prev]);
    } catch (e) {
      console.warn('Save voted banner to cloud library failed', e);
    }

    try {
      const saved = await addVoteToCloud({
        id: banner.id,
        imageUrl: banner.imageUrl,
        promptUsed: banner.promptUsed || '',
        brandContent: brandContent || '',
        bannerType,
        aspectRatio,
        model: backend === 'coachio' ? coachioModel : selectedModel,
        votedAt: Date.now(),
      });
      setVotes(prev => [saved, ...prev]);
    } catch (e) {
      console.warn('Add vote failed', e);
    }
  };

  const saveContentSnippet = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    try {
      const snippet = await addSnippetToCloud(t);
      setBrandLibrary(prev => [snippet, ...prev.filter(s => s.content !== t)]);
    } catch (e) {
      console.warn('addSnippetToCloud failed', e);
    }
  };

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
      const item = await addFileToLibrary(file, category);
      if (category === 'ref') setRefLibrary(prev => [item, ...prev]);
      else setProdLibrary(prev => [item, ...prev]);
    } catch (err) {
      console.error('Library save to cloud failed', err);
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

  const handleLibrarySelect = async (item: LibraryImage, type: LibraryCategory) => {
    try {
      const uploaded = await libraryItemToUploadedImageAsync(item);
      if (type === 'ref') setRefImages(prev => [...prev, uploaded]);
      else setProdImages(prev => [...prev, uploaded]);
    } catch (e) {
      console.warn('library select failed', e);
      setErrorMsg('Không tải được ảnh từ thư viện');
    }
  };

  const handleLibraryDelete = async (id: string, type: LibraryCategory) => {
    try {
      await removeLibraryItemFromCloud(id);
      if (type === 'ref') setRefLibrary(prev => prev.filter(i => i.id !== id));
      else setProdLibrary(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      console.warn('library delete failed', e);
    }
  };

  const migrateLocalLibraries = async () => {
    try {
      const refResult = await bulkMigrateLibrary(getLibrary('ref'), 'ref');
      const prodResult = await bulkMigrateLibrary(getLibrary('prod'), 'prod');
      const [r, p] = await Promise.all([
        listLibraryFromCloud('ref'),
        listLibraryFromCloud('prod'),
      ]);
      setRefLibrary(r);
      setProdLibrary(p);
      setErrorMsg(
        `Migrate library: +${refResult.inserted} ref, +${prodResult.inserted} prod (bỏ qua ${refResult.skipped + prodResult.skipped} trùng)`,
      );
    } catch (e: any) {
      setErrorMsg(`Migrate lỗi: ${e?.message || 'unknown'}`);
    }
  };

  const handleBrandDelete = async (id: string) => {
    try {
      await removeSnippetFromCloud(id);
      setBrandLibrary(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      console.warn('removeSnippetFromCloud failed', e);
    }
  };

  const handleBrandSave = async () => {
    if (!brandContent.trim()) return;
    try {
      const snippet = await addSnippetToCloud(brandContent);
      setBrandLibrary(prev => [snippet, ...prev.filter(s => s.content !== brandContent.trim())]);
    } catch (e) {
      console.warn('addSnippetToCloud failed', e);
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

    const refKeys = new Set(refImages.map(i => i.url || i.base64));
    const prodKeys = new Set(prodImages.map(i => i.url || i.base64));

    Promise.all(
      styleSource
        .filter(i => !refKeys.has(i.url || i.base64 || ''))
        .map(i => libraryItemToUploadedImageAsync(i).catch(e => { console.warn('apply brand ref load', e); return null; })),
    ).then(items => {
      const fresh = items.filter(Boolean) as any;
      if (fresh.length) setRefImages(prev => [...prev, ...fresh]);
    });

    Promise.all(
      productSource
        .filter(i => !prodKeys.has(i.url || i.base64 || ''))
        .map(i => libraryItemToUploadedImageAsync(i).catch(e => { console.warn('apply brand prod load', e); return null; })),
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
    combinedPrompt: string,
    contentForThis?: string,
    extraReferences: UploadedImage[] = [],
  ) => {
    const startTime = Date.now();
    let imageUrl: string;
    const brandContentToUse = contentForThis ?? brandContent;

    if (backend === 'coachio') {
      imageUrl = await generateBannerWithCoachio(
        selectedRef, selectedProd, combinedPrompt, brandContentToUse,
        aspectRatio, imageSize, coachioModel,
        (status) => setGenerationProgress(prev => ({ ...prev, [placeholder.id]: status })),
        extraReferences,
      );
    } else {
      imageUrl = await generateBannerWithGemini(
        selectedRef, selectedProd, combinedPrompt, brandContentToUse,
        aspectRatio, selectedModel, imageSize, extraReferences,
      );
    }

    const duration = (Date.now() - startTime) / 1000;

    // Persist to Supabase + auto-upload Gemini base64 to Bunny.
    // Defensive: never let history persistence sabotage a successful API result.
    let persistedImageUrl = imageUrl;
    try {
      const saved = await addHistoryToCloud({
        id: placeholder.id,
        imageUrl,
        promptUsed: combinedPrompt,
        timestamp: Date.now(),
        duration,
        model: backend === 'coachio' ? coachioModel : selectedModel,
        quality: imageSize,
        aspectRatio,
      });
      persistedImageUrl = saved.imageUrl; // Bunny CDN URL if Gemini base64 was uploaded
    } catch (e: any) {
      console.warn('addHistoryToCloud failed (banner shown to user but NOT saved to cloud)', e);
      setErrorMsg(`Lưu lên cloud thất bại: ${e?.message || 'unknown'}. Banner đang chỉ hiện local, sẽ mất khi reload.`);
    }

    return { imageUrl: persistedImageUrl, duration };
  };

  const handleGenerate = async () => {
    if (refImages.length === 0 && prodImages.length === 0) {
      setErrorMsg("Cần ít nhất 1 ảnh — Style Reference hoặc Product Image (không bắt buộc cả 2).");
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

    // Build the list of contents to render
    const contentsPlan: string[] = multiContent
      ? contents.map(c => c.trim()).filter(Boolean)
      : [brandContent.trim()];

    // Multi mode requires at least one non-empty content
    if (multiContent && contentsPlan.length === 0) {
      setErrorMsg("Multi-content mode is on — vui lòng nhập ít nhất một nội dung.");
      setIsGenerating(false);
      return;
    }

    // Single mode: still ok if empty (matches prior behavior of allowing empty brand content)
    if (!multiContent && contentsPlan.length === 0) {
      contentsPlan.push("");
    }

    // Persist non-empty contents into brand library (cloud) — fire and forget
    for (const c of contentsPlan) {
      if (c) {
        addSnippetToCloud(c)
          .then(snippet => setBrandLibrary(prev => [snippet, ...prev.filter(s => s.content !== c)]))
          .catch(e => console.warn('addSnippetToCloud (bulk) failed', e));
      }
    }

    const perContent = multiContent ? versionsPerContent : variantCount;

    type Plan = { placeholder: GeneratedBanner; content: string };
    const plan: Plan[] = [];
    for (const content of contentsPlan) {
      for (let i = 0; i < perContent; i++) {
        plan.push({
          placeholder: {
            id: Math.random().toString(36).substring(7),
            imageUrl: '',
            promptUsed: '',
            status: 'loading',
            timestamp: Date.now(),
          },
          content,
        });
      }
    }

    setResults(plan.map(p => p.placeholder));

    const typePrompt = getBannerTypePrompt(bannerType);

    const promises = plan.map(async ({ placeholder, content }) => {
      // Either pool can be empty; fall back to the other so user can run
      // with style-only or product-only inputs.
      const refPool = refImages.length > 0 ? refImages : prodImages;
      const prodPool = prodImages.length > 0 ? prodImages : refImages;
      const selectedRef = getRandomItem(refPool) as UploadedImage;
      const selectedProd = getRandomItem(prodPool) as UploadedImage;

      const varietyPrompts = [
        "Focus on clean lines and minimalism.",
        "Use bold, high-contrast aesthetics.",
        "Create a soft, elegant atmosphere.",
        "Make it dynamic and energetic.",
        "Ensure a balanced, professional composition."
      ];
      const randomNuance = getRandomItem(varietyPrompts);
      const combinedPrompt = [userPrompt, randomNuance, typePrompt].filter(Boolean).join('\n');

      try {
        const { imageUrl, duration } = await generateSingle(
          placeholder, selectedRef, selectedProd, combinedPrompt, content
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
          p.id === placeholder.id
            ? { ...p, status: 'error', refImage: selectedRef, prodImage: selectedProd, promptUsed: combinedPrompt }
            : p
        ));
      }
    });

    await Promise.all(promises);
    setIsGenerating(false);
    setGenerationProgress({});
  };

  const handleRegenerate = async (id: string, adjustmentPrompt: string, extras: UploadedImage[] = []) => {
    const target = results.find(r => r.id === id);
    if (!target || !target.refImage || !target.prodImage) {
      setErrorMsg("Cannot regenerate: missing reference or product image.");
      return;
    }

    setResults(prev => prev.map(p => p.id === id ? { ...p, status: 'loading' } : p));

    try {
      const adj = adjustmentPrompt?.trim();
      const extraNote = extras.length > 0
        ? ` Use the ${extras.length} extra reference image${extras.length > 1 ? 's' : ''} as additional style/composition cues.`
        : '';
      const combinedPrompt = `${target.promptUsed}.${adj ? ` Adjustment: ${adj}.` : ''}${extraNote}`;

      const newPlaceholder = { ...target, id };
      const { imageUrl, duration } = await generateSingle(
        newPlaceholder, target.refImage, target.prodImage, combinedPrompt, undefined, extras
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
    <div className="flex h-[calc(100vh-3.5rem)] w-full bg-canvas text-fg font-sans">

      {/* Sidebar Controls */}
      <div className="w-80 sm:w-96 flex-shrink-0 bg-surface border-r border-line flex flex-col h-full overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-fg">Controls</h2>
            <p className="text-[11px] text-subtle">Style ref + Product → AI generate</p>
          </div>
          <button
            onClick={() => setShowApiKeySettings(true)}
            className={`p-2 rounded-md transition-colors ${
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

          {/* Backend Selection */}
          <div>
            <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap size={14} /> Backend
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setBackend('gemini')}
                className={`text-xs py-2.5 px-3 rounded-md border text-center transition-all relative ${
                  backend === 'gemini'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-raised border-line-strong text-muted hover:bg-raised-2'
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
                    : 'bg-raised border-line-strong text-muted hover:bg-raised-2'
                }`}
              >
                Coachio AI
                {hasCoachioKey && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full"></span>
                )}
              </button>
            </div>
          </div>

          <div className="h-px bg-raised" />

          {/* Inputs */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider">Assets</h2>
              {/* Migrate library button hidden — migration done */}
              {false && (localRefCount + localProdCount) > 0 && (
                <button
                  onClick={migrateLocalLibraries}
                  className="text-[10px] text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20"
                >
                  Migrate library ({localRefCount + localProdCount})
                </button>
              )}
            </div>
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

          <div className="h-px bg-raised" />

          {/* Configuration */}
          <div>
            <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-4 flex items-center gap-2">
              <Settings2 size={14} /> Configuration
            </h2>

            {/* Brand Selector */}
            <div className="mb-4">
              <label className="text-sm text-muted mb-1 flex items-center gap-1.5">
                <Palette size={14} /> Brand
              </label>
              {brandProjects.length === 0 ? (
                <button
                  onClick={() => onNavigate('brand-style')}
                  className="w-full text-xs py-2 px-3 rounded-md border border-dashed border-line-strong bg-surface text-muted hover:bg-raised hover:border-pink-500/50 hover:text-pink-300 text-left transition-colors"
                >
                  + Tạo Brand Style để sử dụng nhanh
                </button>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <select
                    value={activeBrandId}
                    onChange={(e) => applyBrandProject(e.target.value)}
                    className="flex-1 min-w-0 bg-canvas border border-line rounded-md px-3 py-2 text-sm text-fg focus:outline-none focus:border-pink-500"
                  >
                    <option value="">— Không dùng brand —</option>
                    {brandProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {activeBrandId && (
                    <button
                      onClick={clearBrandSelection}
                      className="shrink-0 p-2 rounded-md bg-raised hover:bg-raised-2 text-muted hover:text-fg"
                      title="Bỏ chọn brand"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate('brand-style')}
                    className="shrink-0 p-2 rounded-md bg-raised hover:bg-raised-2 text-muted hover:text-fg border border-line-strong"
                    title="Quản lý brand projects"
                  >
                    <Settings2 size={14} />
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
                <label className="text-sm text-muted mb-1 flex items-center gap-1.5">
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
                            : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                        }`}
                      >
                        <div className="text-xs font-medium leading-tight">{model.name}</div>
                        <div className={`text-[10px] mt-0.5 font-mono ${active ? 'text-indigo-100/80' : 'text-subtle'}`}>
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
                <label className="text-sm text-muted mb-1 flex items-center gap-1.5">
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
                            : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                        }`}
                      >
                        <div className="text-xs font-medium leading-tight">{model.name}</div>
                        <div className={`text-[10px] mt-0.5 font-mono ${active ? 'text-orange-100/80' : 'text-subtle'}`}>
                          {model.id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Variants Count — meaning changes in multi-content mode */}
            {(() => {
              const nonEmptyContents = multiContent ? contents.filter(c => c.trim()).length : 0;
              const effectiveContents = Math.max(1, nonEmptyContents);
              const totalInMulti = effectiveContents * versionsPerContent;
              return (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-muted flex items-center gap-1.5">
                      <Hash size={14} />
                      {multiContent ? 'Phiên bản / content' : 'Số bản tạo'}
                    </label>
                    <span className="text-[11px] text-fg font-mono bg-raised px-2 py-0.5 rounded">
                      {multiContent ? versionsPerContent : variantCount}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={multiContent ? MAX_VERSIONS_PER_CONTENT : 10}
                    step={1}
                    value={multiContent ? versionsPerContent : variantCount}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (multiContent) setVersionsPerContent(n);
                      else setVariantCount(n);
                    }}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-[9px] text-gray-600 mt-0.5 px-0.5">
                    {multiContent ? (<><span>1</span><span>2</span><span>3</span></>) : (<><span>1</span><span>5</span><span>10</span></>)}
                  </div>
                  {multiContent && (
                    <p className="text-[11px] text-indigo-300 mt-1.5 bg-indigo-500/5 border border-indigo-500/20 rounded px-2 py-1">
                      Sẽ tạo <b>{totalInMulti}</b> banner ({effectiveContents} content × {versionsPerContent} phiên bản).
                      {nonEmptyContents === 0 && ' Nhập ít nhất một content để bắt đầu.'}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Quality Selection */}
            <div className="mb-4">
              <label className="text-sm text-muted mb-1 flex items-center gap-1.5">
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
                          ? 'bg-surface border-line text-gray-600 cursor-not-allowed opacity-50'
                          : active
                            ? `${accent.bg} ${accent.border} text-white`
                            : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
                      }`}
                    >
                      {size}
                      {backend === 'coachio' && (
                        <span className={`block text-[9px] mt-0.5 ${active && !disabled ? 'text-white/70' : 'text-subtle'}`}>{credit}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-muted mb-1 block">Aspect Ratio</label>
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
                          : 'bg-raised border-line-strong text-fg hover:bg-raised-2'
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
                <label className="text-sm text-muted flex items-center gap-1.5">
                  <Type size={14} /> Brand Content
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleBrandSave}
                    disabled={!brandContent.trim()}
                    className="text-[11px] px-2 py-1 rounded-md bg-raised hover:bg-raised-2 text-fg border border-line-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Lưu nội dung này vào thư viện"
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => setShowBrandLibrary(true)}
                    className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md bg-raised hover:bg-raised-2 text-fg border border-line-strong transition-colors"
                    title="Mở thư viện brand content"
                  >
                    <FolderOpen size={11} /> Thư viện
                    {brandLibrary.length > 0 && (
                      <span className="bg-brand text-white rounded-full px-1.5 py-px text-[9px] font-mono font-semibold min-w-[16px] text-center">
                        {brandLibrary.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              {!multiContent && (
                <textarea
                  value={brandContent}
                  onChange={(e) => setBrandContent(e.target.value)}
                  placeholder="e.g. 'Summer Sale 50% Off', Brand Name..."
                  className="w-full bg-canvas border border-line rounded-md p-3 text-sm text-fg focus:outline-none focus:border-indigo-500 transition-colors h-20 resize-none"
                />
              )}

              {multiContent && (
                <div className="space-y-2">
                  {contents.map((c, idx) => (
                    <div key={idx} className="relative">
                      <textarea
                        value={c}
                        onChange={(e) => {
                          const v = e.target.value;
                          setContents(prev => prev.map((x, i) => (i === idx ? v : x)));
                        }}
                        placeholder={`Content #${idx + 1} — e.g. 'Hè rực rỡ, Sale 50%'`}
                        className="w-full bg-canvas border border-line rounded-md p-3 pr-9 text-sm text-fg focus:outline-none focus:border-indigo-500 transition-colors h-16 resize-none"
                      />
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <span className="text-[10px] text-subtle font-mono bg-surface px-1.5 py-0.5 rounded">#{idx + 1}</span>
                        <button
                          onClick={() => saveContentSnippet(c)}
                          disabled={!c.trim()}
                          className="text-subtle hover:text-emerald-300 disabled:opacity-30 disabled:hover:text-subtle transition-colors"
                          title="Lưu content này vào thư viện"
                        >
                          <Save size={14} />
                        </button>
                        {contents.length > 1 && (
                          <button
                            onClick={() => setContents(prev => prev.filter((_, i) => i !== idx))}
                            className="text-subtle hover:text-red-400 transition-colors"
                            title="Xoá content"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setContents(prev => prev.length < MAX_CONTENTS ? [...prev, ""] : prev)}
                    disabled={contents.length >= MAX_CONTENTS}
                    className="w-full text-xs py-2 rounded-md border border-dashed border-line-strong text-muted hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-500/5 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={14} /> Create new content
                    <span className="text-[10px] text-subtle font-mono">{contents.length}/{MAX_CONTENTS}</span>
                  </button>
                </div>
              )}

              {/* Multi-content toggle */}
              <label className="mt-2 flex items-start gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={multiContent}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setMultiContent(on);
                    if (on && contents.every(c => !c.trim()) && brandContent.trim()) {
                      setContents([brandContent.trim()]);
                    }
                  }}
                  className="mt-0.5 accent-indigo-500"
                />
                <span className="text-[11px] text-muted leading-snug">
                  <span className="text-fg font-medium flex items-center gap-1">
                    <ListPlus size={12} /> Multi-content mode
                  </span>
                  Tạo tối đa {MAX_CONTENTS} nội dung khác nhau. Mỗi nội dung sẽ sinh {versionsPerContent} phiên bản.
                </span>
              </label>
            </div>

            {/* Banner Type */}
            <div className="mb-4">
              <label className="text-sm text-muted mb-1 flex items-center gap-1.5">
                <Megaphone size={14} /> Loại banner
              </label>
              <select
                value={bannerType}
                onChange={(e) => setBannerType(e.target.value as BannerType)}
                className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm text-fg focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {BANNER_TYPE_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-subtle mt-1 leading-snug">
                {BANNER_TYPE_OPTIONS.find(o => o.id === bannerType)?.hint}
              </p>
            </div>

            <div className="mb-2">
              <label className="text-sm text-muted mb-1 block">Prompt Adjustments (Optional)</label>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="e.g. Make the background darker..."
                className="w-full bg-canvas border border-line rounded-md p-3 text-sm text-fg focus:outline-none focus:border-indigo-500 transition-colors h-20 resize-none"
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
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all transform ${
              isGenerating
                ? 'bg-raised-2 cursor-not-allowed opacity-50 text-fg'
                : backend === 'coachio'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 hover:scale-[1.02] active:scale-95'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:scale-[1.02] active:scale-95'
            }`}
          >
            {isGenerating ? (
              <>
                <Wand2 className="animate-spin" size={20} /> Generating {results.length || (multiContent ? Math.max(1, contents.filter(c => c.trim()).length) * versionsPerContent : variantCount)} variant{(results.length || 1) !== 1 ? 's' : ''}...
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
      <div className="flex-1 flex flex-col h-full bg-canvas relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 border-b border-line bg-surface/50 backdrop-blur-sm z-10">
          <h2 className="font-medium text-fg">Generated Workspace</h2>
          <div className="flex items-center gap-4 text-xs text-subtle">
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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand/10 via-canvas to-canvas pointer-events-none" />
          <ResultViewer
            results={results}
            onRegenerate={handleRegenerate}
            onToggleVote={toggleVote}
            isVoted={(id) => votes.some(v => v.id === id)}
          />
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
            className="bg-surface border border-line-strong rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/10 text-indigo-400 p-2 rounded-md"><Type size={18} /></div>
                <div>
                  <h3 className="text-base font-semibold text-fg">Thư viện Brand Content</h3>
                  <p className="text-xs text-subtle">Bấm vào dòng để chèn vào ô brand · {brandLibrary.length}/30</p>
                </div>
              </div>
              <button
                onClick={() => setShowBrandLibrary(false)}
                className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {brandLibrary.length === 0 ? (
                <div className="text-center text-subtle text-sm py-16">
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
                      <li key={item.id} className="bg-canvas border border-line hover:border-indigo-500/60 rounded-md transition-colors">
                        <div className="flex items-stretch gap-0">
                          <div
                            className={`flex-1 p-3 text-sm text-fg whitespace-pre-wrap break-words cursor-pointer ${
                              expanded ? '' : 'line-clamp-3'
                            }`}
                            onClick={() => toggleBrandExpanded(item.id)}
                            title="Bấm để xem thêm / thu gọn"
                          >
                            {item.content}
                          </div>
                          <div className="flex flex-col border-l border-line">
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
                              className="flex-1 px-3 text-muted hover:bg-red-500/80 hover:text-fg border-t border-line transition-colors"
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
                            className="block w-full text-[10px] text-subtle hover:text-indigo-300 px-3 py-1 text-left border-t border-line/50"
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
