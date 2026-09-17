import { t, type Lang, type StringKey } from '../lib/i18n.ts';
import type { Accent, Theme } from '../lib/preferences.ts';
import { h } from '../ui/dom.ts';
import { renderAppearanceSettings, renderChoice, renderSeeAlso, renderSettingsPage } from '../ui/settings.ts';
import { switchTestViewport, type TestViewport } from '../ui/viewport.ts';

export interface SettingsViewProps {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  /** The Test section, when shown: which viewport the page is boxed to (none is the window). */
  test?: { viewport: TestViewport | undefined };
  onTheme: (theme: Theme) => void;
  onAccent: (accent: Accent) => void;
  onBack: () => void;
}

type ViewportChoice = TestViewport | 'desktop';

const VIEWPORTS: readonly ViewportChoice[] = ['desktop', 'phone', 'phone-full'];
const VIEWPORT_LABELS: Record<ViewportChoice, StringKey> = { desktop: 'viewportDesktop', phone: 'viewportPhone', 'phone-full': 'viewportPhoneFull' };

export function renderSettingsView(props: SettingsViewProps): HTMLElement {
  const { lang } = props;
  return renderSettingsPage(lang, props.onBack, [
    ...renderAppearanceSettings(props),
    renderSeeAlso(t(lang, 'seeAlso'), t(lang, 'appName'), t(lang, 'checkBlurb'), import.meta.env.BASE_URL),
    props.test && renderTestSection(lang, props.test.viewport),
  ]);
}

/** Aids for judging the board on a desktop: the page boxed to a phone's viewport, or the whole window. */
function renderTestSection(lang: Lang, viewport: TestViewport | undefined): HTMLElement {
  return h('div', { class: 'test-section' }, [
    h('h2', { class: 'settings-title', text: t(lang, 'testSection') }),
    renderChoice(t(lang, 'testViewport'), VIEWPORTS, viewport ?? 'desktop', (option) => t(lang, VIEWPORT_LABELS[option]), (option) =>
      switchTestViewport(option === 'desktop' ? undefined : option)),
  ]);
}
