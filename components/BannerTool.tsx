import React, { useState } from 'react';
import { Wand2, AlertCircle, ArrowLeft, Key, Trash2, X, Type } from 'lucide-react';
import { UploadedImage, GeneratedBanner, AppPage, LibraryCategory, LibraryImage, BrandSnippet, BrandProject, VotedBanner, HistoryItem } from '../types';
import { SessionsPanel } from './SessionsPanel';
import { HistoryEditModal } from './HistoryEditModal';
import { ImageUploader } from './ImageUploader';
import { ResultViewer } from './ResultViewer';
import { generateBannerWithGemini } from '../services/geminiService';
import { generateBannerWithCoachio, getCoachioApiKey } from '../services/coachioService';
import {
  RefCategory, RefBanner,
  listRefCategories, listRefBanners, insightsToPromptHint,
} from '../services/refBannersService';
import { BrandBrief } from '../types';
import { listSelectedBriefsForBrand, deleteBrief } from '../services/brandBriefService';
import { BrandRow } from './banner/BrandRow';
import { ReferencesRow } from './banner/ReferencesRow';
import { ReferencePickerModal } from './banner/ReferencePickerModal';
import { IndustryPickerModal, MAX_INDUSTRY_REFS } from './banner/IndustryPickerModal';
import { ContentSection } from './banner/ContentSection';
import { MultiContentModal } from './banner/MultiContentModal';
import { OutputRow } from './banner/OutputRow';
import { AdvancedPopover } from './banner/AdvancedPopover';
import {
  getGeminiApiKey,
  getActiveBackend,
  setActiveBackend,
  getLibrary,
} from '../services/storageService';
import { addHistoryToCloud, listHistoryFromCloud, removeHistoryFromCloud } from '../services/historyService';
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
  // Default to Performance Ads — most common use case for this tool.
  const [bannerType, setBannerType] = useState<BannerType>('ads');
  const [multiContent, setMultiContent] = useState<boolean>(false);
  const [contents, setContents] = useState<string[]>([""]);
  // Brand briefs auto-loaded when multi-mode + brand picked. User can toggle
  // per-brief which to use as content variants in the gen plan.
  const [brandBriefs, setBrandBriefs] = useState<BrandBrief[]>([]);
  const [enabledBriefIds, setEnabledBriefIds] = useState<Set<string>>(new Set());
  // URL Crawl briefs — session-scoped (không lưu brand). Sinh trong
  // MultiContentModal khi user paste URL + click Crawl.
  const [urlBriefs, setUrlBriefs] = useState<BrandBrief[]>([]);
  const [enabledUrlBriefIds, setEnabledUrlBriefIds] = useState<Set<string>>(new Set());
  // Brand JSON style guide — tách ra state riêng thay vì nhồi vào userPrompt.
  const [brandJsonPrompt, setBrandJsonPrompt] = useState<string>('');
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  const [showMultiContentModal, setShowMultiContentModal] = useState(false);
  const [versionsPerContent, setVersionsPerContent] = useState<number>(2);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3-pro-image-preview");
  const [coachioModel, setCoachioModel] = useState<string>("gpt_image_2");
  const [imageSize, setImageSize] = useState<string>("1K");
  const [variantCount, setVariantCount] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [results, setResults] = useState<GeneratedBanner[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Gemini backend hidden — Coachio is the only generation path now.
  // backend state retained for the existing call-site switch; locked to 'coachio'.
  const [backend, setBackendState] = useState<BackendType>('coachio');
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, string>>({});
  const [refLibrary, setRefLibrary] = useState<LibraryImage[]>([]);
  const [prodLibrary, setProdLibrary] = useState<LibraryImage[]>([]);

  // Industry / category curated refs — admin uploads → user picks ngành →
  // hệ thống tự append refs đó vào extra references khi gen.
  const [industries, setIndustries] = useState<RefCategory[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string>('');
  const [industryRefs, setIndustryRefs] = useState<RefBanner[]>([]);
  // Which industry refs the user has ticked. Seeded to the first MAX
  // whenever the ref list loads; user can retick in the picker modal.
  const [selectedIndustryRefIds, setSelectedIndustryRefIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    listRefCategories().then(setIndustries).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!selectedIndustry) {
      setIndustryRefs([]);
      setSelectedIndustryRefIds(new Set());
      return;
    }
    listRefBanners(selectedIndustry)
      .then(refs => {
        setIndustryRefs(refs);
        setSelectedIndustryRefIds(new Set(refs.slice(0, MAX_INDUSTRY_REFS).map(r => r.id)));
      })
      .catch(() => { setIndustryRefs([]); setSelectedIndustryRefIds(new Set()); });
  }, [selectedIndustry]);

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

  // History for the workspace bottom Sessions panel.
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [editingItem, setEditingItem] = useState<HistoryItem | null>(null);
  const refreshHistory = React.useCallback(() => {
    listHistoryFromCloud().then(setHistory).catch(() => {});
  }, []);

  const deleteHistoryItem = React.useCallback(async (item: HistoryItem) => {
    try {
      await removeHistoryFromCloud(item.id);
      setHistory(prev => prev.filter(h => h.id !== item.id));
    } catch (e: any) {
      console.warn('deleteHistoryItem failed', e);
      alert(`Xoá lỗi: ${e?.message || 'unknown'}`);
    }
  }, []);

  const deleteHistorySession = React.useCallback(async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => removeHistoryFromCloud(id).catch(e => {
        console.warn('deleteHistorySession item failed', id, e);
      })));
      setHistory(prev => prev.filter(h => !ids.includes(h.id)));
    } catch (e: any) {
      console.warn('deleteHistorySession failed', e);
    }
  }, []);

  const removeBrandBrief = React.useCallback(async (briefId: string) => {
    if (!confirm('Xoá brief này khỏi brand? Không undo được (sẽ mất luôn ở Brand Style).')) return;
    try {
      await deleteBrief(briefId);
      setBrandBriefs(prev => prev.filter(b => b.id !== briefId));
      setEnabledBriefIds(prev => {
        const next = new Set(prev);
        next.delete(briefId);
        return next;
      });
    } catch (e: any) {
      alert(`Xoá brief lỗi: ${e?.message || 'unknown'}`);
    }
  }, []);

  // Initial cloud loads
  React.useEffect(() => {
    listVotesFromCloud().then(setVotes).catch(() => {});
    listSnippetsFromCloud().then(setBrandLibrary).catch(() => {});
    listBrandProjectsFromCloud().then(setBrandProjects).catch(() => {});
    refreshHistory();
  }, [refreshHistory]);

  // Auto-load brand's selected briefs when a brand is applied. Default all
  // enabled — user can untick per-brief if they don't want it in this run.
  React.useEffect(() => {
    if (!activeBrandId) { setBrandBriefs([]); setEnabledBriefIds(new Set()); return; }
    listSelectedBriefsForBrand(activeBrandId)
      .then(b => {
        setBrandBriefs(b);
        setEnabledBriefIds(new Set(b.map(x => x.id)));
      })
      .catch(() => { setBrandBriefs([]); setEnabledBriefIds(new Set()); });
  }, [activeBrandId]);

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
  // Gemini path locked off — these are kept for the unreachable code branches
  // that still type-check the legacy flow. Re-enable by un-hiding the backend
  // selector and calling setBackend('gemini').
  const hasGoogleKey = !!getGeminiApiKey() || (import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== 'your_api_key_here');
  const setBackend = (b: BackendType) => {
    setBackendState(b);
    setActiveBackend(b);
  };
  void hasGoogleKey; void setBackend;

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

    // Brand JSON prompt lưu vào state riêng brandJsonPrompt — không nhét
    // vào userPrompt textarea nữa (đỡ noise). Gen sẽ nhét vào BRAND STYLE
    // section của combinedPrompt.
    if (project.jsonPrompt.trim()) {
      setBrandJsonPrompt(project.jsonPrompt.trim());
    }

    setActiveBrandId(project.id);
  };

  const clearBrandSelection = () => {
    setActiveBrandId('');
    setBrandJsonPrompt('');
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
    combinedPrompt: string,
    contentForThis?: string,
    extraReferences: UploadedImage[] = [],
    sessionId?: string,
  ) => {
    const startTime = Date.now();
    let imageUrl: string;
    const brandContentToUse = contentForThis ?? brandContent;

    // Industry refs: user tick/untick which curated refs to teach the model.
    // Text-only path — image URLs are NEVER sent to Coachio because:
    //   1. GPT Image 2 / Nano Banana Pro cap at 5 refs total, and user's
    //      style + product refs already claim most of that budget.
    //   2. Insights (layout / palette / composition) carry the style intent
    //      as text without eating the reference slot budget.
    // adminRefUrls stays empty; only the hint text is passed.
    const adminRefs = industryRefs
      .filter(r => selectedIndustryRefIds.has(r.id))
      .slice(0, MAX_INDUSTRY_REFS);
    const adminRefUrls: string[] = [];
    const adminInsightHint = insightsToPromptHint(adminRefs);

    if (backend === 'coachio') {
      imageUrl = await generateBannerWithCoachio(
        selectedRef, selectedProd, combinedPrompt, brandContentToUse,
        aspectRatio, imageSize, coachioModel,
        (status) => setGenerationProgress(prev => ({ ...prev, [placeholder.id]: status })),
        extraReferences,
        adminRefUrls,
        adminInsightHint || undefined,
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
        featureType: 'banner',
        sessionId,
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

    // Build the list of content sources — mỗi source có text (nội dung
    // banner) và optional brief (context bổ sung cho AI). Multi mode gộp
    // 3 nguồn: manual + brand briefs + URL crawl briefs. Single mode chỉ
    // dùng brandContent.
    type ContentSource = { text: string; brief?: BrandBrief };
    const enabledBriefs = brandBriefs.filter(b => enabledBriefIds.has(b.id));
    const enabledUrlBrief = urlBriefs.filter(b => enabledUrlBriefIds.has(b.id));
    const briefSources: ContentSource[] = [...enabledBriefs, ...enabledUrlBrief]
      .map(b => ({
        text: (b.primaryText || b.primaryMessage || b.headline || '').trim(),
        brief: b,
      }))
      .filter(s => s.text);
    const manualSources: ContentSource[] = contents
      .map(c => ({ text: c.trim() }))
      .filter(s => s.text);

    const contentSources: ContentSource[] = multiContent
      ? [...manualSources, ...briefSources]
      : [{ text: brandContent.trim() }];

    // Multi mode requires at least one non-empty content
    if (multiContent && contentSources.length === 0) {
      setErrorMsg("Multi-content mode is on — vui lòng nhập ít nhất một nội dung.");
      setIsGenerating(false);
      return;
    }

    // Single mode: still ok if empty (matches prior behavior of allowing empty brand content)
    if (!multiContent && contentSources.length === 0) {
      contentSources.push({ text: "" });
    }

    // Persist non-empty MANUAL contents into brand library (cloud) —
    // briefs không nhét lại vì đã có trong brand.
    for (const s of contentSources) {
      if (s.text && !s.brief) {
        addSnippetToCloud(s.text)
          .then(snippet => setBrandLibrary(prev => [snippet, ...prev.filter(sn => sn.content !== s.text)]))
          .catch(e => console.warn('addSnippetToCloud (bulk) failed', e));
      }
    }

    const perContent = multiContent ? versionsPerContent : variantCount;

    type Plan = { placeholder: GeneratedBanner; source: ContentSource };
    const plan: Plan[] = [];
    for (const source of contentSources) {
      for (let i = 0; i < perContent; i++) {
        plan.push({
          placeholder: {
            id: Math.random().toString(36).substring(7),
            imageUrl: '',
            promptUsed: '',
            status: 'loading',
            timestamp: Date.now(),
          },
          source,
        });
      }
    }

    setResults(plan.map(p => p.placeholder));

    const typePrompt = getBannerTypePrompt(bannerType);
    // One session = one Generate click. Every banner in this batch shares
    // the sessionId so the Sessions panel groups them together even if the
    // per-banner timestamps drift due to async completion order.
    const sessionId = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const promises = plan.map(async ({ placeholder, source }) => {
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

      // Structured user-side prompt — sections rõ ràng, model dễ parse hơn
      // string join lộn xộn. Order: BRAND STYLE → BRIEF → TYPE → USER
      // ADJUSTMENTS → STYLE VARIETY.
      const sections: string[] = [];
      if (brandJsonPrompt.trim()) {
        sections.push(`BRAND STYLE (JSON):\n${brandJsonPrompt.trim()}`);
      }
      if (source.brief) {
        const b = source.brief;
        const briefLines: string[] = [`Type: ${b.briefType}`];
        if (b.headline)   briefLines.push(`Headline: "${b.headline}"`);
        if (b.cta)        briefLines.push(`CTA: ${b.cta}`);
        if (b.toneNotes)  briefLines.push(`Tone: ${b.toneNotes}`);
        sections.push(`BRIEF CONTEXT:\n${briefLines.join('\n')}`);
      }
      if (typePrompt) sections.push(typePrompt);
      if (userPrompt.trim()) sections.push(`USER ADJUSTMENTS:\n${userPrompt.trim()}`);
      sections.push(`STYLE VARIETY: ${randomNuance}`);

      const combinedPrompt = sections.join('\n\n');

      try {
        const { imageUrl, duration } = await generateSingle(
          placeholder, selectedRef, selectedProd, combinedPrompt, source.text,
          [], sessionId,
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
    // Pull the fresh batch into the Sessions panel.
    refreshHistory();
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
    ? { bg: 'bg-brand', border: 'border-brand' }
    : { bg: 'bg-brand', border: 'border-brand' };
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
            <p className="text-[11px] text-subtle">Brand · References · Content → AI</p>
          </div>
          <button
            onClick={() => setShowApiKeySettings(true)}
            className={`p-2 rounded-md transition-colors ${
              hasCoachioKey
                ? 'bg-success-fg/10 text-success hover:bg-success-fg/20'
                : 'bg-raised text-muted hover:bg-raised-2 hover:text-white'
            }`}
            title="API Key Settings"
          >
            <Key size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Backend: Coachio only — Gemini path hidden but kept in code for future re-enable */}
          {!hasCoachioKey && (
            <div className="status-warning border rounded-md px-3 py-2.5 text-xs flex items-center justify-between gap-2">
              <span>Chưa có Coachio API key — bắt buộc để generate.</span>
              <button
                onClick={() => setShowApiKeySettings(true)}
                className="text-xs font-semibold underline hover:no-underline shrink-0"
              >
                Thêm key
              </button>
            </div>
          )}

          {/* References — 3 compact cards, each opens picker modal.
              Style card dims when an industry is picked (industry refs cover
              styling and adding manual style refs is optional then). */}
          <ReferencesRow
            styleImages={refImages}
            productImages={prodImages}
            industryLabel={
              selectedIndustry
                ? (() => {
                    const c = industries.find(x => x.id === selectedIndustry);
                    return c ? `${c.emoji} ${c.label}` : undefined;
                  })()
                : undefined
            }
            industryRefCount={
              selectedIndustry
                ? Math.min(selectedIndustryRefIds.size, MAX_INDUSTRY_REFS)
                : undefined
            }
            styleDisabledHint={
              selectedIndustry && selectedIndustryRefIds.size > 0
                ? 'Ngành đã cover style'
                : undefined
            }
            onOpenStyle={() => setShowStyleModal(true)}
            onOpenProduct={() => setShowProductModal(true)}
            onOpenIndustry={() => setShowIndustryModal(true)}
          />

          <div className="h-px bg-raised" />

          {/* Brand — compact row only. Briefs live inside MultiContentModal */}
          <BrandRow
            projects={brandProjects}
            activeBrandId={activeBrandId}
            onApply={applyBrandProject}
            onClear={clearBrandSelection}
            onNavigate={onNavigate}
          />

          {/* Configuration wrapper — bundles the section-below-references */}
          <div className="space-y-4">

            {/* Output row — Aspect / Quality / Qty inline selects (Sprint H5)
                totalVariants is the single source of truth used by both the
                Content chip and this row's preview. */}
            {(() => {
              const nonEmptyContents = contents.filter(c => c.trim()).length;
              const enabledBriefCount = enabledBriefIds.size;
              const enabledUrlBriefCount = enabledUrlBriefIds.size;
              const totalVariants = multiContent
                ? nonEmptyContents + enabledBriefCount + enabledUrlBriefCount
                : 0;
              // At least 1 content is always sent (falls back to empty in
              // single-mode). Used for total banner preview math.
              const effectiveContents = Math.max(1, multiContent ? totalVariants : 1);
              const versions = multiContent ? versionsPerContent : variantCount;
              const total = multiContent ? effectiveContents * versions : versions;
              return (
                <>
                  <OutputRow
                    aspectRatio={aspectRatio}
                    aspectRatios={currentAspectRatios}
                    onChangeAspect={setAspectRatio}
                    quality={imageSize}
                    qualities={['1K', '2K', '4K']}
                    isQualityDisabled={isResolutionDisabled}
                    onChangeQuality={setImageSize}
                    qtyLabel={multiContent ? 'Bản / biến thể' : 'Số bản'}
                    qty={versions}
                    qtyMax={multiContent ? MAX_VERSIONS_PER_CONTENT : 10}
                    onChangeQty={(n) => multiContent ? setVersionsPerContent(n) : setVariantCount(n)}
                    totalPreview={total}
                    totalHint={multiContent
                      ? `${effectiveContents} biến thể × ${versions} bản`
                      : undefined}
                  />

                  {/* Content — compact primary + variants chip → MultiContentModal (Sprint H3) */}
                  <ContentSection
                    primaryContent={multiContent ? (contents[0] || '') : brandContent}
                    onChangePrimary={(v) => {
                      if (multiContent) {
                        setContents(prev => {
                          const next = [...prev];
                          next[0] = v;
                          return next;
                        });
                      } else {
                        setBrandContent(v);
                      }
                    }}
                    multiOn={multiContent}
                    onToggleMulti={(on) => {
                      setMultiContent(on);
                      if (on && contents.every(c => !c.trim()) && brandContent.trim()) {
                        setContents([brandContent.trim()]);
                      }
                    }}
                    totalVariants={totalVariants}
                    onOpenManage={() => setShowMultiContentModal(true)}
                    onSavePrimarySnippet={() => handleBrandSave()}
                    onOpenLibrary={() => setShowBrandLibrary(true)}
                    librarySize={brandLibrary.length}
                  />
                </>
              );
            })()}

            <div className="mb-4" />

            {/* Prompt Adjustments — kept inline (small textarea) */}
            <div>
              <label className="text-[10px] text-subtle uppercase tracking-wider block mb-1">
                Điều chỉnh prompt (tuỳ chọn)
              </label>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="VD: Nền tối hơn, màu tươi hơn..."
                className="w-full bg-canvas border border-line rounded-md p-3 text-sm text-fg focus:outline-none focus:border-brand h-16 resize-none"
              />
            </div>

            {/* Advanced — collapsed, holds model + banner type + JSON prompt */}
            {(() => {
              const activeBrand = brandProjects.find(p => p.id === activeBrandId);
              const jsonFromBrand = !!(activeBrand && activeBrand.jsonPrompt && brandJsonPrompt === activeBrand.jsonPrompt.trim());
              return (
                <AdvancedPopover
                  coachioModel={coachioModel}
                  coachioModels={[
                    { id: 'google_image_gen_banana_pro', name: 'Nano Banana Pro' },
                    { id: 'gpt_image_2', name: 'GPT Image 2' },
                  ]}
                  onChangeCoachioModel={setCoachioModel}
                  bannerType={bannerType}
                  bannerTypeOptions={BANNER_TYPE_OPTIONS}
                  onChangeBannerType={(id) => setBannerType(id as BannerType)}
                  jsonPrompt={brandJsonPrompt}
                  onChangeJsonPrompt={setBrandJsonPrompt}
                  jsonFromBrand={jsonFromBrand}
                />
              );
            })()}
          </div>

          {errorMsg && (
            <div className="bg-danger-soft border border-danger-fg/40 rounded-md p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{errorMsg}</p>
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
                <Wand2 size={20} /> Generate via {coachioModel === 'gpt_image_2' ? 'GPT Image 2' : 'Nano Banana Pro'}
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
              <span className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-warning-fg animate-pulse' : 'bg-success-fg'}`}></span>
              {isGenerating ? 'Generating' : 'Ready'}
            </span>
            <span className="px-2 py-0.5 rounded-full border bg-brand/10 border-brand/30 text-brand font-mono">
              {coachioModel === 'gpt_image_2' ? 'GPT Image 2' : 'Nano Banana Pro'}
            </span>
            <span className="font-mono">{imageSize} · {aspectRatio}</span>
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative flex flex-col">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand/10 via-canvas to-canvas pointer-events-none" />
          {/* Layout flip based on whether we have current results:
              - No results → SessionsPanel occupies the full workspace so past
                banners are the primary content (bigger thumbnails, grid mode).
              - Has results → ResultViewer takes the top, SessionsPanel becomes
                a compact bottom strip showing recent runs for quick reference. */}
          {results.length === 0 ? (
            <div className="relative flex-1 min-h-0 flex flex-col z-10">
              <SessionsPanel
                history={history}
                featureType="banner"
                fullHeight
                onSelectItem={(it) => setEditingItem(it)}
                onDeleteItem={deleteHistoryItem}
                onDeleteSession={deleteHistorySession}
                onOpenFullHistory={() => onNavigate('history')}
              />
            </div>
          ) : (
            <>
              <div className="relative flex-1 min-h-0 overflow-hidden">
                <ResultViewer
                  results={results}
                  onRegenerate={handleRegenerate}
                  onToggleVote={toggleVote}
                  isVoted={(id) => votes.some(v => v.id === id)}
                />
              </div>
              <div className="relative shrink-0 z-10">
                <SessionsPanel
                  history={history}
                  featureType="banner"
                  onSelectItem={(it) => setEditingItem(it)}
                  onOpenFullHistory={() => onNavigate('history')}
                />
              </div>
            </>
          )}
        </main>
      </div>

      {/* History edit modal — shared with the HistoryPage flow */}
      {editingItem && (
        <HistoryEditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={() => { refreshHistory(); }}
        />
      )}

      {/* API Key Settings Modal */}
      {showApiKeySettings && (
        <ApiKeySettings onClose={() => setShowApiKeySettings(false)} />
      )}

      {/* Style / Product reference pickers (Sprint H2) */}
      {showStyleModal && (
        <ReferencePickerModal
          kind="style"
          images={refImages}
          library={refLibrary}
          onUpload={(f) => handleUpload(f, 'ref')}
          onRemove={(id) => handleRemove(id, 'ref')}
          onLibrarySelect={(item) => handleLibrarySelect(item, 'ref')}
          onLibraryDelete={(id) => handleLibraryDelete(id, 'ref')}
          onClose={() => setShowStyleModal(false)}
        />
      )}
      {showProductModal && (
        <ReferencePickerModal
          kind="product"
          images={prodImages}
          library={prodLibrary}
          onUpload={(f) => handleUpload(f, 'prod')}
          onRemove={(id) => handleRemove(id, 'prod')}
          onLibrarySelect={(item) => handleLibrarySelect(item, 'prod')}
          onLibraryDelete={(id) => handleLibraryDelete(id, 'prod')}
          onClose={() => setShowProductModal(false)}
        />
      )}
      {showIndustryModal && (
        <IndustryPickerModal
          industries={industries}
          selectedIndustry={selectedIndustry}
          onChangeIndustry={setSelectedIndustry}
          industryRefs={industryRefs}
          selectedRefIds={selectedIndustryRefIds}
          onChangeSelectedRefIds={setSelectedIndustryRefIds}
          onClose={() => setShowIndustryModal(false)}
        />
      )}
      {showMultiContentModal && (
        <MultiContentModal
          contents={contents}
          onChangeContents={setContents}
          allBriefs={brandBriefs}
          enabledBriefIds={enabledBriefIds}
          onChangeEnabledBriefIds={setEnabledBriefIds}
          onDeleteBrief={removeBrandBrief}
          urlBriefs={urlBriefs}
          onChangeUrlBriefs={setUrlBriefs}
          enabledUrlBriefIds={enabledUrlBriefIds}
          onChangeEnabledUrlBriefIds={setEnabledUrlBriefIds}
          onSaveSnippet={(c) => saveContentSnippet(c)}
          onOpenLibrary={() => { setShowMultiContentModal(false); setShowBrandLibrary(true); }}
          onNavigateToBrandStyle={onNavigate}
          maxContents={MAX_CONTENTS}
          onClose={() => setShowMultiContentModal(false)}
        />
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
                <div className="bg-canvas text-brand p-2 rounded-md"><Type size={18} /></div>
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
                      <li key={item.id} className="bg-canvas border border-line hover:border-brand/60 rounded-md transition-colors">
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
                              className="flex-1 px-3 text-[11px] text-brand hover:bg-canvas transition-colors"
                              title="Dùng nội dung này"
                            >
                              Dùng
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBrandDelete(item.id)}
                              className="flex-1 px-3 text-muted hover:bg-danger-soft hover:text-fg border-t border-line transition-colors"
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
                            className="block w-full text-[10px] text-subtle hover:text-brand px-3 py-1 text-left border-t border-line/50"
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
