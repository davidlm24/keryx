// Lists that follow what is on air (owner 2026-10-16, 0.2.18): the Slides
// column, the No ar strip, the Setlist and the Bíblia's verses keep the card
// on air AND its neighbours in view, so the list moves when the card on air
// reaches the next-to-last visible card — the next one is always visible,
// never discovered only after it went on air. Pure: positions in px along
// the list's axis, the hook (useKeepInView.js) measures them.
//
//   view  { scroll, size }   the scroller's offset and visible length
//   item  { start, end }     the card(s) on air (several verses: their span)
//   next  { start, end }     the card after it, or null at the end
//   prev  { start, end }     the card before it, or null at the start
//   pad                      a little air at the edges
// -> the new scroll offset, or null when nothing needs to move.
export function keepInView(view, item, { next = null, prev = null, pad = 4 } = {}) {
    if (!view || !item || !(view.size > 0)) return null;
    const fits = (a, b) => b - a + 2 * pad <= view.size;
    // What should be visible, from the most to the least: the card before,
    // the card(s) on air and the one after; else the card(s) and the one
    // after; else the card(s) alone.
    let lo = prev ? prev.start : item.start;
    let hi = next ? next.end : item.end;
    if (!fits(lo, hi)) lo = item.start;
    if (!fits(lo, hi)) hi = item.end;
    let target = view.scroll;
    if (hi + pad > target + view.size) target = hi + pad - view.size;
    if (lo - pad < target) target = lo - pad;
    target = Math.max(0, Math.round(target));
    return Math.abs(target - view.scroll) < 1 ? null : target;
}
