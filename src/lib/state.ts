/**
 * URL hash and localStorage persistence. The hash carries the query and the
 * open route ("#335/3-35") so results are shareable and Back works; language
 * and recent searches are per-device conveniences.
 */

import type { Lang } from './i18n.ts';

export type Theme = 'system' | 'light' | 'dark';
export type Accent = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray';
export const ACCENTS: readonly Accent[] = ['blue', 'green', 'purple', 'orange', 'red', 'gray'];
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export interface HashState {
  query: string;
  routeId?: string;
  /** The settings page (`#settings`); a hash no bus number can collide with. */
  settings?: boolean;
  /** Direction shown on the detail view: 0 = departing terminal A, 1 = terminal B. */
  side?: 0 | 1;
}

/** "#73/2-45/1" → query 73, route 2-45, side 1; "#settings" → the settings page. */
export function readHash(hash: string): HashState {
  if (hash === '#settings') return { query: '', settings: true };
  const [query = '', routeId, side] = hash.replace(/^#/, '').split('/');
  const state: HashState = { query: decodeURIComponent(query) };
  if (routeId) state.routeId = decodeURIComponent(routeId);
  if (routeId && (side === '0' || side === '1')) state.side = side === '0' ? 0 : 1;
  return state;
}

export function formatHash(state: HashState): string {
  if (state.settings) return '#settings';
  if (!state.query && !state.routeId) return '';
  const parts = [encodeURIComponent(state.query)];
  if (state.routeId) {
    parts.push(encodeURIComponent(state.routeId));
    if (state.side !== undefined) parts.push(String(state.side));
  }
  return `#${parts.join('/')}`;
}

const LANG_KEY = 'bbc.lang';
const THEME_KEY = 'bbc.theme';
const ACCENT_KEY = 'bbc.accent';
const RECENT_KEY = 'bbc.recent';
const MAX_RECENT = 8;

export function loadLang(): Lang | undefined {
  const value = read(LANG_KEY);
  return value === 'en' || value === 'th' ? value : undefined;
}

export function saveLang(lang: Lang): void {
  write(LANG_KEY, lang);
}

export function loadTheme(): Theme {
  const value = read(THEME_KEY);
  return THEMES.find((theme) => theme === value) ?? 'system';
}

export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme);
}

export function loadAccent(): Accent {
  const value = read(ACCENT_KEY);
  return ACCENTS.find((accent) => accent === value) ?? 'blue';
}

export function saveAccent(accent: Accent): void {
  write(ACCENT_KEY, accent);
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
