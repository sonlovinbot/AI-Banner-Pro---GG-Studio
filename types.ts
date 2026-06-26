export interface UploadedImage {
  id: string;
  url: string;
  file: File;
  base64: string;
  mimeType: string;
}

export interface GeneratedBanner {
  id: string;
  imageUrl: string;
  promptUsed: string;
  status: 'loading' | 'success' | 'error';
  timestamp: number;
  duration?: number;
  refImage?: UploadedImage;
  prodImage?: UploadedImage;
}

export interface GenerationConfig {
  userPrompt: string;
  brandContent: string;
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
  model: string;
  quality: "1K" | "2K" | "4K";
}

export interface HistoryItem {
  id: string;
  imageUrl: string;
  promptUsed: string;
  timestamp: number;
  duration?: number;
  model: string;
  quality: string;
  aspectRatio: string;
  /** id of the banner this was edited from. Empty for root versions. */
  parentId?: string;
  /** 1 for root, 2+ for each successive edit. */
  version?: number;
}

export type AppPage = 'menu' | 'banner' | 'history' | 'brand-style' | 'ugc-studio' | 'ads-manager';

export type LibraryCategory = 'ref' | 'prod' | 'face';

export interface LibraryImage {
  id: string;
  /** @deprecated for new data — kept for legacy localStorage entries */
  base64?: string;
  /** Bunny CDN URL (new cloud entries always have this) */
  url?: string;
  mimeType: string;
  fileName: string;
  addedAt: number;
}

/** Returns the renderable src for an <img>: prefer CDN url, fall back to base64. */
export function libraryImageSrc(img: LibraryImage | undefined | null): string {
  if (!img) return '';
  return img.url || img.base64 || '';
}

export interface BrandSnippet {
  id: string;
  content: string;
  addedAt: number;
}

export interface VotedBanner {
  id: string;
  imageUrl: string;
  promptUsed: string;
  brandContent: string;
  bannerType: string;
  aspectRatio: string;
  model: string;
  votedAt: number;
}

// ===== Ads Manager =====

export type AdCampaignObjective =
  | 'TRAFFIC'
  | 'CONVERSIONS'
  | 'REACH'
  | 'ENGAGEMENT'
  | 'MESSAGES'
  | 'LEAD_GENERATION'
  | 'APP_INSTALLS'
  | 'BRAND_AWARENESS';

export type AdCampaignStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface AdCampaign {
  id: string;
  name: string;
  objective?: AdCampaignObjective;
  dailyBudget?: number;          // VND
  tags: string[];
  status: AdCampaignStatus;
  metaCampaignId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type AdCreativeStatus =
  | 'draft'
  | 'ready'
  | 'pushing'
  | 'pushed'
  | 'paused'
  | 'failed'
  | 'archived';

export type AdCreativeSource = 'user' | 'agent' | 'meta-import' | 'clone';

export type AdCTA =
  | 'SHOP_NOW'
  | 'LEARN_MORE'
  | 'SIGN_UP'
  | 'BUY_NOW'
  | 'BOOK_TRAVEL'
  | 'DOWNLOAD'
  | 'CONTACT_US'
  | 'GET_QUOTE'
  | 'MESSAGE_PAGE'
  | 'SUBSCRIBE'
  | 'WATCH_MORE'
  | 'GET_OFFER'
  | 'INSTALL_MOBILE_APP'
  | 'NO_BUTTON';

export interface AdAudienceRef {
  savedId?: string;
  name?: string;
  notes?: string;
}

export interface AdInsightSnapshot {
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  spend?: number;
  conversions?: number;
  revenue?: number;
  roas?: number;
}

export interface AdCreative {
  id: string;
  campaignId?: string;
  name?: string;
  bannerId?: string;
  // Copy
  primaryText?: string;
  headline?: string;
  description?: string;
  cta?: AdCTA;
  destinationUrl?: string;
  displayLink?: string;
  // Audience
  audienceRef?: AdAudienceRef;
  // Status
  status: AdCreativeStatus;
  tags: string[];
  // Source
  source: AdCreativeSource;
  importedFromMeta?: boolean;
  originalMetaAdId?: string;
  derivedFromCreativeId?: string;
  // Meta linkage
  metaAdId?: string;
  metaCreativeId?: string;
  metaAdsetId?: string;
  pushedAt?: number;
  pushError?: string;
  // Performance
  lastInsightAt?: number;
  insights?: AdInsightSnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface BrandProject {
  id: string;
  name: string;
  brandInfo: string;
  eventInfo: string;
  jsonPrompt: string;
  logo?: LibraryImage;
  /** @deprecated use styleReferences */
  references?: LibraryImage[];
  styleReferences: LibraryImage[];
  productReferences: LibraryImage[];
  createdAt: number;
  updatedAt: number;
}
