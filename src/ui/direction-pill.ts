import { isFallback, localize, type Lang } from '../lib/i18n.ts';
import type { RouteSummary } from '../lib/types.ts';
import { h } from './dom.ts';

/** Which terminus the bus departs from: index into `Route.terminals`. */
export type Side = 0 | 1;

export interface DirectionPillProps {
  lang: Lang;
  route: RouteSummary;
  /** Highlighted half, when used as a toggle. */
  selected?: Side;
  onSelect: (side: Side) => void;
}

/**
 * The route as a line with a tappable half per direction of travel:
 * `[ Bueng Kum → ] [ ← Memorial Bridge ]`. Each half is labelled by the
 * terminus the bus departs from; the arrow shows where it is heading.
 */
export function renderDirectionPill(props: DirectionPillProps): HTMLElement {
  const { lang, route, selected } = props;
  if (!route.terminals) return h('p', { class: 'terminals-unknown', text: '—' });
  const [from, to] = route.terminals;
  return h('div', { class: 'dir-pill', attrs: { role: 'group' } }, [
    renderHalf(props, 0, [terminusLabel(lang, from), h('span', { class: 'dir-arrow', text: '→' })], selected === 0),
    renderHalf(props, 1, [h('span', { class: 'dir-arrow', text: '←' }), terminusLabel(lang, to)], selected === 1),
  ]);
}

function renderHalf(props: DirectionPillProps, side: Side, children: HTMLElement[], isSelected: boolean): HTMLElement {
  return h('button', {
    class: `dir-half dir-half-${side}${isSelected ? ' is-selected' : ''}`,
    attrs: { type: 'button', 'aria-pressed': String(isSelected) },
    on: {
      click: (event) => {
        // The card behind the pill opens the route neutrally; a half picks a side.
        event.stopPropagation();
        props.onSelect(side);
      },
    },
  }, children);
}

function terminusLabel(lang: Lang, text: { th: string; en?: string }): HTMLElement {
  return h('span', { class: isFallback(lang, text) ? 'dir-name is-fallback' : 'dir-name', text: localize(lang, text) });
}
