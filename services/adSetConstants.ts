// Pure constants + validation helpers for AdSet — NO Supabase / DOM imports.
// Safe to import from Vercel Edge functions and the frontend alike.
//
// Why separated from adSetService.ts:
//   adSetService imports ./supabaseClient, which uses import.meta.env and the
//   @supabase/supabase-js package. Pulling either into a Vercel Edge bundle
//   crashes at module load → server returns text/plain 500 (the handler's
//   top-level try/catch never gets a chance to run).

import { AdCampaignObjective, MetaOptimizationGoal, MetaBillingEvent, MetaDestinationType } from '../types';

/** Valid optimization goals per (objective, destinationType).
 *  Source: Pipeboard MCP create_adset docs, narrowed by what Meta v23 actually accepts in practice. */
export function validOptimizationGoals(
  objective: AdCampaignObjective | undefined,
  destinationType: MetaDestinationType | undefined,
): MetaOptimizationGoal[] {
  if (!objective) return [];
  switch (objective) {
    case 'OUTCOME_AWARENESS':
      return ['REACH', 'IMPRESSIONS', 'AD_RECALL_LIFT', 'THRUPLAY'];
    case 'OUTCOME_TRAFFIC':
      return ['LANDING_PAGE_VIEWS', 'LINK_CLICKS', 'IMPRESSIONS', 'REACH'];
    case 'OUTCOME_ENGAGEMENT': {
      switch (destinationType) {
        case 'ON_POST':   return ['POST_ENGAGEMENT', 'IMPRESSIONS', 'REACH'];
        case 'ON_VIDEO':  return ['THRUPLAY', 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS'];
        case 'ON_EVENT':  return ['EVENT_RESPONSES', 'IMPRESSIONS', 'POST_ENGAGEMENT', 'REACH'];
        case 'ON_PAGE':   return ['PAGE_LIKES'];
        case 'MESSENGER':
        case 'WHATSAPP':
        case 'INSTAGRAM_DIRECT':
          return ['CONVERSATIONS', 'LINK_CLICKS'];
        case 'WEBSITE':
        default:
          return ['OFFSITE_CONVERSIONS', 'LANDING_PAGE_VIEWS', 'LINK_CLICKS', 'IMPRESSIONS', 'REACH'];
      }
    }
    case 'OUTCOME_LEADS':
      return ['LEAD_GENERATION', 'QUALITY_LEAD', 'QUALITY_CALL', 'OFFSITE_CONVERSIONS', 'LINK_CLICKS'];
    case 'OUTCOME_SALES':
      // Pipeboard docs list LINK_CLICKS / LANDING_PAGE_VIEWS / IMPRESSIONS / REACH
      // as valid for SALES, but Meta v23 rejects all of them in practice (verified
      // with create_adset dry-runs in 2026-06). Only OFFSITE_CONVERSIONS and VALUE
      // succeed, and both REQUIRE a promoted_object with pixel_id + custom_event_type.
      return ['OFFSITE_CONVERSIONS', 'VALUE'];
    case 'OUTCOME_APP_PROMOTION':
      return ['OFFSITE_CONVERSIONS', 'LINK_CLICKS'];
    default:
      return [];
  }
}

export const OPTIMIZATION_GOAL_LABELS: Partial<Record<MetaOptimizationGoal, string>> = {
  REACH: 'Reach (Tiếp cận)',
  IMPRESSIONS: 'Impressions (Hiển thị)',
  AD_RECALL_LIFT: 'Ad Recall Lift',
  THRUPLAY: 'ThruPlay (xem ≥15s)',
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: 'Xem video ≥2s',
  LANDING_PAGE_VIEWS: 'Landing Page Views',
  LINK_CLICKS: 'Link Clicks',
  POST_ENGAGEMENT: 'Post Engagement',
  PAGE_LIKES: 'Page Likes',
  EVENT_RESPONSES: 'Event Responses',
  CONVERSATIONS: 'Conversations (Inbox)',
  LEAD_GENERATION: 'Lead Generation',
  QUALITY_LEAD: 'Quality Lead',
  QUALITY_CALL: 'Quality Call',
  OFFSITE_CONVERSIONS: 'Offsite Conversions',
  VALUE: 'Value (ROAS)',
  CONVERSIONS: 'Conversions',
};

export const BILLING_EVENT_LABELS: Record<MetaBillingEvent, string> = {
  IMPRESSIONS:     'Impressions (CPM)',
  LINK_CLICKS:     'Link clicks (CPC)',
  POST_ENGAGEMENT: 'Post engagement',
  THRUPLAY:        'ThruPlay',
  PAGE_LIKES:      'Page likes',
  NONE:            '— Không tính phí —',
};

export const DESTINATION_TYPE_LABELS: Record<MetaDestinationType, string> = {
  WEBSITE:           'Website (link ngoài)',
  ON_POST:           'Trên Post FB/IG',
  ON_VIDEO:          'Trên Video',
  ON_EVENT:          'Trên Event',
  ON_PAGE:           'Trên Page',
  MESSENGER:         'Messenger',
  WHATSAPP:          'WhatsApp',
  INSTAGRAM_DIRECT:  'Instagram Direct',
};
