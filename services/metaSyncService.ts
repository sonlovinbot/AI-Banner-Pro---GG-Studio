// Shared sync logic for pulling live status from Meta back into Supabase.
// Used by CampaignsTab (per-campaign button) and QueueTab (sync-all).
//
// Bidirectional mapping rules:
//   - Meta paused/archived  →  local 'paused' / 'archived'
//   - Meta ACTIVE           →  local 'pushed' (only if local was already
//                              pushed/paused — never resurrects 'draft' or
//                              'failed' creatives, since those shouldn't have
//                              a metaAdId anyway).

import { AdCampaign, AdSet, AdCreative, MetaAccount } from '../types';
import { syncStatusesFromMeta, mapMetaStatusToApp } from './metaFetchService';
import { saveCampaignToCloud } from './adCampaignService';
import { saveAdSetToCloud } from './adSetService';
import { saveCreativeToCloud } from './adCreativeService';

export interface SyncSummary {
  campaignId: string;
  campaignName: string;
  touched: number;
  /** Set when the campaign has no metaCampaignId (never pushed) or the
   *  Meta Account isn't configured — skipped entirely. */
  skipped?: string;
  error?: string;
}

/** Sync one local campaign's statuses (campaign + adsets + ads) from Meta.
 *  Returns the number of local rows that changed. */
export async function syncCampaign(
  campaign: AdCampaign,
  adSets: AdSet[],
  creatives: AdCreative[],
  metaAccounts: MetaAccount[],
): Promise<SyncSummary> {
  const base: SyncSummary = { campaignId: campaign.id, campaignName: campaign.name, touched: 0 };
  if (!campaign.metaCampaignId) {
    return { ...base, skipped: 'chưa push lên Meta' };
  }
  const account = metaAccounts.find(a => a.id === campaign.metaAccountRefId);
  const accountId = account?.accountId || campaign.metaAccountId || '';
  if (!accountId) return { ...base, skipped: 'thiếu Meta Account' };

  const cAdsets    = adSets.filter(a => a.campaignId === campaign.id && a.metaAdSetId);
  const cCreatives = creatives.filter(c => c.campaignId === campaign.id && c.metaAdId);

  let report;
  try {
    report = await syncStatusesFromMeta({
      accountId,
      metaCampaignId: campaign.metaCampaignId,
      metaAdsetIds: cAdsets.map(a => a.metaAdSetId!),
      metaAdIds:    cCreatives.map(c => c.metaAdId!),
    });
  } catch (e: any) {
    return { ...base, error: e?.message || 'sync lỗi' };
  }

  let touched = 0;

  const cMapped = mapMetaStatusToApp(report.campaign?.effectiveStatus || report.campaign?.status);
  if (cMapped && cMapped !== campaign.status) {
    await saveCampaignToCloud({ ...campaign, status: cMapped, updatedAt: Date.now() });
    touched++;
  }

  for (const r of report.adsets) {
    const local = cAdsets.find(a => a.metaAdSetId === r.id);
    if (!local) continue;
    const m = mapMetaStatusToApp(r.effectiveStatus || r.status);
    if (m && m !== local.status) {
      await saveAdSetToCloud({ ...local, status: m, updatedAt: Date.now() });
      touched++;
    }
  }

  for (const r of report.ads) {
    const local = cCreatives.find(c => c.metaAdId === r.id);
    if (!local) continue;
    const m = mapMetaStatusToApp(r.effectiveStatus || r.status);
    if (!m) continue;

    // Don't resurrect creatives that were never live — only update if we have
    // an established lifecycle status (pushed/paused/archived).
    const wasLive = local.status === 'pushed' || local.status === 'paused' || local.status === 'archived';
    if (!wasLive) continue;

    // Map Meta lifecycle states onto our extended creative enum
    let newStatus: AdCreative['status'] = local.status;
    if (m === 'active')       newStatus = 'pushed';
    else if (m === 'paused')  newStatus = 'paused';
    else if (m === 'archived') newStatus = 'archived';

    if (newStatus !== local.status) {
      await saveCreativeToCloud({ ...local, status: newStatus, updatedAt: Date.now() });
      touched++;
    }
  }

  return { ...base, touched };
}

/** Sync all campaigns that have a metaCampaignId. Stops at quota errors. */
export async function syncAllPushedCampaigns(
  campaigns: AdCampaign[],
  adSets: AdSet[],
  creatives: AdCreative[],
  metaAccounts: MetaAccount[],
): Promise<SyncSummary[]> {
  const pushed = campaigns.filter(c => c.metaCampaignId);
  const out: SyncSummary[] = [];
  for (const c of pushed) {
    out.push(await syncCampaign(c, adSets, creatives, metaAccounts));
  }
  return out;
}
