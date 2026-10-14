// One window's <video> elements, by url, so a video that moves between the
// projector's media layer and the audio channel ("Tirar o vídeo" and back,
// media.toAudio / audio.toMedia) keeps playing in the same element: the
// player that lets it go and the one that takes it are swapped in one React
// commit, and an element detached and attached again in the same task never
// pauses (the browser only pauses one still out of the document afterwards).
// A new element would load the file again and seek: the stutter it replaced.
//
// DOM-free: the elements are made and thrown away by the caller.
//   create(url)  -> a new element playing url
//   dispose(el)  -> stop it and let the file go
//   afterTask(fn) runs fn once the current task is over (a microtask)
//   later(fn, ms) runs fn after ms (setTimeout)
// An element let go and not taken back in the same task is paused at once
// (silent, as an unmounted player was); one not taken back within graceMs is
// disposed. Taken back sooner (Tela preta for a moment) it resumes without
// loading the file again.
export function createPool({ create, dispose, afterTask = queueMicrotask, later = setTimeout, graceMs = 5000 }) {
    const entries = new Set(); // { url, el, busy, gen }

    function claim(url) {
        for (const e of entries) {
            if (e.url === url && !e.busy) {
                e.busy = true;
                e.gen += 1;
                return e.el;
            }
        }
        const e = { url, el: create(url), busy: true, gen: 0 };
        entries.add(e);
        return e.el;
    }

    function release(el) {
        const e = [...entries].find((x) => x.el === el);
        if (!e || !e.busy) return;
        e.busy = false;
        e.gen += 1;
        const gen = e.gen;
        el.remove?.();
        afterTask(() => {
            if (!e.busy && e.gen === gen) el.pause?.();
        });
        later(() => {
            if (e.busy || e.gen !== gen || !entries.has(e)) return;
            entries.delete(e);
            dispose(el);
        }, graceMs);
    }

    return { claim, release, size: () => entries.size };
}
