/**
 * The check app's URL hash. It carries the query and the open route
 * ("#335/3-35") so results are shareable and Back works.
 */

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
