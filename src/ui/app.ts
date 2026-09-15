import { loadDetail, loadIndex } from '../lib/data.ts';
import { detectLang, t, type Lang } from '../lib/i18n.ts';
import { findRoutes } from '../lib/matcher.ts';
import { formatHash, loadLang, loadRecent, pushRecent, readHash, saveLang } from '../lib/state.ts';
import type { RouteIndex, RouteSummary } from '../lib/types.ts';
import { renderDetailView, type DetailStatus } from './detail-view.ts';
import type { Side } from './direction-pill.ts';
import { h, replaceChildren } from './dom.ts';
import { keypadEnabled, renderKeypad, testViewport } from './keypad.ts';
import { renderRouteCard } from './route-card.ts';

interface AppState {
  lang: Lang;
  query: string;
  routeId?: string;
  side: Side;
  index?: RouteIndex;
  indexError?: string;
  details: Map<string, DetailStatus>;
  expandedDirections: Set<number>;
  recent: string[];
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

export function createApp(root: HTMLElement): void {
  const initial = readHash(location.hash);
  const state: AppState = {
    lang: loadLang() ?? detectLang(),
    query: initial.query,
    side: initial.side ?? 0,
    details: new Map(),
    expandedDirections: new Set(),
    recent: loadRecent(),
  };
  if (initial.routeId) state.routeId = initial.routeId;
  const useKeypad = keypadEnabled(location.search, matchMedia('(pointer: coarse)').matches);
  const viewport = testViewport(location.search);
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
    on: { input: () => setQuery(input.value) },
  });
  input.value = state.query;
  const clearButton = h('button', { class: 'clear-button', attrs: { type: 'button' }, on: { click: () => { setQuery(''); input.focus(); } } });
  const title = h('h1', { class: 'app-title' });
  const langButton = h('button', { class: 'lang-button', attrs: { type: 'button' }, on: { click: toggleLang } });
  const content = h('div', { class: 'content' });
  const footer = h('footer', { class: 'footer' });
  const keypadSlot = h('div', { class: 'keypad-slot' });

  root.append(
    h('header', { class: 'topbar' }, [title, langButton]),
    h('main', { class: 'main' }, [h('div', { class: 'search' }, [input, clearButton]), content]),
    footer,
    keypadSlot,
  );

  const keypadHandlers = {
    onDigit: (digit: string) => setQuery(state.query + digit),
    onBackspace: () => setQuery(state.query.slice(0, -1)),
    onClear: () => setQuery(''),
  };

  function setQuery(query: string): void {
    state.query = query;
    delete state.routeId;
    history.replaceState(null, '', formatHash({ query }) || currentUrlWithoutHash());
    render();
  }

  function openRoute(route: RouteSummary, side: Side = 0): void {
    state.routeId = route.id;
    state.side = side;
    state.recent = pushRecent(state.recent, route.number);
    history.pushState(null, '', formatHash({ query: state.query, routeId: route.id, side }));
    void ensureDetail(route.id);
    render();
  }

  function selectSide(side: Side): void {
    if (state.routeId === undefined) return;
    state.side = side;
    history.replaceState(null, '', formatHash({ query: state.query, routeId: state.routeId, side }));
    render();
  }

  function closeRoute(): void {
    delete state.routeId;
    history.replaceState(null, '', formatHash({ query: state.query }) || currentUrlWithoutHash());
    render();
  }

  /** Keeps `?keypad=1`-style settings when the hash is cleared. */
  function currentUrlWithoutHash(): string {
    return `${location.pathname}${location.search}`;
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
    const { lang } = state;
    document.documentElement.lang = lang;
    document.title = t(lang, 'appName');
    title.textContent = t(lang, 'appName');
    langButton.textContent = t(lang, 'switchLang');
    input.placeholder = t(lang, 'inputPlaceholder');
    input.setAttribute('aria-label', t(lang, 'inputPlaceholder'));
    clearButton.textContent = '×';
    clearButton.setAttribute('aria-label', t(lang, 'clear'));
    clearButton.hidden = state.query.length === 0;
    if (input.value !== state.query) input.value = state.query;
    replaceChildren(content, renderContent());
    replaceChildren(footer, ...renderFooter());
    renderKeypadSlot();
  }

  /** The keypad belongs to the search screen only; the detail view gets the whole screen. */
  function renderKeypadSlot(): void {
    const show = useKeypad && state.routeId === undefined && state.index !== undefined;
    root.classList.toggle('has-keypad', show);
    replaceChildren(keypadSlot, show && renderKeypad(state.lang, keypadHandlers));
  }

  function renderContent(): HTMLElement {
    const { lang, index } = state;
    if (state.indexError) {
      return h('div', { class: 'error' }, [
        h('p', { text: t(lang, 'loadFailed') }),
        h('button', { class: 'text-button', attrs: { type: 'button' }, text: t(lang, 'retry'), on: { click: () => void boot() } }),
      ]);
    }
    if (!index) return h('p', { class: 'muted', text: t(lang, 'loading') });
    const openRouteSummary = state.routeId === undefined ? undefined : index.routes.find((route) => route.id === state.routeId);
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
    const date = index.generatedAt.slice(0, 10);
    return [
      h('p', { class: 'footer-line', text: `${t(lang, 'dataAsOf')} ${date}` }),
      ...index.attribution.map((line) => h('p', { class: 'footer-line', text: line })),
    ];
  }

  async function boot(): Promise<void> {
    delete state.indexError;
    render();
    const result = await loadIndex();
    if (result.ok) state.index = result.value;
    else state.indexError = result.error;
    if (state.routeId) void ensureDetail(state.routeId);
    render();
    if (!state.routeId) input.focus();
  }

  window.addEventListener('popstate', () => {
    const next = readHash(location.hash);
    state.query = next.query;
    state.side = next.side ?? 0;
    if (next.routeId) {
      state.routeId = next.routeId;
      void ensureDetail(next.routeId);
    } else {
      delete state.routeId;
    }
    render();
  });

  void boot();
}
