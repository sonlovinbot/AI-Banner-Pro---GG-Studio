// Clone helpers for Campaign / AdSet / Creative hierarchies.
//
// Rules:
//   - New ids everywhere (no Meta-side dup created — Pipeboard has its own
//     duplicate_* tools we choose NOT to use; clones stay local-only until
//     the user explicitly pushes).
//   - All cloned rows reset to status='draft' and clear every meta_*_id +
//     pushedAt + insights so the UI doesn't pretend it's live on Meta.
//   - Hierarchical clone (clone a campaign → also clones every adset of
//     it, and every creative of those adsets). Default behavior; the
//     "shallow" variant exists for power users / MCP tool surface.

import { AdCampaign, AdSet, AdCreative } from '../types';
import { saveCampaignToCloud } from './adCampaignService';
import { saveAdSetToCloud } from './adSetService';
import { saveCreativeToCloud } from './adCreativeService';

function newId(): string {
  return Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
}

function copyName(original: string | undefined, suffix = '(Copy)'): string {
  const base = (original || '').trim();
  if (!base) return suffix;
  // Increment if it already ends with "(Copy)" or "(Copy 2)" etc
  const m = base.match(/^(.*?)\s*\(Copy(?:\s*(\d+))?\)\s*$/);
  if (m) {
    const n = m[2] ? Number(m[2]) + 1 : 2;
    return `${m[1].trim()} (Copy ${n})`;
  }
  return `${base} ${suffix}`;
}

// ────────────── Creative ──────────────

export interface CloneCreativeOpts {
  /** Override target adset (defaults to original's adsetId). */
  targetAdsetId?: string;
  /** Override target campaign (defaults to original's campaignId). */
  targetCampaignId?: string;
  /** Override name (defaults to "<orig> (Copy)"). */
  nameOverride?: string;
}

export async function cloneCreative(
  original: AdCreative,
  opts: CloneCreativeOpts = {},
): Promise<AdCreative> {
  const clone: AdCreative = {
    ...original,
    id: newId(),
    name: opts.nameOverride || copyName(original.name),
    campaignId: opts.targetCampaignId || original.campaignId,
    adsetId: opts.targetAdsetId || original.adsetId,
    status: 'draft',
    source: 'clone',
    derivedFromCreativeId: original.id,
    metaAdId: undefined,
    metaCreativeId: undefined,
    metaAdsetId: undefined,
    pushedAt: undefined,
    pushError: undefined,
    importedFromMeta: false,
    originalMetaAdId: undefined,
    lastInsightAt: undefined,
    insights: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return await saveCreativeToCloud(clone);
}

// ────────────── AdSet (with creatives) ──────────────

export interface CloneAdSetOpts {
  /** Override destination campaign (defaults to original's campaignId). */
  targetCampaignId?: string;
  nameOverride?: string;
  /** When true, also clones every creative attached to this adset. Default true. */
  withCreatives?: boolean;
  /** Used when withCreatives=true — pre-loaded creatives list (caller knows all). */
  allCreatives?: AdCreative[];
}

export interface CloneAdSetResult {
  adSet: AdSet;
  creatives: AdCreative[];
}

export async function cloneAdSet(
  original: AdSet,
  opts: CloneAdSetOpts = {},
): Promise<CloneAdSetResult> {
  const targetCampaignId = opts.targetCampaignId || original.campaignId;
  const adSetClone: AdSet = {
    ...original,
    id: newId(),
    name: opts.nameOverride || copyName(original.name),
    campaignId: targetCampaignId,
    status: 'draft',
    metaAdSetId: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const savedAdSet = await saveAdSetToCloud(adSetClone);

  const withCreatives = opts.withCreatives !== false;
  const clonedCreatives: AdCreative[] = [];
  if (withCreatives && opts.allCreatives) {
    const inSet = opts.allCreatives.filter(c => c.adsetId === original.id);
    for (const c of inSet) {
      const saved = await cloneCreative(c, {
        targetAdsetId: savedAdSet.id,
        targetCampaignId,
      });
      clonedCreatives.push(saved);
    }
  }

  return { adSet: savedAdSet, creatives: clonedCreatives };
}

// ────────────── Campaign (full tree) ──────────────

export interface CloneCampaignOpts {
  nameOverride?: string;
  /** When true (default), also clones all adsets + creatives under this campaign. */
  withChildren?: boolean;
  /** Used when withChildren=true — pre-loaded adsets + creatives. */
  allAdSets?: AdSet[];
  allCreatives?: AdCreative[];
  /** Override Meta Account binding (defaults to original's metaAccountRefId). */
  metaAccountRefId?: string;
}

export interface CloneCampaignResult {
  campaign: AdCampaign;
  adSets: AdSet[];
  creatives: AdCreative[];
}

export async function cloneCampaign(
  original: AdCampaign,
  opts: CloneCampaignOpts = {},
): Promise<CloneCampaignResult> {
  const campaignClone: AdCampaign = {
    ...original,
    id: newId(),
    name: opts.nameOverride || copyName(original.name),
    metaAccountRefId: opts.metaAccountRefId !== undefined
      ? opts.metaAccountRefId
      : original.metaAccountRefId,
    status: 'draft',
    metaCampaignId: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const savedCampaign = await saveCampaignToCloud(campaignClone);

  const withChildren = opts.withChildren !== false;
  const clonedAdSets: AdSet[] = [];
  const clonedCreatives: AdCreative[] = [];

  if (withChildren && opts.allAdSets) {
    const adSetsInCampaign = opts.allAdSets.filter(a => a.campaignId === original.id);
    for (const a of adSetsInCampaign) {
      const result = await cloneAdSet(a, {
        targetCampaignId: savedCampaign.id,
        allCreatives: opts.allCreatives,
      });
      clonedAdSets.push(result.adSet);
      clonedCreatives.push(...result.creatives);
    }
  }

  return {
    campaign: savedCampaign,
    adSets: clonedAdSets,
    creatives: clonedCreatives,
  };
}
