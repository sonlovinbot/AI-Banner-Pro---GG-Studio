// One-shot handoff between pages (History → Studio, Brand → Studio, etc).
//
// IMPORTANT: in-memory only. Earlier attempts used localStorage but it
// hits QuotaExceededError once the user's chat history / image cache fills
// the 5-10 MB quota. Since this state is short-lived (queued just before
// onNavigate, consumed by the destination page on mount), an in-process
// module-scoped variable is sufficient and immune to storage quotas.
// SPA navigation does not unload the JS bundle, so the variable survives
// across `setCurrentPage`-driven page switches.

export interface StudioHandoff {
  bannerIds?: string[];
  brandId?: string;
  /** If set, Studio pins these so the finalize modal pre-selects them. */
  campaignId?: string;
  adsetId?: string;
  /** Where the handoff came from — used only for telemetry / debug. */
  source?: 'history' | 'brand-style' | 'campaigns' | 'menu';
  /** Set internally — used to expire stale handoffs (>60s). */
  ts?: number;
}

let pending: StudioHandoff | null = null;

export function setStudioHandoff(payload: StudioHandoff): void {
  pending = { ...payload, ts: Date.now() };
}

/** Read and clear the pending handoff. Returns null if nothing queued. */
export function consumeStudioHandoff(): StudioHandoff | null {
  const out = pending;
  pending = null;
  if (!out) return null;
  if (out.ts && Date.now() - out.ts > 60_000) return null; // stale
  return out;
}

/** Peek without consuming — used by AdsManagerPage to decide initial tab. */
export function peekStudioHandoff(): StudioHandoff | null {
  if (!pending) return null;
  if (pending.ts && Date.now() - pending.ts > 60_000) return null;
  return pending;
}
