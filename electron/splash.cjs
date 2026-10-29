"use strict";
// The opening window (owner 2026-10-29, mockup "Tela de abertura do KERYX",
// A1-A · A2-A · A3-C): a small frameless window centred where the console
// will open, the gold K and KERYX on the brand's gold glow, the version and
// a line saying what KERYX is doing ("Fazendo o backup…") over a thin bar.
// It shows before the store opens and goes once the console is on screen.
// Never on top of other windows, never on an output's monitor, never in a
// smoke run (its focus checks), and KERYX_NO_SPLASH=1 turns it off.
//
// The page is electron/splash.html: its own CSS and the Geist file the app
// ships, no React and no network, so it opens at once. The step line reaches
// it through executeJavaScript (no preload, no IPC). Main's long steps run
// synchronously (the backup), so step() waits for the page to paint the line
// before it returns: the operator reads what KERYX is busy with.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SIZE = { width: 520, height: 320 };

// What KERYX is doing, in the order main does it, and how far along the bar
// goes when it starts (0..1). The last one waits for the console's page.
const STEPS = {
    data: { text: "Abrindo os dados…", at: 0.1 },
    backup: { text: "Fazendo o backup…", at: 0.3 },
    live: { text: "Preparando as telas…", at: 0.55 },
    network: { text: "Ligando a rede…", at: 0.7 },
    sync: { text: "Conferindo a sincronização…", at: 0.8 },
    console: { text: "Abrindo o console…", at: 0.92 },
};

// The longest the console may take to show itself before the splash gives up
// (a page that never loads must not leave a window over the desktop).
const GIVE_UP_MS = 60_000;
// The longest step() waits for the page to paint; main never stalls on it.
const PAINT_WAIT_MS = 250;

function splashEnabled(env = process.env) {
    return env.KERYX_SMOKE !== "1" && env.KERYX_NO_SPLASH !== "1";
}

// Centred in the box the console will open in (its saved bounds, else the
// primary monitor's work area), never larger than that box.
function splashBounds(box, size = SIZE) {
    const width = Math.min(size.width, Math.max(1, box.width));
    const height = Math.min(size.height, Math.max(1, box.height));
    return {
        x: Math.round(box.x + (box.width - width) / 2),
        y: Math.round(box.y + (box.height - height) / 2),
        width,
        height,
    };
}

// The step's words and the bar's place, or null for a step it does not know.
function stepOf(id) {
    return STEPS[id] || null;
}

// The Geist file: the source in desktop:dev, the built asset (hashed name)
// in the installed app. Null draws the system's sans.
function fontFile(appPath, fsApi = fs) {
    const src = path.join(appPath, "src", "assets", "fonts", "Geist-Variable.woff2");
    if (fsApi.existsSync(src)) return src;
    const assets = path.join(appPath, "dist", "assets");
    try {
        const hit = fsApi.readdirSync(assets).find((f) => /^Geist-Variable[-.].*\.woff2$/.test(f));
        if (hit) return path.join(assets, hit);
    } catch { /* no dist: the system's font */ }
    return null;
}

function createSplash({ BrowserWindow, box, version, appPath, log = () => {} }) {
    const font = fontFile(appPath);
    const win = new BrowserWindow({
        ...splashBounds(box),
        show: false,
        frame: false,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        closable: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        title: "KERYX",
        // The page's own ground (--bg-0), so nothing flashes white before it paints.
        backgroundColor: "#0d0d0c",
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    let gone = false;
    const query = { version: version || "" };
    if (font) query.font = pathToFileURL(font).href;
    const ready = new Promise((resolve) => {
        win.once("ready-to-show", () => {
            if (!gone) win.show();
            resolve();
        });
        win.webContents.once("did-fail-load", () => resolve());
    });
    win.loadFile(path.join(__dirname, "splash.html"), { query }).catch((err) => log(`[keryx-abertura] ${err.message}`));
    const timer = setTimeout(() => close(), GIVE_UP_MS);
    if (timer.unref) timer.unref();

    async function step(id) {
        const s = stepOf(id);
        if (!s || gone || win.isDestroyed()) return;
        const js = `window.keryxSplash && window.keryxSplash(${JSON.stringify(s.text)}, ${s.at})`;
        await Promise.race([
            win.webContents.executeJavaScript(js, true).catch(() => {}),
            new Promise((r) => setTimeout(r, PAINT_WAIT_MS)),
        ]);
    }

    function close() {
        if (gone) return;
        gone = true;
        clearTimeout(timer);
        if (!win.isDestroyed()) win.destroy();
    }

    return { ready, step, close, window: win };
}

module.exports = { SIZE, STEPS, GIVE_UP_MS, splashEnabled, splashBounds, stepOf, fontFile, createSplash };
