import { t, type Lang } from '../lib/i18n.ts';
import type { Accent, Theme } from '../lib/preferences.ts';
import { renderAppearanceSettings, renderSeeAlso, renderSettingsPage } from '../ui/settings.ts';

export interface SettingsViewProps {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  onTheme: (theme: Theme) => void;
  onAccent: (accent: Accent) => void;
  onBack: () => void;
}

export function renderSettingsView(props: SettingsViewProps): HTMLElement {
  const { lang } = props;
  return renderSettingsPage(lang, props.onBack, [
    ...renderAppearanceSettings(props),
    renderSeeAlso(t(lang, 'seeAlso'), t(lang, 'appName'), t(lang, 'checkBlurb'), import.meta.env.BASE_URL),
  ]);
}
