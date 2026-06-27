// Fetches available LLM models from Coachio playground catalogue.
// Endpoint is public (no API key required), but we cache for 5 minutes so the
// picker doesn't refetch on every open.

export interface CoachioModel {
  /** e.g. "google/gemini-3.1-flash-lite" — pass this as `model` in chat completions. */
  id: string;
  displayName: string;
  contextLength: number;
  inputModalities: string[];   // e.g. ['text','image','video','audio']
  outputModalities: string[];  // e.g. ['text']
  enabled: boolean;
}

const URL = 'https://api.coachio.ai/api/v1/llm/models';
const TTL_MS = 5 * 60_000;

// Providers we don't expose in the picker — quality not consistent enough for
// our copy/strategy generation needs. Add to the array to hide more.
const HIDDEN_PROVIDERS = new Set(['moonshotai', 'x-ai']);

let cache: { ts: number; data: CoachioModel[] } | null = null;

export async function listCoachioModels(force = false): Promise<CoachioModel[]> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.data;
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`List models failed (${res.status})`);
  const raw = await res.json();
  const data: CoachioModel[] = (Array.isArray(raw) ? raw : [])
    .filter((m: any) => m && m.enabled !== false)
    .filter((m: any) => {
      const provider = String(m.model_id || '').split('/')[0];
      return !HIDDEN_PROVIDERS.has(provider);
    })
    .map((m: any) => ({
      id: m.model_id,
      displayName: m.display_name || m.model_id,
      contextLength: m.context_length || 0,
      inputModalities: m.input_modalities || [],
      outputModalities: m.output_modalities || [],
      enabled: m.enabled !== false,
    }));
  cache = { ts: Date.now(), data };
  return data;
}

/** True if the model accepts image inputs (needed for banner vision in chat). */
export function supportsImageInput(m: CoachioModel): boolean {
  return m.inputModalities.includes('image');
}

/** Pretty group label (provider prefix). */
export function providerLabel(modelId: string): string {
  const slash = modelId.indexOf('/');
  if (slash === -1) return 'Other';
  const p = modelId.slice(0, slash);
  return p.charAt(0).toUpperCase() + p.slice(1);
}
