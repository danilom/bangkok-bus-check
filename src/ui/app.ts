import { loadDetail, loadIndex } from '../lib/data.ts';
import { detectLang, t, type Lang } from '../lib/i18n.ts';
import { requestPosition, type Position } from '../lib/location.ts';
import { findRoutes } from '../lib/matcher.ts';
import { formatHash, loadAccent, loadFrontSignOpen, loadLang, loadLocationAccepted, loadLocationEnabled, loadRecent, loadSimulatedLocation, loadTheme, pushRecent, readHash, saveAccent, saveFrontSignOpen, saveLang, saveLocationAccepted, saveLocationEnabled, saveSimulatedLocation, saveTheme, type Accent, type Theme } from '../lib/state.ts';
import type { RouteDetail, RouteIndex, RouteSummary } from '../lib/types.ts';
import { renderDetailView, type DetailStatus, type LocationStatus } from './detail-view.ts';
import { renderDirectionPill, type Side } from './direction-pill.ts';
import { h, replaceChildren } from './dom.ts';
import { keypadEnabled, renderKeypad, testViewport } from './keypad.ts';
import { renderRouteCard } from './route-card.ts';
import type { RouteMap, RouteMapProps } from './map-view.ts';
import { renderSettingsView } from './settings-view.ts';

interface AppState {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  query: string;
  routeId?: string;
  settings: boolean;
  side: Side;
  index?: RouteIndex;
  indexError?: string;
  /** The number field has focus; the on-screen keypad follows it. */
  inputActive: boolean;
  details: Map<string, DetailStatus>;
  expandedDirections: Set<string>;
  recent: string[];
  /** Route pages may offer location (settings toggle; on by default). */
  locationEnabled: boolean;
  /** The user has accepted the explanation once; fixes are then automatic. */
  locationAccepted: boolean;
  location: LocationStatus;
  simulatedLocation: Position | undefined;
  showAllStops: boolean;
  frontSignOpen: boolean;
  /** The route's full-screen map page. */
  map: boolean;
}

/**
 * Scales the boxed test viewport down (never up) to fit the window, so the
 * phone's proportions are kept on any desktop screen.
 */
function fitTestViewport(root: HTMLElement): void {
  const margin = 24;
  const scale = Math.min(1, (innerHeight - margin) / root.offsetHeight, (innerWidth - margin) / root.offsetWidth);
  root.style.setProperty('--test-scale', String(scale));
}

/**
 * Firefox on Android, installed to the home screen, reports 100dvh 21px
 * taller than what is visible (the gesture strip) and no safe-area inset
 * for it, so a page sized by dvh scrolls and the keypad's bottom row is
 * clipped. The visual viewport is right in every mode; the stylesheet
 * sizes the page from it and falls back to dvh where it is missing.
 */
function trackVisibleHeight(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const apply = (): void => document.documentElement.style.setProperty('--visible-height', `${Math.round(viewport.height)}px`);
  viewport.addEventListener('resize', apply);
  apply();
}

/** "2026-09-17 00:43" in the viewer's time zone. */
function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Theme and accent are attributes on <html> that the stylesheet keys off; the browser chrome colour follows. */
function applyAppearance(theme: Theme, accent: Accent): void {
  const html = document.documentElement;
  if (theme === 'system') html.removeAttribute('data-theme');
  else html.dataset['theme'] = theme;
  html.dataset['accent'] = accent;
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121212' : '#fafafa');
}

export function createApp(root: HTMLElement): void {
  const initial = readHash(location.hash);
  const state: AppState = {
    lang: loadLang() ?? detectLang(),
    theme: loadTheme(),
    accent: loadAccent(),
    query: initial.query,
    settings: initial.settings ?? false,
    inputActive: false,
    side: initial.side ?? 0,
    details: new Map(),
    expandedDirections: new Set(),
    recent: loadRecent(),
    locationEnabled: loadLocationEnabled(),
    locationAccepted: loadLocationAccepted(),
    location: { kind: 'off' },
    simulatedLocation: loadSimulatedLocation(),
    showAllStops: false,
    frontSignOpen: loadFrontSignOpen(),
    map: initial.map ?? false,
  };
  if (initial.routeId) state.routeId = initial.routeId;
  const useKeypad = keypadEnabled(location.search, matchMedia('(pointer: coarse)').matches);
  const testMode = new URLSearchParams(location.search).has('test');
  const viewport = testViewport(location.search);
  if (!viewport) trackVisibleHeight();
  if (viewport) {
    root.classList.add(`test-${viewport}`);
    fitTestViewport(root);
    window.addEventListener('resize', () => fitTestViewport(root));
  }

  const input = h('input', {
    class: 'search-input',
    attrs: {
      type: 'text',
      // With the on-screen keypad the field must never summon the OS keyboard.
      inputmode: useKeypad ? 'none' : 'numeric',
      autocomplete: 'off',
      autocapitalize: 'characters',
      enterkeyhint: 'search',
      'aria-label': t(state.lang, 'inputPlaceholder'),
    },
    on: {
      input: () => setQuery(input.value),
      focus: () => setInputActive(true),
      blur: () => setInputActive(false),
    },
  });
  input.value = state.query;
  const clearButton = h('button', { class: 'clear-button', attrs: { type: 'button' }, on: { click: () => { setQuery(''); input.focus(); } } });
  const title = h('h1', { class: 'app-title' });
  const langButton = h('button', { class: 'lang-button', attrs: { type: 'button' }, on: { click: toggleLang } });
  const settingsButton = h('button', { class: 'icon-button', attrs: { type: 'button' }, text: '⚙', on: { click: openSettings } });
  const content = h('div', { class: 'content' });
  const footer = h('footer', { class: 'footer' });
  const keypadSlot = h('div', { class: 'keypad-slot' });

  root.append(
    h('header', { class: 'topbar' }, [title, h('div', { class: 'topbar-actions' }, [settingsButton, langButton])]),
    h('main', { class: 'main' }, [h('div', { class: 'search' }, [input, clearButton]), content]),
    footer,
    keypadSlot,
  );

  const keypadHandlers = {
    onDigit: (digit: string) => setQuery(state.query + digit),
    onBackspace: () => setQuery(state.query.slice(0, -1)),
    onClear: () => setQuery(''),
  };

  function setInputActive(active: boolean): void {
    if (state.inputActive === active) return;
    state.inputActive = active;
    renderKeypadSlot();
  }

  /** The search screen is ready to type on without a tap. */
  function focusInput(): void {
    input.focus({ preventScroll: true });
  }

  function setQuery(query: string): void {
    state.query = query;
    delete state.routeId;
    state.settings = false;
    history.replaceState(null, '', formatHash({ query }) || currentUrlWithoutHash());
    render();
  }

  function openRoute(route: RouteSummary, side: Side = 0): void {
    state.routeId = route.id;
    state.side = side;
    state.showAllStops = false;
    // A fresh fix per route opened; a fix from a minute ago is reused by the browser anyway.
    if (state.locationEnabled && state.locationAccepted) void locate();
    else state.location = { kind: 'off' };
    state.recent = pushRecent(state.recent, route.number);
    history.pushState(null, '', formatHash({ query: state.query, routeId: route.id, side }));
    void ensureDetail(route.id);
    render();
  }

  function selectSide(side: Side): void {
    if (state.routeId === undefined) return;
    state.side = side;
    history.replaceState(null, '', formatHash({ query: state.query, routeId: state.routeId, side, ...(state.map ? { map: true } : {}) }));
    render();
  }

  function openMap(): void {
    if (state.routeId === undefined) return;
    state.map = true;
    history.pushState(null, '', formatHash({ query: state.query, routeId: state.routeId, side: state.side, map: true }));
    render();
  }

  function closeMap(): void {
    if (state.routeId === undefined) return;
    state.map = false;
    history.replaceState(null, '', formatHash({ query: state.query, routeId: state.routeId, side: state.side }));
    render();
  }

  function closeRoute(): void {
    delete state.routeId;
    state.map = false;
    history.replaceState(null, '', formatHash({ query: state.query }) || currentUrlWithoutHash());
    render();
    focusInput();
  }

  /** Keeps `?keypad=1`-style settings when the hash is cleared. */
  function currentUrlWithoutHash(): string {
    return `${location.pathname}${location.search}`;
  }

  function openSettings(): void {
    state.settings = true;
    history.pushState(null, '', formatHash({ query: state.query, settings: true }));
    render();
  }

  function closeSettings(): void {
    state.settings = false;
    history.replaceState(null, '', formatHash({ query: state.query }) || currentUrlWithoutHash());
    render();
    focusInput();
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

  /** First tap explains; a tap on "Use location" (or any tap once accepted) asks the device. */
  function onLocation(): void {
    if (!state.locationAccepted && state.location.kind !== 'explaining') {
      state.location = { kind: 'explaining' };
      render();
      return;
    }
    if (!state.locationAccepted) {
      state.locationAccepted = true;
      saveLocationAccepted(true);
    }
    void locate();
  }

  /** "No, don't ask again": the same as turning location off in settings, where it can be turned back on. */
  function onLocationDismiss(): void {
    setLocationEnabled(false);
  }

  async function locate(): Promise<void> {
    state.location = { kind: 'locating' };
    render();
    if (testMode && state.simulatedLocation) {
      state.location = { kind: 'ready', position: state.simulatedLocation };
      render();
      return;
    }
    const result = await requestPosition();
    state.location = result.ok ? { kind: 'ready', position: result.position } : { kind: 'error', reason: result.reason };
    render();
  }

  function setLocationEnabled(enabled: boolean): void {
    state.locationEnabled = enabled;
    saveLocationEnabled(enabled);
    if (!enabled) state.location = { kind: 'off' };
    render();
  }

  /** Test aid: back to the state of a first visit, so the explanation shows again. */
  function clearLocation(): void {
    state.locationAccepted = false;
    saveLocationAccepted(false);
    state.simulatedLocation = undefined;
    saveSimulatedLocation(undefined);
    state.location = { kind: 'off' };
    render();
  }

  function setSimulatedLocation(position: Position | undefined): void {
    state.simulatedLocation = position;
    saveSimulatedLocation(position);
    if (state.location.kind === 'ready') state.location = { kind: 'off' };
  }

  function toggleLang(): void {
    state.lang = state.lang === 'en' ? 'th' : 'en';
    saveLang(state.lang);
    render();
  }

  async function ensureDetail(id: string): Promise<void> {
    const current = state.details.get(id);
    if (current && current.kind !== 'error') return;
    state.details.set(id, { kind: 'loading' });
    render();
    const result = await loadDetail(id);
    state.details.set(id, result.ok ? { kind: 'ready', detail: result.value } : { kind: 'error', message: result.error });
    render();
  }

  function render(): void {
    if (!state.map || state.routeId === undefined || state.settings) disposeMap();
    const { lang } = state;
    document.documentElement.lang = lang;
    applyAppearance(state.theme, state.accent);
    document.title = t(lang, 'appName');
    title.textContent = t(lang, 'appName');
    langButton.textContent = t(lang, 'switchLang');
    settingsButton.setAttribute('aria-label', t(lang, 'settings'));
    settingsButton.hidden = state.settings;
    input.placeholder = t(lang, 'inputPlaceholder');
    input.setAttribute('aria-label', t(lang, 'inputPlaceholder'));
    clearButton.textContent = '×';
    clearButton.setAttribute('aria-label', t(lang, 'clear'));
    clearButton.hidden = state.query.length === 0;
    if (input.value !== state.query) input.value = state.query;
    const next = renderContent();
    // The map page keeps its element across renders; re-appending it would detach the WebGL canvas mid-load.
    if (!(content.childNodes.length === 1 && content.firstChild === next)) replaceChildren(content, next);
    replaceChildren(footer, ...renderFooter());
    renderKeypadSlot();
  }

  /** The keypad is tied to the number field: shown while it has focus, on any screen. */
  function renderKeypadSlot(): void {
    const show = useKeypad && state.inputActive && !state.settings && state.index !== undefined;
    root.classList.toggle('has-keypad', show);
    root.classList.toggle('is-settings', state.settings);
    // The number field is redundant on a route page (the number is the header); Back returns to it focused.
    root.classList.toggle('is-detail', state.routeId !== undefined && !state.settings);
    replaceChildren(keypadSlot, show && renderKeypad(state.lang, keypadHandlers));
  }

  /**
   * The map page owns one MapLibre instance for as long as it is open: the
   * page element persists across renders (a fresh map per render would
   * flicker and refetch), and is torn down when the page is left.
   */
  let routeMap: { element: HTMLElement; canvas: HTMLElement; instance?: RouteMap; routeId: string } | undefined;

  function renderMapPage(route: RouteSummary): HTMLElement {
    const { lang } = state;
    const status = state.details.get(route.id);
    if (routeMap && routeMap.routeId !== route.id) disposeMap();
    if (!routeMap) {
      const canvas = h('div', { class: 'map-canvas' });
      const element = h('section', { class: 'map-page' }, [h('div', { class: 'map-topbar' }), canvas]);
      routeMap = { element, canvas, routeId: route.id };
    }
    // The top bar is cheap to rebuild each render; the map beneath it is not.
    const topbar = routeMap.element.querySelector('.map-topbar');
    if (topbar) {
      replaceChildren(topbar,
        h('button', { class: 'back-button', attrs: { type: 'button' }, text: `‹ ${t(lang, 'back')}`, on: { click: closeMap } }),
        h('span', { class: 'map-title', text: route.number }),
        h('div', { class: 'map-pill' }, [renderDirectionPill({ lang, route, selected: state.side, onSelect: selectSide })]),
      );
    }
    if (status?.kind === 'ready') void showMap(route, status.detail);
    else if (!routeMap.instance) replaceChildren(routeMap.canvas, h('p', { class: 'muted map-loading', text: t(lang, status?.kind === 'error' ? 'loadFailed' : 'mapLoading') }));
    return routeMap.element;
  }

  async function showMap(route: RouteSummary, detail: RouteDetail): Promise<void> {
    const props = mapProps(route, detail);
    if (!routeMap) return;
    if (routeMap.instance) {
      routeMap.instance.update(props);
      return;
    }
    const { createRouteMap } = await import('./map-view.ts');
    // The page may have been left while the module loaded.
    if (!routeMap || routeMap.routeId !== route.id || routeMap.instance) return;
    replaceChildren(routeMap.canvas);
    try {
      routeMap.instance = createRouteMap(routeMap.canvas, props);
    } catch (error: unknown) {
      // MapLibre throws when it cannot get a WebGL2 context; nothing to retry.
      console.warn('map unavailable', error);
      replaceChildren(routeMap.canvas, h('p', { class: 'muted map-loading', text: t(state.lang, 'mapNoWebgl') }));
    }
  }

  function mapProps(route: RouteSummary, detail: RouteDetail): RouteMapProps {
    const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    return {
      route,
      detail,
      side: state.side,
      lang: state.lang,
      dark,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7e57c2',
      ...(state.locationEnabled && state.location.kind === 'ready' ? { position: state.location.position } : {}),
      tilesUrl: new URL(`${import.meta.env.BASE_URL}tiles/bangkok.pmtiles`, location.href).toString(),
    };
  }

  function disposeMap(): void {
    routeMap?.instance?.destroy();
    routeMap = undefined;
  }

  function renderContent(): HTMLElement {
    const { lang, index } = state;
    if (state.indexError) {
      return h('div', { class: 'error' }, [
        h('p', { text: t(lang, 'loadFailed') }),
        h('button', { class: 'text-button', attrs: { type: 'button' }, text: t(lang, 'retry'), on: { click: () => void boot() } }),
      ]);
    }
    if (state.settings) {
      return renderSettingsView({
        lang,
        theme: state.theme,
        accent: state.accent,
        onTheme: setTheme,
        onAccent: setAccent,
        onBack: closeSettings,
        locationEnabled: state.locationEnabled,
        onLocationEnabled: setLocationEnabled,
        ...(testMode ? { simulated: { position: state.simulatedLocation, onChange: setSimulatedLocation, onClear: clearLocation } } : {}),
      });
    }
    if (!index) return h('p', { class: 'muted', text: t(lang, 'loading') });
    const openRouteSummary = state.routeId === undefined ? undefined : index.routes.find((route) => route.id === state.routeId);
    if (openRouteSummary && state.map) return renderMapPage(openRouteSummary);
    if (openRouteSummary) {
      return renderDetailView({
        lang,
        route: openRouteSummary,
        status: state.details.get(openRouteSummary.id) ?? { kind: 'loading' },
        side: state.side,
        expanded: state.expandedDirections,
        onSelectSide: selectSide,
        onBack: closeRoute,
        onRetry: () => void ensureDetail(openRouteSummary.id),
        location: state.locationEnabled ? state.location : { kind: 'disabled' },
        onLocation,
        onLocationDismiss,
        showAllStops: state.showAllStops,
        onToggleAllStops: () => {
          state.showAllStops = !state.showAllStops;
          render();
        },
        frontSignOpen: state.frontSignOpen,
        onFrontSignToggle: (open: boolean) => {
          state.frontSignOpen = open;
          saveFrontSignOpen(open);
        },
        onMap: openMap,
      });
    }
    return state.query.trim() ? renderResults(index) : renderRecent();
  }

  function renderResults(index: RouteIndex): HTMLElement {
    const { lang } = state;
    const matches = findRoutes(index.routes, state.query);
    if (matches.length === 0) return h('p', { class: 'empty', text: `${t(lang, 'noMatch')} “${state.query.trim()}”` });
    const truncated = matches.some((match) => match.tier === 'prefix');
    return h('div', { class: 'results' }, [
      ...matches.map((match) => renderRouteCard({ lang, match, onOpen: openRoute })),
      truncated && h('p', { class: 'muted hint', text: t(lang, 'moreRoutes') }),
    ]);
  }

  function renderRecent(): HTMLElement {
    const { lang } = state;
    if (state.recent.length === 0) return h('p', { class: 'tagline', text: t(lang, 'tagline') });
    return h('div', { class: 'recent' }, [
      h('p', { class: 'recent-label', text: t(lang, 'recent') }),
      h('div', { class: 'chips' }, state.recent.map((number) =>
        h('button', { class: 'chip', attrs: { type: 'button' }, text: number, on: { click: () => setQuery(number) } }),
      )),
    ]);
  }

  function renderFooter(): (HTMLElement | false)[] {
    const { lang, index } = state;
    if (!index) return [];
    return [
      ...index.attribution.map((line) => h('p', { class: 'footer-line', text: line })),
      h('p', { class: 'footer-line', text: `${t(lang, 'build')} ${__BUILD_COMMIT__} ${t(lang, 'buildOn')} ${formatLocalTime(__BUILD_TIME__)}` }),
    ];
  }

  async function boot(): Promise<void> {
    delete state.indexError;
    render();
    const result = await loadIndex();
    if (result.ok) state.index = result.value;
    else state.indexError = result.error;
    if (state.routeId) {
      void ensureDetail(state.routeId);
      if (state.locationEnabled && state.locationAccepted) void locate();
    }
    render();
    if (!state.routeId && !state.settings) focusInput();
  }

  window.addEventListener('popstate', () => {
    const next = readHash(location.hash);
    state.query = next.query;
    state.settings = next.settings ?? false;
    state.side = next.side ?? 0;
    state.map = next.map ?? false;
    if (next.routeId) {
      const changed = state.routeId !== next.routeId;
      state.routeId = next.routeId;
      void ensureDetail(next.routeId);
      if (state.locationEnabled && state.locationAccepted && changed) void locate();
    } else {
      delete state.routeId;
    }
    render();
    if (!next.routeId && !next.settings) focusInput();
  });

  void boot();
}
