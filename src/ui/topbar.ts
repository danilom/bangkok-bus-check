import { t, type Lang } from '../lib/i18n.ts';
import { h } from './dom.ts';

export interface Topbar {
  element: HTMLElement;
  /** Re-labels for the language; the settings button hides on the settings page itself. */
  update: (lang: Lang, title: string, onSettingsPage: boolean) => void;
}

/** The header both apps share: title, settings gear, language toggle. */
export function createTopbar(onSettings: () => void, onLang: () => void): Topbar {
  const title = h('h1', { class: 'app-title' });
  const langButton = h('button', { class: 'lang-button', attrs: { type: 'button' }, on: { click: onLang } });
  const settingsButton = h('button', { class: 'icon-button', attrs: { type: 'button' }, text: '⚙', on: { click: onSettings } });
  const element = h('header', { class: 'topbar' }, [title, h('div', { class: 'topbar-actions' }, [settingsButton, langButton])]);
  return {
    element,
    update: (lang, text, onSettingsPage) => {
      title.textContent = text;
      langButton.textContent = t(lang, 'switchLang');
      settingsButton.setAttribute('aria-label', t(lang, 'settings'));
      settingsButton.hidden = onSettingsPage;
    },
  };
}
