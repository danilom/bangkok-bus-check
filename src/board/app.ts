import { loadBoardStops, loadDetail, loadIndex } from '../lib/data.ts';
import { detectLang, t, type Lang } from '../lib/i18n.ts';
import { loadAccent, loadBoardLabels, loadLang, loadTheme, saveAccent, saveBoardLabels, saveLang, saveTheme, type Accent, type Theme } from '../lib/preferences.ts';
import type { BoardStop, RouteDetail, RouteSummary } from '../lib/types.ts';
import { applyAppearance, isDark } from '../ui/appearance.ts';
import { renderBuildLine } from '../ui/build-info.ts';
import { h, replaceChildren } from '../ui/dom.ts';
import { createTopbar } from '../ui/topbar.ts';
import { applyTestViewport, testViewport, trackVisibleHeight } from '../ui/viewport.ts';
import type { BoardMap, BoardMapProps, ViewMove, ViewRequest } from './board-map.ts';
import { renderRouteLink, renderStopCard, type FanStatus } from './card.ts';
import { bundleLegs } from './bundle.ts';
import { fanLegs } from './fan.ts';
import { formatBoardHash, readBoardHash } from './hash.ts';
import { renderSettingsView } from './settings-view.ts';
import { renderZoomHint, stopsHidden, zoomLine } from './zoom-hint.ts';

interface AppState {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  settings: boolean;
  /** The map's "Aa" button: route numbers along the lines. */
  labels: boolean;
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
  /** The last move asked of the map; taps never move it (the user may be studying the block, or about to tap a neighbour). */
  view?: ViewRequest;
  /** Set when the page opened on a stop from the URL: the fan is fitted once it arrives, there being no view to protect yet. */
  fitOnArrival: boolean;
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
    labels: loadBoardLabels(),
    ...(initial.stop ? { selectedId: initial.stop } : {}),
    fan: { kind: 'ready', legs: [], strands: [] },
    details: new Map(),
    zoom: 0,
    fitOnArrival: initial.stop !== undefined,
  };
  // A map wants the whole window: the phone-width page is for phones (and the ?test=phone box).
  const viewport = testViewport(location.search);
  const coarsePointer = matchMedia('(pointer: coarse)').matches;
  if (viewport) applyTestViewport(root, viewport);
  else {
    trackVisibleHeight();
    root.classList.toggle('is-wide', !coarsePointer);
  }
  // The viewport switcher is for judging the board on a desktop; a phone is the real thing already.
  const test = viewport || !coarsePointer ? { viewport } : undefined;
  // With any ?test param, the map's zoom is read out in its corner, for judging zoom-dependent styling.
  const zoomReadout = new URLSearchParams(location.search).has('test') ? h('p', { class: 'board-zoom-readout' }) : undefined;

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
    delete state.view;
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
      state.fan = { kind: 'ready', legs: [], strands: [] };
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
    const legs = fanLegs(stop, state.routes, state.details);
    state.fan = { kind: 'ready', legs, strands: bundleLegs(stop.id, legs, state.details) };
    if (state.fitOnArrival) {
      state.fitOnArrival = false;
      requestView({ kind: 'fan' });
    }
    render();
  }

  /** The card's zoom button: out to the whole fan (or the singled-out route), then back to the stop. */
  function toggleView(): void {
    requestView(farView() ? { kind: 'stop' } : state.highlight ? { kind: 'route', routeId: state.highlight } : { kind: 'fan' });
    render();
  }

  function requestView(move: ViewMove): void {
    state.view = { ...move, seq: (state.view?.seq ?? 0) + 1 };
  }

  /** Whether the map was last sent out to the current choice (fan, or the highlighted route), so the button offers the way back. */
  function farView(): boolean {
    const { view } = state;
    if (!view || view.kind === 'stop') return false;
    return view.kind === 'route' ? view.routeId === state.highlight : state.highlight === undefined;
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
      return renderSettingsView({ lang, theme: state.theme, accent: state.accent, ...(test ? { test } : {}), onTheme: setTheme, onAccent: setAccent, onBack: closeSettings });
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
      const element = h('section', { class: 'board-page' }, [canvas, overlay, zoomReadout]);
      boardMap = { element, canvas, overlay };
      void showMap();
    }
    refreshOverlay();
    boardMap.instance?.update(mapProps());
    return boardMap.element;
  }

  /** The card sits over the map's bottom edge; a hint, with nothing to cover, is at the top where it is read first. */
  function refreshOverlay(): void {
    if (!boardMap) return;
    replaceChildren(boardMap.overlay, ...renderOverlay());
    boardMap.overlay.classList.toggle('is-top', !selectedStop());
  }

  /** What floats over the map: the stop's card and, below it, the singled-out route's link; or a hint. */
  function renderOverlay(): (HTMLElement | false)[] {
    const { lang } = state;
    const stop = selectedStop();
    if (stop) {
      const cardProps = {
        lang,
        dark: isDark(state.theme),
        stop,
        fan: state.fan,
        details: state.details,
        ...(state.highlight ? { highlight: state.highlight } : {}),
        far: farView(),
        onHighlight: setHighlight,
        onToggleView: toggleView,
        onClose: () => selectStop(undefined),
      };
      return [renderStopCard(cardProps), renderRouteLink(cardProps)];
    }
    if (!boardMap?.instance) return [];
    if (stopsHidden(state.zoom)) return [renderZoomHint(lang, state.zoom)];
    return [h('p', { class: 'board-hint', text: t(lang, 'boardPickHint') })];
  }

  async function showMap(): Promise<void> {
    const { createBoardMap } = await import('./board-map.ts');
    if (!boardMap || boardMap.instance) return;
    try {
      boardMap.instance = createBoardMap(boardMap.canvas, mapProps());
      // The hint waits for the map.
      refreshOverlay();
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
      strands: state.fan.kind === 'ready' ? state.fan.strands : [],
      ...(state.highlight ? { highlight: state.highlight } : {}),
      ...(state.view ? { view: state.view } : {}),
      insetBottom: boardMap?.overlay.offsetHeight ?? 0,
      labels: state.labels,
      onSelect: selectStop,
      onHighlight: setHighlight,
      onToggleLabels: () => {
        state.labels = !state.labels;
        saveBoardLabels(state.labels);
        render();
      },
      onZoom: (zoom) => {
        const wasHidden = stopsHidden(state.zoom);
        state.zoom = zoom;
        if (zoomReadout) zoomReadout.textContent = `z ${zoom.toFixed(2)}`;
        // Only the hint depends on the zoom; the whole page need not re-render per frame.
        if (selectedStop()) return;
        if (wasHidden !== stopsHidden(zoom)) refreshOverlay();
        else if (wasHidden) updateZoomLine();
      },
    };
  }

  /** The hint's zoom figure follows every zoom frame without rebuilding the hint. */
  function updateZoomLine(): void {
    const line = boardMap?.overlay.querySelector('.board-hint-zoom');
    if (line) line.textContent = zoomLine(state.lang, state.zoom);
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
      // A stop restored from history may be anywhere; bring it into view, as a tap would not.
      if (next.stop) requestView({ kind: 'stop' });
      void loadFan();
    }
    render();
  });

  void boot();
}
