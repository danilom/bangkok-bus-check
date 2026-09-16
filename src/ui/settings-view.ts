import { t, type Lang, type StringKey } from '../lib/i18n.ts';
import { ACCENTS, THEMES, type Accent, type Theme } from '../lib/state.ts';
import { h } from './dom.ts';

export interface SettingsViewProps {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  onTheme: (theme: Theme) => void;
  onAccent: (accent: Accent) => void;
  onBack: () => void;
}

const THEME_LABELS: Record<Theme, StringKey> = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };
const ACCENT_LABELS: Record<Accent, StringKey> = { blue: 'accentBlue', green: 'accentGreen', purple: 'accentPurple', orange: 'accentOrange', red: 'accentRed' };

export function renderSettingsView(props: SettingsViewProps): HTMLElement {
  const { lang } = props;
  return h('section', { class: 'settings' }, [
    h('button', { class: 'back-button', attrs: { type: 'button' }, text: `‹ ${t(lang, 'back')}`, on: { click: props.onBack } }),
    h('h2', { class: 'settings-title', text: t(lang, 'settings') }),
    renderChoice(t(lang, 'theme'), THEMES, props.theme, (theme) => t(lang, THEME_LABELS[theme]), props.onTheme),
    renderChoice(t(lang, 'accent'), ACCENTS, props.accent, (accent) => t(lang, ACCENT_LABELS[accent]), props.onAccent, true),
  ]);
}

function renderChoice<T extends string>(
  label: string,
  options: readonly T[],
  current: T,
  name: (option: T) => string,
  onPick: (option: T) => void,
  swatches = false,
): HTMLElement {
  return h('div', { class: 'setting' }, [
    h('p', { class: 'setting-label', text: label }),
    h('div', { class: 'chips', attrs: { role: 'radiogroup', 'aria-label': label } }, options.map((option) =>
      h('button', {
        class: `chip${option === current ? ' is-selected' : ''}`,
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(option === current) },
        on: { click: () => onPick(option) },
      }, [
        swatches && h('span', { class: 'swatch', attrs: { 'data-accent': option } }),
        name(option),
      ]),
    )),
  ]);
}
