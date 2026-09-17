import type { Accent, Theme } from '../lib/preferences.ts';

/** Theme and accent are attributes on <html> that the stylesheet keys off; the browser chrome colour follows. */
export function applyAppearance(theme: Theme, accent: Accent): void {
  const html = document.documentElement;
  if (theme === 'system') html.removeAttribute('data-theme');
  else html.dataset['theme'] = theme;
  html.dataset['accent'] = accent;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(theme) ? '#121212' : '#f2f2f2');
}

/** The theme in effect, with "system" resolved against the OS preference. */
export function isDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
}
