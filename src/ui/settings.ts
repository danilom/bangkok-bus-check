import { t, type Lang, type StringKey } from '../lib/i18n.ts';
import { ACCENTS, THEMES, type Accent, type Theme } from '../lib/preferences.ts';
import { h } from './dom.ts';

export interface AppearanceProps {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  onTheme: (theme: Theme) => void;
  onAccent: (accent: Accent) => void;
}

const THEME_LABELS: Record<Theme, StringKey> = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };
const ACCENT_LABELS: Record<Accent, StringKey> = { blue: 'accentBlue', green: 'accentGreen', purple: 'accentPurple', orange: 'accentOrange', red: 'accentRed', gray: 'accentGray' };

/** The settings page frame, Back and the title; each app appends its own settings. */
export function renderSettingsPage(lang: Lang, onBack: () => void, children: (HTMLElement | false | undefined)[]): HTMLElement {
  return h('section', { class: 'settings' }, [
    h('button', { class: 'back-button', attrs: { type: 'button' }, text: `‹ ${t(lang, 'back')}`, on: { click: onBack } }),
    h('h2', { class: 'settings-title', text: t(lang, 'settings') }),
    ...children,
  ]);
}

/** Theme and accent chips, the same in both apps since the preference is shared. */
export function renderAppearanceSettings({ lang, theme, accent, onTheme, onAccent }: AppearanceProps): HTMLElement[] {
  return [
    renderChoice(t(lang, 'theme'), THEMES, theme, (option) => t(lang, THEME_LABELS[option]), onTheme),
    renderChoice(t(lang, 'accent'), ACCENTS, accent, (option) => t(lang, ACCENT_LABELS[option]), onAccent, true),
  ];
}

export function renderOnOff(lang: Lang, label: string, current: boolean, onPick: (on: boolean) => void): HTMLElement {
  return renderChoice(label, [false, true] as const, current, (on) => t(lang, on ? 'on' : 'off'), onPick);
}

/** A pointer to the other app, its own section: a link that opens in a new tab, with a one-line description. */
export function renderSeeAlso(label: string, name: string, description: string, href: string): HTMLElement {
  return h('div', { class: 'setting' }, [
    h('h2', { class: 'settings-title', text: label }),
    h('a', { class: 'see-also', attrs: { href, target: '_blank', rel: 'noopener' } }, [
      h('span', { class: 'see-also-name', text: `${name} ↗` }),
      h('span', { class: 'see-also-description', text: description }),
    ]),
  ]);
}

export function renderChoice<T extends string | boolean>(
  label: string,
  options: readonly T[],
  current: T,
  name: (option: T) => string,
  onPick: (option: T) => void,
  swatches = false,
): HTMLElement {
  return h('div', { class: swatches ? 'setting setting-accent' : 'setting' }, [
    h('p', { class: 'setting-label', text: label }),
    h('div', { class: 'chips', attrs: { role: 'radiogroup', 'aria-label': label } }, options.map((option) =>
      h('button', {
        class: `chip${option === current ? ' is-selected' : ''}`,
        // (boolean options have no swatch)
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(option === current) },
        on: { click: () => onPick(option) },
      }, [
        swatches && h('span', { class: 'swatch', attrs: { 'data-accent': String(option) } }),
        name(option),
      ]),
    )),
  ]);
}
