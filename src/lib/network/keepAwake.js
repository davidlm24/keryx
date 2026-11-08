// Keeps a phone's or a tablet's screen on (the Controle's "Manter a tela
// ligada", a network screen's first tap: ScreenStart.jsx). The Wake Lock API
// needs HTTPS and the page is http://192.168…, so a tiny silent video loops
// in the page instead (public/nosleep.mp4; it must be started by a tap, as
// phones ask); where the API exists (a secure origin) it is used. The lock
// ends when the page hides, so it is asked again (or the loop played again)
// on return. -> stop()
export function startAwake() {
    let lock = null;
    let video = null;
    const api = window.isSecureContext && navigator.wakeLock?.request;
    const ask = () => navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    if (api) ask();
    else {
        video = document.createElement("video");
        video.className = "rm-awake";
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("aria-hidden", "true");
        video.src = "/nosleep.mp4";
        document.body.appendChild(video);
        video.play().catch(() => {});
    }
    const back = () => {
        if (document.visibilityState !== "visible") return;
        if (!api) { video?.play().catch(() => {}); return; }
        if (!lock || lock.released) ask();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
        document.removeEventListener("visibilitychange", back);
        try { lock?.release(); } catch { /* already released */ }
        lock = null;
        if (video) { video.pause(); video.remove(); video = null; }
    };
}
