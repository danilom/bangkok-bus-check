import { t, type Lang } from '../lib/i18n.ts';
import { h } from './dom.ts';

/** "Build 05e2b75 on 2026-09-17 00:43": which build a phone is running, in its own time zone. */
export function renderBuildLine(lang: Lang): HTMLElement {
  return h('p', { class: 'footer-line', text: `${t(lang, 'build')} ${__BUILD_COMMIT__} ${t(lang, 'buildOn')} ${formatLocalTime(__BUILD_TIME__)}` });
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
