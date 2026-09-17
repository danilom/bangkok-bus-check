import { t, type Lang } from '../lib/i18n.ts';
import { parseLocationText, type Position } from '../lib/location.ts';
import type { Accent, Theme } from '../lib/preferences.ts';
import { h } from '../ui/dom.ts';
import { renderAppearanceSettings, renderOnOff, renderSeeAlso, renderSettingsPage } from '../ui/settings.ts';

export interface SettingsViewProps {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  onTheme: (theme: Theme) => void;
  onAccent: (accent: Accent) => void;
  onBack: () => void;
  locationEnabled: boolean;
  onLocationEnabled: (enabled: boolean) => void;
  vansEnabled: boolean;
  onVansEnabled: (enabled: boolean) => void;
  /** Test mode only: a pasted position that replaces the real one. */
  simulated?: { position: Position | undefined; onChange: (position: Position | undefined) => void; onClear: () => void };
}

export function renderSettingsView(props: SettingsViewProps): HTMLElement {
  const { lang } = props;
  return renderSettingsPage(lang, props.onBack, [
    ...renderAppearanceSettings(props),
    renderOnOff(lang, t(lang, 'locationSetting'), props.locationEnabled, props.onLocationEnabled),
    renderOnOff(lang, t(lang, 'vansSetting'), props.vansEnabled, props.onVansEnabled),
    renderSeeAlso(t(lang, 'seeAlso'), t(lang, 'boardName'), t(lang, 'boardBlurb'), `${import.meta.env.BASE_URL}board/`),
    props.simulated && renderTestSection(lang, props.simulated),
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
