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

/** Which tool generated the item — drives history tabs + workspace panel
 *  filtering. Extend when we add more tools. */
export type FeatureType = 'banner' | 'ugc';

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
  /** Tool that produced this item. Defaults to 'banner' if missing (backfilled
   *  server-side by the sprint-history-tabs migration). */
  featureType?: FeatureType;
  /** All items generated within the same Generate click share a sessionId.
   *  Client-side bucketing by timestamp is used when this is empty. */
  sessionId?: string;
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

// ===== Ads Studio Chat =====

export type AdChatRole = 'system' | 'user' | 'assistant';

export type AdChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AdChatMessage {
  id: string;
  sessionId: string;
  role: AdChatRole;
  content: AdChatContentPart[];
  /** banner_history ids attached to this message (for traceability) */
  attachedBannerIds?: string[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  createdAt: number;
}

export interface AdChatSession {
  id: string;
  title?: string;
  /** if null, uses the global default from localStorage */
  systemPrompt?: string;
  attachedBannerIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** Parsed <<COPY_SUGGEST>>{...}<<END>> block from assistant message. */
export interface AdCopySuggestion {
  primary_text?: string;
  headline?: string;
  description?: string;
  cta?: AdCTA;
  destination_url?: string;
  audience?: string;
  tags?: string[];
}

// ===== Meta Accounts (cấu hình 1 lần, dùng nhiều campaign) =====

export interface MetaAccount {
  id: string;
  /** Tên thân thiện để pick — VD: "Brand A — Page chính" */
  label: string;
  /** act_XXXXXXXXX */
  accountId: string;
  /** Facebook Page ID — required for ad creative */
  pageId: string;
  /** Instagram actor numeric ID — optional */
  instagramActorId?: string;
  isDefault?: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ===== Ads Manager =====

// ODAX (outcome-based) objectives — the only values Meta accepts on new campaigns.
// Legacy values (TRAFFIC, CONVERSIONS, REACH, BRAND_AWARENESS, ...) return HTTP 400.
// Source: Pipeboard MCP create_campaign schema.
export type AdCampaignObjective =
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_LEADS'
  | 'OUTCOME_SALES'
  | 'OUTCOME_APP_PROMOTION';

export type AdCampaignStatus = 'draft' | 'active' | 'paused' | 'archived';

export type MetaBidStrategy =
  | 'LOWEST_COST_WITHOUT_CAP'
  | 'LOWEST_COST_WITH_BID_CAP'
  | 'COST_CAP'
  | 'LOWEST_COST_WITH_MIN_ROAS';

export type MetaSpecialAdCategory =
  | 'EMPLOYMENT'
  | 'HOUSING'
  | 'CREDIT'
  | 'ISSUES_ELECTIONS_POLITICS'
  | 'ONLINE_GAMBLING_AND_GAMING'
  | 'FINANCIAL_PRODUCTS_SERVICES';

export interface AdCampaign {
  id: string;
  name: string;
  objective?: AdCampaignObjective;
  /** Daily budget in account currency, MINOR units (e.g. cents/VND đơn vị nhỏ).
   *  Only one of dailyBudget / lifetimeBudget allowed at the level CBO is on. */
  dailyBudget?: number;
  lifetimeBudget?: number;
  /** Lifetime spend cap in account currency minor units. */
  spendCap?: number;
  /** Campaign Budget Optimization on (budget at campaign level) vs off (budget per ad set). */
  useCBO?: boolean;
  bidStrategy?: MetaBidStrategy;
  specialAdCategories?: MetaSpecialAdCategory[];
  /** FK → meta_accounts.id (configured globally in Settings → Meta Accounts).
   *  Resolves accountId + pageId + instagramActorId at push time. */
  metaAccountRefId?: string;
  /** @deprecated kept for backward compat with rows created before Meta Accounts feature. */
  metaAccountId?: string;
  /** @deprecated use metaAccountRefId */
  metaPageId?: string;
  /** @deprecated use metaAccountRefId */
  metaInstagramActorId?: string;
  tags: string[];
  status: AdCampaignStatus;
  metaCampaignId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ───────── Ad Set ─────────

export type MetaOptimizationGoal =
  // AWARENESS
  | 'REACH' | 'IMPRESSIONS' | 'AD_RECALL_LIFT' | 'THRUPLAY'
  | 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS'
  // TRAFFIC
  | 'LANDING_PAGE_VIEWS' | 'LINK_CLICKS'
  // ENGAGEMENT
  | 'POST_ENGAGEMENT' | 'PAGE_LIKES' | 'EVENT_RESPONSES'
  | 'CONVERSATIONS'
  // LEADS
  | 'LEAD_GENERATION' | 'QUALITY_LEAD' | 'QUALITY_CALL'
  // SALES + LEADS shared
  | 'OFFSITE_CONVERSIONS' | 'VALUE' | 'CONVERSIONS';

export type MetaBillingEvent =
  | 'IMPRESSIONS'
  | 'LINK_CLICKS'
  | 'POST_ENGAGEMENT'
  | 'THRUPLAY'
  | 'PAGE_LIKES'
  | 'NONE';

export type MetaDestinationType =
  | 'WEBSITE'
  | 'ON_POST'
  | 'ON_VIDEO'
  | 'ON_EVENT'
  | 'ON_PAGE'
  | 'MESSENGER'
  | 'WHATSAPP'
  | 'INSTAGRAM_DIRECT';

export interface AdSetTargeting {
  /** Geo: country codes (VN, US, ...) or city/region keys */
  countries?: string[];
  cities?: string[];
  ageMin?: number;          // 13..65
  ageMax?: number;          // 13..65
  genders?: ('male' | 'female')[];   // omit = all
  interestIds?: string[];   // Meta interest IDs (from search_interests)
  interestLabels?: string[];        // human label cache
  behaviorIds?: string[];
  /** Manual override for custom audience ids */
  customAudienceIds?: string[];
  excludedCustomAudienceIds?: string[];
}

export type AdSetStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface AdSet {
  id: string;
  campaignId: string;
  name: string;
  status: AdSetStatus;
  optimizationGoal?: MetaOptimizationGoal;
  billingEvent?: MetaBillingEvent;
  /** Cents/minor units. Required on adset if campaign useCBO=false. */
  dailyBudget?: number;
  lifetimeBudget?: number;
  /** Manual bid in minor units. Required if bid_strategy != LOWEST_COST_WITHOUT_CAP. */
  bidAmount?: number;
  /** ISO 8601. start_time/end_time live on adset, NOT campaign (Meta rule). */
  startTime?: string;
  endTime?: string;
  destinationType?: MetaDestinationType;
  /** For ON_POST destination — Page ID being engagement-promoted. */
  promotedPageId?: string;
  /** Pixel ID for conversion tracking — required for SALES + OFFSITE_CONVERSIONS/VALUE. */
  promotedPixelId?: string;
  /** Custom event the Pixel must fire for conversion attribution.
   *  Common: PURCHASE, ADD_TO_CART, LEAD, COMPLETE_REGISTRATION, INITIATE_CHECKOUT. */
  promotedCustomEventType?: string;
  /** For lead-gen — lead form id. */
  leadGenFormId?: string;
  targeting?: AdSetTargeting;
  /** Whether adset uses Dynamic Creative ads. */
  isDynamicCreative?: boolean;
  metaAdSetId?: string;
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
  /** Local AdSet ID this creative belongs to (resolves to Meta adset_id at push time). */
  adsetId?: string;
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
  /** URL the user imported context from (Sprint G). */
  scrapedUrl?: string;
  /** AI summary of the scraped page — feeds brief generation. */
  scrapedSummary?: ScrapedSummary;
  /** When the URL was last scraped. */
  scrapedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Sprint G: URL import + briefs ───

export interface ScrapedSummary {
  brand?: string;
  product?: string;
  usp?: string;
  target_audience?: string;
  key_offerings?: string[];
  tone_of_voice?: string;
  notable_elements?: string[];
}

export type BriefType =
  | 'offer-emphasis'
  | 'instructor-authority'
  | 'catchy-headline'
  | 'neutral-info'
  | 'social-proof'
  | 'urgency-fomo'
  | 'problem-solution'
  | 'benefit-led'
  | 'aspirational'
  | 'question-hook';

export interface BrandBrief {
  id: string;
  brandId: string;
  briefType: BriefType;
  title: string;
  primaryMessage?: string;
  headline?: string;
  primaryText?: string;
  cta?: string;
  toneNotes?: string;
  sourceUrl?: string;
  isSelected: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}
