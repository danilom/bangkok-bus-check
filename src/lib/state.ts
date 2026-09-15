/**
 * URL hash and localStorage persistence. The hash carries the query and the
 * open route ("#335/3-35") so results are shareable and Back works; language
 * and recent searches are per-device conveniences.
 */

import type { Lang } from './i18n.ts';

export interface HashState {
  query: string;
  routeId?: string;
}

export function readHash(hash: string): HashState {
  const [query = '', routeId] = hash.replace(/^#/, '').split('/');
  const state: HashState = { query: decodeURIComponent(query) };
  if (routeId) state.routeId = decodeURIComponent(routeId);
  return state;
}

export function formatHash(state: HashState): string {
  if (!state.query && !state.routeId) return '';
  const parts = [encodeURIComponent(state.query)];
  if (state.routeId) parts.push(encodeURIComponent(state.routeId));
  return `#${parts.join('/')}`;
}

const LANG_KEY = 'bbc.lang';
const RECENT_KEY = 'bbc.recent';
const MAX_RECENT = 8;

export function loadLang(): Lang | undefined {
  const value = read(LANG_KEY);
  return value === 'en' || value === 'th' ? value : undefined;
}

export function saveLang(lang: Lang): void {
  write(LANG_KEY, lang);
}

export function loadRecent(): string[] {
  const raw = read(RECENT_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    // Corrupt storage is not worth surfacing; start fresh.
    return [];
  }
}

export function pushRecent(recent: string[], query: string): string[] {
  const next = [query, ...recent.filter((item) => item !== query)].slice(0, MAX_RECENT);
  write(RECENT_KEY, JSON.stringify(next));
  return next;
}

// localStorage throws in private windows and some embedded contexts.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort; the app works without it.
  }
}
