/**
 * URL hash and localStorage persistence. The hash carries the query and the
 * open route ("#335/3-35") so results are shareable and Back works; language
 * and recent searches are per-device conveniences.
 */

import type { Lang } from './i18n.ts';
import type { Position } from './location.ts';

export type Theme = 'system' | 'light' | 'dark';
export type Accent = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray';
export const ACCENTS: readonly Accent[] = ['blue', 'green', 'purple', 'orange', 'red', 'gray'];
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export interface HashState {
  query: string;
  routeId?: string;
  /** The settings page (`#settings`); a hash no bus number can collide with. */
  settings?: boolean;
  /** Direction shown on the detail view: 0 = heading to terminal A, 1 = to terminal B. */
  side?: 0 | 1;
  /** The route's map page ("#73/2-45/1/map"). */
  map?: boolean;
  /** A stop the map opens on ("#73/2-45/1/map/s1234"), from a tap in the stop list. */
  focusStop?: string;
}

/** "#73/2-45/1" → query 73, route 2-45, side 1; "#settings" → the settings page. */
export function readHash(hash: string): HashState {
  if (hash === '#settings') return { query: '', settings: true };
  const [query = '', routeId, side, page, focus] = hash.replace(/^#/, '').split('/');
  const state: HashState = { query: decodeURIComponent(query) };
  if (routeId) state.routeId = decodeURIComponent(routeId);
  if (routeId && (side === '0' || side === '1')) state.side = side === '0' ? 0 : 1;
  if (routeId && page === 'map') {
    state.map = true;
    if (focus) state.focusStop = decodeURIComponent(focus);
  }
  return state;
}

export function formatHash(state: HashState): string {
  if (state.settings) return '#settings';
  if (!state.query && !state.routeId) return '';
  const parts = [encodeURIComponent(state.query)];
  if (state.routeId) {
    parts.push(encodeURIComponent(state.routeId));
    if (state.side !== undefined) parts.push(String(state.side));
    if (state.map) {
      parts.push('map');
      if (state.focusStop) parts.push(encodeURIComponent(state.focusStop));
    }
  }
  return `#${parts.join('/')}`;
}

const LANG_KEY = 'bbc.lang';
const LOCATION_KEY = 'bbc.location';
const LOCATION_ACCEPTED_KEY = 'bbc.locationAccepted';
const SIMULATED_LOCATION_KEY = 'bbc.simulatedLocation';
const THEME_KEY = 'bbc.theme';
const FRONT_SIGN_KEY = 'bbc.frontSign';
const MAP_LABELS_KEY = 'bbc.mapLabels';
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
  return ACCENTS.find((accent) => accent === value) ?? 'purple';
}

export function saveAccent(accent: Accent): void {
  write(ACCENT_KEY, accent);
}

/**
 * Whether route pages may offer location at all. On by default; "off" is the
 * user saying "don't ask me again".
 */
export function loadLocationEnabled(): boolean {
  return read(LOCATION_KEY) !== 'off';
}

export function saveLocationEnabled(enabled: boolean): void {
  write(LOCATION_KEY, enabled ? 'on' : 'off');
}

/** Stop names on the map: shown unless hidden once. */
export function loadMapLabels(): boolean {
  return read(MAP_LABELS_KEY) !== 'off';
}

export function saveMapLabels(shown: boolean): void {
  write(MAP_LABELS_KEY, shown ? 'on' : 'off');
}

/** The "Front sign (Thai)" panel on route pages: open unless closed once. */
export function loadFrontSignOpen(): boolean {
  return read(FRONT_SIGN_KEY) !== 'closed';
}

export function saveFrontSignOpen(open: boolean): void {
  write(FRONT_SIGN_KEY, open ? 'open' : 'closed');
}

/** The user has read the explanation and tapped "Use location" once; from then on fixes are automatic. */
export function loadLocationAccepted(): boolean {
  return read(LOCATION_ACCEPTED_KEY) === 'yes';
}

export function saveLocationAccepted(accepted: boolean): void {
  if (accepted) write(LOCATION_ACCEPTED_KEY, 'yes');
  else remove(LOCATION_ACCEPTED_KEY);
}

/** Test aid: a position pasted into settings, used instead of the real one. */
export function loadSimulatedLocation(): Position | undefined {
  const raw = read(SIMULATED_LOCATION_KEY);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as Position).lat === 'number' && typeof (parsed as Position).lon === 'number') {
      return { lat: (parsed as Position).lat, lon: (parsed as Position).lon };
    }
  } catch {
    // Corrupt storage: treat as unset.
  }
  return undefined;
}

export function saveSimulatedLocation(position: Position | undefined): void {
  if (position) write(SIMULATED_LOCATION_KEY, JSON.stringify(position));
  else remove(SIMULATED_LOCATION_KEY);
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

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Best-effort, as with write.
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort; the app works without it.
  }
}
