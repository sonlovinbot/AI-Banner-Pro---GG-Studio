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

export type AppPage = 'menu' | 'banner' | 'history' | 'brand-style' | 'ugc-studio';

export type LibraryCategory = 'ref' | 'prod' | 'face';

export interface LibraryImage {
  id: string;
  base64: string;
  mimeType: string;
  fileName: string;
  addedAt: number;
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
