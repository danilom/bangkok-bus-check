import { detectLang, t, type Lang } from '../lib/i18n.ts';
import { loadAccent, loadLang, loadTheme, saveAccent, saveLang, saveTheme, type Accent, type Theme } from '../lib/preferences.ts';
import { applyAppearance } from '../ui/appearance.ts';
import { renderBuildLine } from '../ui/build-info.ts';
import { h, replaceChildren } from '../ui/dom.ts';
import { createTopbar } from '../ui/topbar.ts';
import { trackVisibleHeight } from '../ui/viewport.ts';
import { renderSettingsView } from './settings-view.ts';

interface AppState {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  settings: boolean;
}

const SETTINGS_HASH = '#settings';

/**
 * The board app: where the buses go from a stop or an area. A skeleton so
 * far — the shell the check app has (language, appearance, settings) and
 * an empty front page.
 */
export function createApp(root: HTMLElement): void {
  const state: AppState = {
    lang: loadLang() ?? detectLang(),
    theme: loadTheme(),
    accent: loadAccent(),
    settings: location.hash === SETTINGS_HASH,
  };
  trackVisibleHeight();

  const topbar = createTopbar(openSettings, toggleLang);
  const content = h('div', { class: 'content' });
  const footer = h('footer', { class: 'footer' });
  root.append(topbar.element, h('main', { class: 'main' }, [content]), footer);

  function openSettings(): void {
    state.settings = true;
    history.pushState(null, '', SETTINGS_HASH);
    render();
  }

  function closeSettings(): void {
    state.settings = false;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
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

  function render(): void {
    const { lang } = state;
    document.documentElement.lang = lang;
    applyAppearance(state.theme, state.accent);
    document.title = t(lang, 'boardName');
    topbar.update(lang, t(lang, 'boardName'), state.settings);
    root.classList.toggle('is-settings', state.settings);
    replaceChildren(content, renderContent());
    replaceChildren(footer, renderBuildLine(lang));
  }

  function renderContent(): HTMLElement {
    const { lang } = state;
    if (state.settings) {
      return renderSettingsView({ lang, theme: state.theme, accent: state.accent, onTheme: setTheme, onAccent: setAccent, onBack: closeSettings });
    }
    return h('p', { class: 'tagline', text: t(lang, 'boardTagline') });
  }

  window.addEventListener('popstate', () => {
    state.settings = location.hash === SETTINGS_HASH;
    render();
  });

  render();
}
