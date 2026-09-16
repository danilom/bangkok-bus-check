import { isFallback, localize, t, type Lang } from '../lib/i18n.ts';
import type { LoopSide, RouteSummary } from '../lib/types.ts';
import { h } from './dom.ts';

/** Which terminus the bus is heading to: index into `Route.terminals`. */
export type Side = 0 | 1;

/**
 * Which side of an element a tap landed on. Cards and the detail header are
 * split down the middle so a thumb has far more than the pill to hit.
 */
export function sideAt(event: MouseEvent, element: HTMLElement): Side {
  const bounds = element.getBoundingClientRect();
  return event.clientX - bounds.left < bounds.width / 2 ? 0 : 1;
}

export interface DirectionPillProps {
  lang: Lang;
  route: RouteSummary;
  /** Highlighted half, when used as a toggle. */
  selected?: Side;
  onSelect: (side: Side) => void;
}

/**
 * The route as a line with a tappable half per direction of travel:
 * `[ to Bueng Kum ] [ to Memorial Bridge ]`. Each half names the destination,
 * as the bus's own front sign does.
 */
export function renderDirectionPill(props: DirectionPillProps): HTMLElement {
  const { lang, route, selected } = props;
  if (!route.terminals) return h('p', { class: 'terminals-unknown', text: '—' });
  const [from, to] = route.terminals;
  if (route.loop) {
    // Loop halves read as the front sign does: "Rama 9 วนซ้าย" when the sign
    // carries a rotation marker, "to Thewet" when it is signed as a plain
    // destination. A sense with no run is greyed out.
    const [left, right] = route.sideLabels ?? [null, null];
    return h('div', { class: 'dir-pill dir-pill-loop', attrs: { role: 'group' } }, [
      renderHalf(props, 0, loopHalf(lang, left, 0), selected === 0),
      renderHalf(props, 1, loopHalf(lang, right, 1), selected === 1),
    ]);
  }
  return h('div', { class: 'dir-pill', attrs: { role: 'group' } }, [
    renderHalf(props, 0, [toWord(lang), terminusLabel(lang, from)], selected === 0),
    renderHalf(props, 1, [toWord(lang), terminusLabel(lang, to)], selected === 1),
  ]);
}

function loopHalf(lang: Lang, side: LoopSide | null, index: Side): HTMLElement[] {
  if (!side) return [h('span', { class: 'dir-name is-empty', text: t(lang, index === 0 ? 'loopLeft' : 'loopRight') })];
  if (!side.marked) return [toWord(lang), terminusLabel(lang, side.name)];
  return [terminusLabel(lang, side.name), h('span', { class: 'dir-to', text: t(lang, index === 0 ? 'senseLeft' : 'senseRight') })];
}

function toWord(lang: Lang): HTMLElement {
  return h('span', { class: 'dir-to', text: t(lang, 'to') });
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
