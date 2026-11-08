// The sound engine (owner 2026-11-08, after the service of 07/11: a video's
// sound came out once per open output window, two or three times over).
// As in ProPresenter, KERYX plays every sound of this computer in ONE place:
// a hidden window on /Som (src/pages/SoundEngine.jsx, what it plays is
// src/lib/soundPlan.js) that reads the live state like any output and shows
// nothing; every output window is muted (outputs-manager.cjs track()).
//
// Never shown, never focusable, no taskbar button, never in the Saídas list
// (its url is no output's, outputKeyForUrl). Made once the console is up and
// made again if its page dies or the window goes (a crash, the smoke closing
// every window), at most `maxRestarts` times in `windowMs`, so a page that
// cannot load never loops; stop() ends it for good (the app quitting).
const ROUTE = "/Som";

function createSoundEngine({ BrowserWindow, url, webPreferences, log = console, maxRestarts = 5, windowMs = 60_000, retryMs = 1000, now = Date.now, schedule = setTimeout }) {
    let win = null;
    let stopped = false;
    let timer = null;
    const restarts = [];

    function open() {
        timer = null;
        if (stopped || (win && !win.isDestroyed())) return win;
        const w = new BrowserWindow({
            show: false,
            width: 640,
            height: 360,
            frame: false,
            skipTaskbar: true,
            focusable: false,
            backgroundColor: "#000000",
            title: "KERYX · som",
            webPreferences,
        });
        win = w;
        w.webContents.on("render-process-gone", (_e, details) => {
            log.warn(`[keryx-som] a página do som parou (${details && details.reason}); abrindo de novo.`);
            if (!w.isDestroyed()) w.destroy();
        });
        w.on("closed", () => {
            if (win === w) win = null;
            again();
        });
        w.loadURL(url).catch((err) => log.error(`[keryx-som] não foi possível abrir ${url}: ${err.message}`));
        return w;
    }

    function again() {
        if (stopped || timer) return;
        const t = now();
        while (restarts.length && t - restarts[0] > windowMs) restarts.shift();
        if (restarts.length >= maxRestarts) {
            log.error(`[keryx-som] o som parou ${restarts.length} vezes em ${Math.round(windowMs / 1000)} s; não abre de novo até reiniciar o KERYX.`);
            return;
        }
        restarts.push(t);
        timer = schedule(open, retryMs);
    }

    function stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = null;
        const w = win;
        win = null;
        if (w && !w.isDestroyed()) w.destroy();
    }

    return { start: open, stop, window: () => (win && !win.isDestroyed() ? win : null), isEngine: (w) => Boolean(w) && w === win };
}

module.exports = { createSoundEngine, ROUTE };
