/** One worker at the site root serves both apps; registering it from either page gives the same scope. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
    // Offline support is a nicety; the app works without it.
    console.warn('Service worker registration failed', error);
  });
}
