import { useLayoutEffect } from "react";
import { fitSearch, boxHolds } from "@/lib/screenFit";

// A text box whose content always fits it whole (the Palco's lyrics and a
// design's "Letra atual", owner 2026-11-12: a long slide was cut at the
// bottom). The box keeps its size; its CSS multiplies the font by `--fit`,
// the largest factor in [HEIGHT_MIN, 1] at which nothing overflows it, down
// or across (the chords' lines do not wrap). Measured again when `key`
// changes (the slide, the transpose, the size, the Escala do texto), when the box's parent
// resizes and when a font arrives. The parent is watched, not the box: a
// box that grows with its text would feed the observer its own change.
export function useBoxFit(ref, key, on = true) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!on || !el) return undefined;
        const set = (f) => el.style.setProperty("--fit", String(f));
        const fits = (f) => { set(f); return boxHolds({ scrollH: el.scrollHeight, clientH: el.clientHeight, scrollW: el.scrollWidth, clientW: el.clientWidth, fontPx: parseFloat(getComputedStyle(el).fontSize) }); };
        const measure = () => set(fitSearch(fits));
        measure();
        let frame = 0;
        const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
        const ro = typeof ResizeObserver === "function" ? new ResizeObserver(later) : null;
        if (ro && el.parentElement) ro.observe(el.parentElement);
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
