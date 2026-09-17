import { t, type Lang } from '../lib/i18n.ts';
import { h } from '../ui/dom.ts';

/** Dots at neighbourhood zoom and up: 6.7k of them citywide are noise below that. */
export const STOPS_MINZOOM = 13;

export function stopsHidden(zoom: number): boolean {
  return zoom < STOPS_MINZOOM;
}

/** The second line of the zoom hint: how far there is to go. Kept in its own element so it can follow the zoom per frame. */
export function zoomLine(lang: Lang, zoom: number): string {
  return t(lang, 'boardZoomLevel').replace('{zoom}', zoom.toFixed(1)).replace('{min}', String(STOPS_MINZOOM));
}

export function renderZoomHint(lang: Lang, zoom: number): HTMLElement {
  return h('p', { class: 'board-hint' }, [
    h('span', { class: 'board-hint-main', text: t(lang, 'boardZoomHint') }),
    h('span', { class: 'board-hint-zoom', text: zoomLine(lang, zoom) }),
  ]);
}
