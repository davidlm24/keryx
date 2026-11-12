import { useLayoutEffect } from "react";
import { fitSearch, boxHolds, LINE_MIN } from "@/lib/screenFit";

// A text box whose content always fits it whole (the Palco's lyrics and a
// design's "Letra atual", owner 2026-11-12: a long slide was cut at the
// bottom). The box keeps its size; its CSS multiplies the font by `--fit`,
// the largest factor in [HEIGHT_MIN, 1] at which nothing overflows it, down
// or across (the chords' lines do not wrap). Measured again when `key`
// changes (the slide, the transpose, the size, the Escala do texto), when the box's parent
// resizes and when a font arrives. The parent is watched, not the box: a
// box that grows with its text would feed the observer its own change.
// `oneLine` (a song's lyrics, owner 2026-11-12): each line of the lyrics
// stays one line, as on the projection — the font shrinks for the longest
// line down to LINE_MIN, and only past that the lines wrap (`is-oneline`
// off) and the height alone sets the size.
export function useBoxFit(ref, key, on = true, oneLine = false) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!on || !el) return undefined;
        const set = (f) => el.style.setProperty("--fit", String(f));
        const fits = (f) => { set(f); return boxHolds({ scrollH: el.scrollHeight, clientH: el.clientHeight, scrollW: el.scrollWidth, clientW: el.clientWidth, fontPx: parseFloat(getComputedStyle(el).fontSize) }); };
        const measure = () => {
            if (oneLine) {
                el.classList.add("is-oneline");
                const f = fitSearch(fits);
                if (f >= LINE_MIN) { set(f); return; }
                el.classList.remove("is-oneline");
            }
            set(fitSearch(fits));
        };
        measure();
        let frame = 0, alive = true;
        const later = () => { if (!alive) return; cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
        const ro = typeof ResizeObserver === "function" ? new ResizeObserver(later) : null;
        if (ro && el.parentElement) ro.observe(el.parentElement);
        const fonts = typeof document !== "undefined" ? document.fonts : null;
        fonts?.addEventListener?.("loadingdone", later);
        // A font that finished before this listener (the page loading Geist
        // while the first slide is drawn) never says loadingdone: measure
        // again once every font is in, as the projection does.
        fonts?.ready?.then(later);
        return () => {
            alive = false;
            cancelAnimationFrame(frame);
            ro?.disconnect();
            fonts?.removeEventListener?.("loadingdone", later);
            el.style.removeProperty("--fit");
            el.classList.remove("is-oneline");
        };
    }, [ref, key, on, oneLine]);
}

// A screen's box whose content always fits its padding box — the safe area
// (owner 2026-11-12, "Telas · fase 2", T = A): an aviso, a text, an Escola
// activity, a song's title in its introduction. The box stays inset 0; its
// CSS multiplies the content's font by `--fit`, the largest factor at which
// the children (through display: contents wrappers) fit inside the padding,
// measured by their layout boxes (offsetTop/offsetHeight: a scaled preview
// measures the same). Measured again when `key` changes, the box resizes or
// a font arrives.
const layoutKids = (el) => [...el.children].flatMap((c) => (getComputedStyle(c).display === "contents" ? layoutKids(c) : [c]));
export function useContentFit(ref, key, on = true) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!on || !el) return undefined;
        const set = (f) => el.style.setProperty("--fit", String(f));
        const fits = (f) => {
            set(f);
            const cs = getComputedStyle(el);
            const px = (k) => parseFloat(cs[k]) || 0;
            const kids = layoutKids(el).filter((c) => c.offsetParent === el && getComputedStyle(c).position !== "absolute");
            if (!kids.length) return true;
            let top = Infinity, bottom = -Infinity, wide = 0;
            for (const c of kids) { top = Math.min(top, c.offsetTop); bottom = Math.max(bottom, c.offsetTop + c.offsetHeight); wide = Math.max(wide, c.scrollWidth, c.offsetWidth); }
            return boxHolds({ scrollH: bottom - top, clientH: el.clientHeight - px("paddingTop") - px("paddingBottom"), scrollW: wide, clientW: el.clientWidth - px("paddingLeft") - px("paddingRight"), fontPx: 0 });
        };
        const measure = () => set(fitSearch(fits));
        measure();
        let frame = 0;
        const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
        const ro = typeof ResizeObserver === "function" ? new ResizeObserver(later) : null;
        ro?.observe(el);
        const fonts = typeof document !== "undefined" ? document.fonts : null;
        fonts?.addEventListener?.("loadingdone", later);
        return () => {
            cancelAnimationFrame(frame);
            ro?.disconnect();
            fonts?.removeEventListener?.("loadingdone", later);
            el.style.removeProperty("--fit");
        };
    }, [ref, key, on]);
}
