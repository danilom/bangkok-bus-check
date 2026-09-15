import './style.css';

import { createApp } from './ui/app.ts';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
createApp(root);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
    // Offline support is a nicety; the app works without it.
    console.warn('Service worker registration failed', error);
  });
}
