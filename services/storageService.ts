import { HistoryItem } from '../types';

const HISTORY_KEY = 'banner_pro_history';
const GEMINI_API_KEY_STORAGE = 'gemini_api_key';
const ACTIVE_BACKEND_STORAGE = 'active_backend';

export function getGeminiApiKey(): string {
  return localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
}

export function setGeminiApiKey(key: string): void {
  localStorage.setItem(GEMINI_API_KEY_STORAGE, key);
}

export function removeGeminiApiKey(): void {
  localStorage.removeItem(GEMINI_API_KEY_STORAGE);
}

export function getActiveBackend(): 'gemini' | 'coachio' {
  return (localStorage.getItem(ACTIVE_BACKEND_STORAGE) as 'gemini' | 'coachio') || 'gemini';
}

export function setActiveBackend(backend: 'gemini' | 'coachio'): void {
  localStorage.setItem(ACTIVE_BACKEND_STORAGE, backend);
}

export function getHistory(): HistoryItem[] {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(item: HistoryItem): void {
  const history = getHistory();
  history.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function saveBatchToHistory(items: HistoryItem[]): void {
  const history = getHistory();
  history.unshift(...items);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function removeFromHistory(id: string): void {
  const history = getHistory().filter(item => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
