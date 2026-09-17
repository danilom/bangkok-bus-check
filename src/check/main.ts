import '../style.css';

import { registerServiceWorker } from '../ui/service-worker.ts';
import { createApp } from './app.ts';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
createApp(root);
registerServiceWorker();
