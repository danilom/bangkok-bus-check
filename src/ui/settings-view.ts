import { t, type Lang, type StringKey } from '../lib/i18n.ts';
import { parseLocationText, type Position } from '../lib/location.ts';
import { ACCENTS, THEMES, type Accent, type Theme } from '../lib/state.ts';
import { h } from './dom.ts';

export interface SettingsViewProps {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  onTheme: (theme: Theme) => void;
  onAccent: (accent: Accent) => void;
  onBack: () => void;
  locationEnabled: boolean;
  onLocationEnabled: (enabled: boolean) => void;
  /** Test mode only: a pasted position that replaces the real one. */
  simulated?: { position: Position | undefined; onChange: (position: Position | undefined) => void; onClear: () => void };
}

const THEME_LABELS: Record<Theme, StringKey> = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };
const ACCENT_LABELS: Record<Accent, StringKey> = { blue: 'accentBlue', green: 'accentGreen', purple: 'accentPurple', orange: 'accentOrange', red: 'accentRed', gray: 'accentGray' };

export function renderSettingsView(props: SettingsViewProps): HTMLElement {
  const { lang } = props;
  return h('section', { class: 'settings' }, [
    h('button', { class: 'back-button', attrs: { type: 'button' }, text: `‹ ${t(lang, 'back')}`, on: { click: props.onBack } }),
    h('h2', { class: 'settings-title', text: t(lang, 'settings') }),
    renderChoice(t(lang, 'theme'), THEMES, props.theme, (theme) => t(lang, THEME_LABELS[theme]), props.onTheme),
    renderChoice(t(lang, 'accent'), ACCENTS, props.accent, (accent) => t(lang, ACCENT_LABELS[accent]), props.onAccent, true),
    renderChoice(t(lang, 'locationSetting'), [false, true] as const, props.locationEnabled, (on) => t(lang, on ? 'on' : 'off'), props.onLocationEnabled),
    props.simulated && renderTestSection(lang, props.simulated),
    renderViewportReadout(),
  ]);
}

/**
 * The numbers behind viewport bugs, for reading off a phone: what the browser
 * says the window is, what is actually visible, what 100dvh resolves to,
 * the bottom safe-area inset, and how tall the page is. Not translated.
 */
function renderViewportReadout(): HTMLElement {
  const probe = h('div', { attrs: { style: 'position:fixed;top:0;left:0;height:100dvh;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none' } });
  document.body.append(probe);
  const dvh = probe.offsetHeight;
  const safeBottom = Math.round(Number.parseFloat(getComputedStyle(probe).paddingBottom));
  probe.remove();
  const visible = window.visualViewport ? Math.round(window.visualViewport.height) : undefined;
  const scroller = document.scrollingElement;
  const mode = matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
  const parts = [`${mode}`, `window ${innerWidth}×${innerHeight}`, visible !== undefined && `visible ${visible}`, `100dvh ${dvh}`, `safe-area ${safeBottom}`, scroller && `page ${scroller.scrollHeight}`];
  return h('p', { class: 'viewport-readout', text: parts.filter(Boolean).join(' · ') });
}

function renderChoice<T extends string | boolean>(
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

/** Only with a ?test param: aids for exercising location on a desktop. */
function renderTestSection(lang: Lang, simulated: { position: Position | undefined; onChange: (position: Position | undefined) => void; onClear: () => void }): HTMLElement {
  return h('div', { class: 'test-section' }, [
    h('h3', { class: 'settings-subtitle', text: t(lang, 'testSection') }),
    renderSimulatedLocation(lang, simulated),
    h('div', { class: 'setting' }, [
      h('button', { class: 'chip', attrs: { type: 'button' }, text: t(lang, 'clearLocation'), on: { click: simulated.onClear } }),
      h('p', { class: 'setting-status', text: t(lang, 'clearLocationHint') }),
    ]),
  ]);
}

/** Paste a Google Maps link (or "lat, lon"); the parsed position stands in for the phone's. */
function renderSimulatedLocation(lang: Lang, simulated: { position: Position | undefined; onChange: (position: Position | undefined) => void }): HTMLElement {
  const status = h('p', { class: 'setting-status', text: describe(simulated.position) });
  const input = h('input', {
    class: 'setting-input',
    attrs: { type: 'text', placeholder: 'https://www.google.com/maps/@13.7563,100.5018,15z', autocomplete: 'off', spellcheck: 'false' },
    on: {
      change: () => {
        const text = input.value.trim();
        const position = text ? parseLocationText(text) : undefined;
        if (text && !position) {
          status.textContent = t(lang, 'simulatedInvalid');
          return;
        }
        simulated.onChange(position);
        status.textContent = describe(position);
      },
    },
  });
  return h('div', { class: 'setting' }, [h('p', { class: 'setting-label', text: t(lang, 'simulatedLocation') }), input, status]);

  function describe(position: Position | undefined): string {
    return position ? `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}` : t(lang, 'simulatedNone');
  }
}
