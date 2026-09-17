import { loadBoardStops, loadDetail, loadIndex } from '../lib/data.ts';
import { detectLang, t, type Lang } from '../lib/i18n.ts';
import { loadAccent, loadLang, loadTheme, saveAccent, saveLang, saveTheme, type Accent, type Theme } from '../lib/preferences.ts';
import type { BoardStop, RouteDetail, RouteSummary } from '../lib/types.ts';
import { applyAppearance, isDark } from '../ui/appearance.ts';
import { renderBuildLine } from '../ui/build-info.ts';
import { h, replaceChildren } from '../ui/dom.ts';
import { createTopbar } from '../ui/topbar.ts';
import { trackVisibleHeight } from '../ui/viewport.ts';
import type { BoardMap, BoardMapProps } from './board-map.ts';
import { renderStopCard, type FanStatus } from './card.ts';
import { fanLegs } from './fan.ts';
import { formatBoardHash, readBoardHash } from './hash.ts';
import { renderSettingsView } from './settings-view.ts';

interface AppState {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  settings: boolean;
  stops?: BoardStop[];
  routes?: RouteSummary[];
  loadError?: string;
  /** The selected stop's id; kept even before the stops arrive, from the hash. */
  selectedId?: string;
  fan: FanStatus;
  details: Map<string, RouteDetail>;
  highlight?: string;
  /** The map's zoom, for the "zoom in" hint. */
  zoom: number;
  /** Bumped when the fan should be fitted into view again. */
  fit: number;
}

/**
 * The board app: where the buses go from a stop. A map of every drawable
 * stop; tap one and its routes fan out from it.
 */
export function createApp(root: HTMLElement): void {
  const initial = readBoardHash(location.hash);
  const state: AppState = {
    lang: loadLang() ?? detectLang(),
    theme: loadTheme(),
    accent: loadAccent(),
    settings: initial.settings ?? false,
    ...(initial.stop ? { selectedId: initial.stop } : {}),
    fan: { kind: 'ready', legs: [] },
    details: new Map(),
    zoom: 0,
    fit: 0,
  };
  trackVisibleHeight();

  const topbar = createTopbar(openSettings, toggleLang);
  const content = h('div', { class: 'content board-content' });
  const footer = h('footer', { class: 'footer' });
  root.append(topbar.element, h('main', { class: 'main board-main' }, [content]), footer);

  function openSettings(): void {
    state.settings = true;
    history.pushState(null, '', formatBoardHash({ settings: true }));
    render();
  }

  function closeSettings(): void {
    state.settings = false;
    history.replaceState(null, '', formatBoardHash({ ...(state.selectedId ? { stop: state.selectedId } : {}) }) || `${location.pathname}${location.search}`);
    render();
  }

  function setTheme(theme: Theme): void {
    state.theme = theme;
    saveTheme(theme);
    render();
  }

  function setAccent(accent: Accent): void {
    state.accent = accent;
    saveAccent(accent);
    render();
  }

  function toggleLang(): void {
    state.lang = state.lang === 'en' ? 'th' : 'en';
    saveLang(state.lang);
    render();
  }

  function selectStop(stop: BoardStop | undefined): void {
    if (stop?.id === state.selectedId) return;
    if (stop) state.selectedId = stop.id;
    else delete state.selectedId;
    delete state.highlight;
    const hash = formatBoardHash({ ...(stop ? { stop: stop.id } : {}) });
    if (stop) history.pushState(null, '', hash);
    else history.replaceState(null, '', `${location.pathname}${location.search}`);
    void loadFan();
    render();
  }

  function setHighlight(routeId: string | undefined): void {
    if (routeId === state.highlight) return;
    if (routeId) state.highlight = routeId;
    else delete state.highlight;
    render();
  }

  function selectedStop(): BoardStop | undefined {
    return state.selectedId === undefined ? undefined : state.stops?.find((stop) => stop.id === state.selectedId);
  }

  /** Fetches the selected stop's route files (those not already held), then computes the fan. */
  async function loadFan(): Promise<void> {
    const stop = selectedStop();
    if (!stop || !state.routes) {
      state.fan = { kind: 'ready', legs: [] };
      return;
    }
    state.fan = { kind: 'loading' };
    render();
    const missing = stop.routes.filter((id) => !state.details.has(id));
    const results = await Promise.allSettled(missing.map(async (id) => ({ id, result: await loadDetail(id) })));
    for (const settled of results) {
      if (settled.status !== 'fulfilled') continue;
      const { id, result } = settled.value;
      if (result.ok) state.details.set(id, result.value);
      else console.warn(`route ${id}: ${result.error}`);
    }
    // The selection may have moved on while the files loaded.
    if (selectedStop()?.id !== stop.id) return;
    state.fan = { kind: 'ready', legs: fanLegs(stop, state.routes, state.details) };
    render();
  }

  function render(): void {
    if (state.settings) disposeMap();
    const { lang } = state;
    document.documentElement.lang = lang;
    applyAppearance(state.theme, state.accent);
    document.title = t(lang, 'boardName');
    topbar.update(lang, t(lang, 'boardName'), state.settings);
    root.classList.toggle('is-settings', state.settings);
    root.classList.toggle('is-board', !state.settings);
    const next = renderContent();
    // The map page keeps its element across renders; re-appending it would detach the WebGL canvas.
    if (!(content.childNodes.length === 1 && content.firstChild === next)) replaceChildren(content, next);
    replaceChildren(footer, state.settings && renderBuildLine(lang));
  }

  function renderContent(): HTMLElement {
    const { lang } = state;
    if (state.settings) {
      return renderSettingsView({ lang, theme: state.theme, accent: state.accent, onTheme: setTheme, onAccent: setAccent, onBack: closeSettings });
    }
    if (state.loadError) {
      return h('div', { class: 'error' }, [
        h('p', { text: t(lang, 'loadFailed') }),
        h('button', { class: 'text-button', attrs: { type: 'button' }, text: t(lang, 'retry'), on: { click: () => void boot() } }),
      ]);
    }
    if (!state.stops || !state.routes) return h('p', { class: 'muted', text: t(lang, 'boardLoadingStops') });
    return renderMapPage();
  }

  /**
   * The map page owns one MapLibre instance for as long as it is open; the
   * element persists across renders, the hint and the card are rebuilt.
   */
  let boardMap: { element: HTMLElement; canvas: HTMLElement; overlay: HTMLElement; instance?: BoardMap } | undefined;

  function renderMapPage(): HTMLElement {
    if (!boardMap) {
      const canvas = h('div', { class: 'map-canvas board-canvas' });
      const overlay = h('div', { class: 'board-overlay' });
      const element = h('section', { class: 'board-page' }, [canvas, overlay]);
      boardMap = { element, canvas, overlay };
      void showMap();
    }
    replaceChildren(boardMap.overlay, renderOverlay());
    boardMap.instance?.update(mapProps());
    return boardMap.element;
  }

  function renderOverlay(): HTMLElement | false {
    const { lang } = state;
    const stop = selectedStop();
    if (stop) {
      return renderStopCard({
        lang,
        dark: isDark(state.theme),
        stop,
        fan: state.fan,
        details: state.details,
        ...(state.highlight ? { highlight: state.highlight } : {}),
        onHighlight: setHighlight,
        onClose: () => selectStop(undefined),
      });
    }
    if (!boardMap?.instance) return false;
    const zoomedOut = state.zoom < 13;
    return h('p', { class: 'board-hint', text: t(lang, zoomedOut ? 'boardZoomHint' : 'boardPickHint') });
  }

  async function showMap(): Promise<void> {
    const { createBoardMap } = await import('./board-map.ts');
    if (!boardMap || boardMap.instance) return;
    try {
      boardMap.instance = createBoardMap(boardMap.canvas, mapProps());
      // The hint waits for the map.
      replaceChildren(boardMap.overlay, renderOverlay());
    } catch (error: unknown) {
      // MapLibre throws when it cannot get a WebGL2 context; nothing to retry.
      console.warn('map unavailable', error);
      replaceChildren(boardMap.canvas, h('p', { class: 'muted map-loading', text: t(state.lang, 'mapNoWebgl') }));
    }
  }

  function mapProps(): BoardMapProps {
    const stop = selectedStop();
    return {
      lang: state.lang,
      dark: isDark(state.theme),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7e57c2',
      tilesUrl: new URL(`${import.meta.env.BASE_URL}tiles/bangkok.pmtiles`, location.href).toString(),
      stops: state.stops ?? [],
      ...(stop ? { selected: stop } : {}),
      legs: state.fan.kind === 'ready' ? state.fan.legs : [],
      ...(state.highlight ? { highlight: state.highlight } : {}),
      fitRequest: state.fit,
      insetBottom: boardMap?.overlay.offsetHeight ?? 0,
      onSelect: selectStop,
      onHighlight: setHighlight,
      onZoom: (zoom) => {
        const wasOut = state.zoom < 13;
        state.zoom = zoom;
        // Only the hint depends on the zoom; the whole page need not re-render per frame.
        if (wasOut !== zoom < 13 && boardMap) replaceChildren(boardMap.overlay, renderOverlay());
      },
    };
  }

  function disposeMap(): void {
    boardMap?.instance?.destroy();
    boardMap = undefined;
  }

  async function boot(): Promise<void> {
    delete state.loadError;
    render();
    const [stops, index] = await Promise.all([loadBoardStops(), loadIndex()]);
    if (!stops.ok || !index.ok) {
      state.loadError = stops.ok ? (index.ok ? '' : index.error) : stops.error;
      render();
      return;
    }
    state.stops = stops.value.stops;
    state.routes = index.value.routes;
    render();
    if (state.selectedId) void loadFan();
  }

  window.addEventListener('popstate', () => {
    const next = readBoardHash(location.hash);
    state.settings = next.settings ?? false;
    const changed = next.stop !== state.selectedId;
    if (next.stop) state.selectedId = next.stop;
    else delete state.selectedId;
    if (changed) {
      delete state.highlight;
      void loadFan();
    }
    render();
  });

  void boot();
}
