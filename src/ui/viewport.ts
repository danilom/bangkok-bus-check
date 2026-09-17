/**
 * Firefox on Android, installed to the home screen, reports 100dvh 21px
 * taller than what is visible (the gesture strip) and no safe-area inset
 * for it, so a page sized by dvh scrolls and the keypad's bottom row is
 * clipped. The visual viewport is right in every mode; the stylesheet
 * sizes the page from it and falls back to dvh where it is missing.
 */
export function trackVisibleHeight(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const apply = (): void => document.documentElement.style.setProperty('--visible-height', `${Math.round(viewport.height)}px`);
  viewport.addEventListener('resize', apply);
  apply();
}

/**
 * Scales the boxed test viewport down (never up) to fit the window, so the
 * phone's proportions are kept on any desktop screen.
 */
export function fitTestViewport(root: HTMLElement): void {
  const margin = 24;
  const scale = Math.min(1, (innerHeight - margin) / root.offsetHeight, (innerWidth - margin) / root.offsetWidth);
  root.style.setProperty('--test-scale', String(scale));
}
