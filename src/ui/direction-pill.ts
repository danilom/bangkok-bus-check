import { isFallback, localize, t, type Lang } from '../lib/i18n.ts';
import type { LocalizedText, RouteSummary } from '../lib/types.ts';
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
  if (route.loop) {
    // A loop has no termini: the halves are the two rotation senses, labelled
    // by each run's headsign; a sense with no run is greyed out.
    let [left, right] = route.sideLabels ?? [null, null];
    // The same headsign on both senses says nothing; the rotation words do.
    if (left && right && left.th === right.th) [left, right] = [null, null];
    const name = (label: LocalizedText | null, fallback: 'loopLeft' | 'loopRight'): HTMLElement =>
      h('span', { class: label ? 'dir-name' : 'dir-name is-empty', text: label ? localize(lang, label) : t(lang, fallback) });
    return h('div', { class: 'dir-pill dir-pill-loop', attrs: { role: 'group' } }, [
      renderHalf(props, 0, [h('span', { class: 'dir-arrow', text: '↺' }), name(left, 'loopLeft')], selected === 0),
      renderHalf(props, 1, [name(right, 'loopRight'), h('span', { class: 'dir-arrow', text: '↻' })], selected === 1),
    ]);
  }
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

/** For loop routes: "Loop: Bua Khao Village – Min Buri" above the pill. */
export function renderLoopLine(lang: Lang, route: RouteSummary): HTMLElement | false {
  if (!route.loop || !route.terminals) return false;
  const [base, via] = route.terminals;
  return h('p', { class: 'loop-line' }, [
    h('span', { class: 'loop-label', text: `${t(lang, 'loop')}: ` }),
    terminusLabel(lang, base),
    h('span', { class: 'terminals-arrow', text: ' – ' }),
    terminusLabel(lang, via),
  ]);
}

function terminusLabel(lang: Lang, text: { th: string; en?: string }): HTMLElement {
  return h('span', { class: isFallback(lang, text) ? 'dir-name is-fallback' : 'dir-name', text: localize(lang, text) });
}
