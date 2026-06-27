import { AdCopySuggestion } from '../types';

const OPEN = '<<COPY_SUGGEST>>';
const CLOSE = '<<END>>';

/** Extract zero or more `<<COPY_SUGGEST>>{...}<<END>>` blocks from text.
 *  Returns parsed suggestions plus the text with blocks stripped. */
export function parseCopySuggestions(text: string): {
  suggestions: AdCopySuggestion[];
  cleanText: string;
} {
  const suggestions: AdCopySuggestion[] = [];
  let cleanText = text;
  let cursor = 0;
  let safety = 0;

  while (safety++ < 20) {
    const start = cleanText.indexOf(OPEN, cursor);
    if (start === -1) break;
    const end = cleanText.indexOf(CLOSE, start + OPEN.length);
    if (end === -1) break;

    const jsonBlob = cleanText.slice(start + OPEN.length, end).trim();
    try {
      const parsed = JSON.parse(jsonBlob);
      suggestions.push(normalizeSuggestion(parsed));
    } catch (e) {
      console.warn('COPY_SUGGEST JSON parse failed', e, jsonBlob.slice(0, 200));
    }

    cleanText =
      cleanText.slice(0, start).trimEnd() +
      (start > 0 && cleanText[start - 1] !== '\n' ? '\n' : '') +
      cleanText.slice(end + CLOSE.length).trimStart();
    cursor = start;
  }

  return { suggestions, cleanText };
}

function normalizeSuggestion(raw: any): AdCopySuggestion {
  const trim = (v: any, max?: number): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    if (!t) return undefined;
    return max ? t.slice(0, max) : t;
  };
  const tagsRaw = raw.tags;
  let tags: string[] | undefined;
  if (Array.isArray(tagsRaw)) {
    tags = tagsRaw
      .map((t: any) => (typeof t === 'string' ? t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : ''))
      .filter(Boolean);
    if (tags.length === 0) tags = undefined;
  }
  // primary_text on Facebook supports up to 2200 chars (long persuasive body).
  // Mobile feed truncates at ~125, but full text is sent and shown when expanded.
  return {
    primary_text: trim(raw.primary_text, 2200),
    headline: trim(raw.headline, 40),
    description: trim(raw.description, 30),
    cta: typeof raw.cta === 'string' ? (raw.cta as any) : undefined,
    destination_url: trim(raw.destination_url),
    audience: trim(raw.audience),
    tags,
  };
}

/** True if the stream may still produce a complete COPY_SUGGEST block (open seen, close missing). */
export function isCopySuggestPending(text: string): boolean {
  const start = text.lastIndexOf(OPEN);
  if (start === -1) return false;
  return text.indexOf(CLOSE, start + OPEN.length) === -1;
}
