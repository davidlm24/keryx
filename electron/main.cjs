const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, powerMonitor, safeStorage, screen, session, shell } = require("electron");
const { startStaticServer, MEDIA_PREFIX } = require("./server.cjs");
const { createStore } = require("./db/store.cjs");
const { registerDataIpc } = require("./data-ipc.cjs");
const { createOutputManager, createReloadLimiter } = require("./outputs-manager.cjs");
const { createSettings } = require("./settings.cjs");
const { outputKeyForUrl, outputForKey } = require("./outputs.cjs");
const { createLogger, captureConsole } = require("./logger.cjs");
const { createRendererLog } = require("./rendererLog.cjs");
const { applyPendingImport } = require("./archive.cjs");
const { createUpdater, installedNote } = require("./updater.cjs");
const { createCheckSchedule } = require("./updateSchedule.cjs");
const { createNotifications } = require("./notifications.cjs");
const { createSystem } = require("./system.cjs");
const { createNetwork } = require("./network.cjs");
const { remoteReads } = require("./lan.cjs");
const { createLive, loadLiveRules } = require("./live.cjs");
const { createRunMarker } = require("./runMarker.cjs");
const { startWatchdog } = require("./watchdog.cjs");
const closeGuard = require("./closeGuard.cjs");
const { createLyrics } = require("./lyrics.cjs");
const { createSyncControl, sealWith } = require("./syncControl.cjs");
const { installedVersions } = require("./bible.cjs");
const { createConsoleZoom, zoomCommand } = require("./consoleZoom.cjs");
const windowState = require("./windowState.cjs");
const schema = require("./db/schema.json");

// A projection window covered by another window is still projecting. Windows
// marks covered windows "occluded", and Chromium then pauses their video-only
// media to save power — a muted video froze whenever its window sat behind
// the projector. No window of this app is ever background.
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
app.commandLine.appendSwitch("disable-background-media-suspend");
// The app speaks pt-BR whatever the system's language: Chromium's own
// strings (spelling, form validation, media controls) and what it tells
// Narrator follow this, with <html lang="pt-BR"> in index.html.
app.commandLine.appendSwitch("lang", "pt-BR");

const HOST = "127.0.0.1";
// KERYX_PORT=0 picks a free port; smoke runs do, so a test never collides with
// a KERYX that is open on the same machine.
const PORT = process.env.KERYX_PORT !== undefined ? Number(process.env.KERYX_PORT) : 7700;
// The console's own background (--bg-0 in docs/design-system/tokens.css): the
// window paints it before the page loads, and the Windows title bar uses it so
// the bar and the app read as one surface. Keep it in step with the token.
const BG = "#0d0d0c";
const TITLEBAR_SYMBOLS = "#bbb6ac"; // --fg-2
const TITLEBAR_HEIGHT = 32;
// A detached page's bar (.win-bar in console.css, 40 px with its 1 px line
// under it) is its title bar: the system's buttons sit at its right end,
// down to that line.
const JANELA_BAR_HEIGHT = 39;

// KERYX_DEV_URL: a running Vite dev server (npm run desktop:dev).
// KERYX_DATA_DIR: where the database and media live (tests use a temp dir).
// KERYX_SMOKE: load the app, run the checks in smoke.cjs, print, exit.
const DEV_URL = process.env.KERYX_DEV_URL || "";
const SMOKE = process.env.KERYX_SMOKE === "1";
// KERYX_START_PATH: open the main window on this page (e.g. Console?config=telas).
// Without it the app opens on the operator console; smoke runs keep "/",
// which their checks start from.
const START_PATH = process.env.KERYX_START_PATH ? "/" + process.env.KERYX_START_PATH.replace(/^\/+/, "") : SMOKE ? "" : "/Console";
const DEVTOOLS = Boolean(DEV_URL) || process.env.KERYX_DEVTOOLS === "1";

// Everything the app keeps lives here: keryx.db, media/, and Chromium's own
// profile (localStorage). Back up this folder and nothing is lost.
const dataDir = process.env.KERYX_DATA_DIR || path.join(app.getPath("appData"), "KERYX");
fs.mkdirSync(dataDir, { recursive: true });
app.setPath("userData", dataDir);

// Logs go to <dataDir>/logs (kept 7 days); "Salvar diagnóstico" bundles them.
const logger = createLogger({ dir: path.join(dataDir, "logs") });
captureConsole(logger);
process.on("uncaughtException", (err) => logger.error("uncaughtException:", err && err.stack ? err.stack : err));
process.on("unhandledRejection", (reason) => logger.error("unhandledRejection:", reason && reason.stack ? reason.stack : reason));

// An import prepared by Settings > Importar is swapped in now, before the
// database is opened (an open database file cannot be replaced on Windows).
let importOutcome = null;
try {
    importOutcome = applyPendingImport(dataDir);
    if (importOutcome) logger.info(`[keryx-import] aplicado; dados anteriores em ${importOutcome.archived}; id de sincronização: ${importOutcome.pcId}`);
} catch (err) {
    logger.error(`[keryx-import] não foi possível aplicar: ${err.stack || err.message}`);
    importOutcome = { error: err.message };
}

const mediaDir = path.join(dataDir, "media");
fs.mkdirSync(mediaDir, { recursive: true });

let appUrl = "";
let appOrigin = "";
let mainWindow = null;
let store = null;
let outputs = null;
let system = null;
let network = null;
let live = null;
let sync = null;
// running.json while KERYX runs (electron/runMarker.cjs): found at start, the
// last run died instead of quitting.
let runMarker = null;
// The live-state rules (shared/live-state.mjs) and this computer's settings,
// for the close guard (electron/closeGuard.cjs).
let liveRules = null;
let appSettings = null;
// The console's zoom (Ctrl+= / Ctrl+− / Ctrl+0, electron/consoleZoom.cjs).
let consoleZoom = null;
// The bell, set once the notifications exist (a window can crash before then).
let notify = () => {};
// A quit already decided (app.quit: the updater, the menu, the guard's
// "Fechar o KERYX"): the console's X no longer asks.
let quitting = false;
app.on("before-quit", () => { quitting = true; });

// Same database, same port: a second launch just focuses the first.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
});

const webPreferences = {
    preload: path.join(__dirname, "preload.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    // Output windows play lyric backgrounds and videos with no click on them.
    autoplayPolicy: "no-user-gesture-required",
    // A projection window behind another is still projecting: never throttle,
    // and never let Chromium "pause video-only background media to save
    // power" (it freezes a muted video when the window is covered).
    backgroundThrottling: false,
};

function isAppUrl(url) {
    try {
        return new URL(url).origin === appOrigin;
    } catch {
        return false;
    }
}

// A renderer that dies or hangs reloads itself (ARCH-001): the live state is
// held by the main process and pages ignore stale revisions, so a reload comes
// back on the same slide. Before, a dead projector stayed dead.
const UNRESPONSIVE_MS = 4000;
const RELOAD_DELAY_MS = 300;
function recoverFromCrashes(win) {
    const { webContents } = win;
    const limiter = createReloadLimiter();
    let hung = null;
    const name = () => {
        const output = outputForKey(outputKeyForUrl(webContents.getURL(), appOrigin) || "");
        return output ? `A saída ${output.label}` : win === mainWindow ? "O console" : "Uma janela do KERYX";
    };
    const alive = () => !quitting && !win.isDestroyed() && !webContents.isDestroyed();

    webContents.on("render-process-gone", (_event, details) => {
        if (details.reason === "clean-exit" || !alive()) return;
        const who = name();
        if (!limiter.allow()) {
            logger.error(`[keryx-crash] ${who} reiniciou 3 vezes em 1 minuto; não vai reiniciar de novo (${details.reason})`);
            notify({ key: `crash:${who}`, kind: "warn", title: `${who} reiniciou 3 vezes`, body: "Veja o diagnóstico em Configurações › Dados e backup." });
            return;
        }
        logger.error(`[keryx-crash] ${who} caiu (${details.reason}); reiniciando`);
        setTimeout(() => {
            if (!alive()) return;
            webContents.reload();
            if (win === mainWindow) {
                webContents.once("did-finish-load", () => notify({ key: "console-restarted", kind: "info", title: "O console foi reiniciado", body: "Nada saiu do ar." }));
            }
        }, RELOAD_DELAY_MS);
    });
    // A page silent for 4 s is crashed on purpose, which goes through the
    // handler above (log, limit, reload).
    webContents.on("unresponsive", () => {
        if (hung) return;
        hung = setTimeout(() => {
            hung = null;
            if (!alive()) return;
            logger.error(`[keryx-crash] ${name()} parou de responder; reiniciando`);
            webContents.forcefullyCrashRenderer();
        }, UNRESPONSIVE_MS);
    });
    webContents.on("responsive", () => {
        if (hung) clearTimeout(hung);
        hung = null;
    });
    win.on("closed", () => { if (hung) clearTimeout(hung); });
}

function guardWindow(win) {
    const { webContents } = win;

    // Pages open projection windows with window.open. Keep those in the app;
    // anything else (YouTube, docs links) goes to the system browser.
    webContents.setWindowOpenHandler(({ url }) => {
        if (isAppUrl(url) || url === "about:blank") {
            // Outputs (projector, stage, ...) land on the display the operator
            // chose; a detached page (/Janela) where it was left; any other
            // popup opens where the page asked.
            const key = outputKeyForUrl(url, appOrigin);
            const kind = !key && windowState.janelaKind(url, appOrigin);
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    backgroundColor: "#000000",
                    autoHideMenuBar: true,
                    ...(key && outputs ? outputs.windowOptions(key) : {}),
                    ...(kind ? janelaWindowOptions(kind) : {}),
                    webPreferences,
                },
            };
        }
        if (/^https?:/i.test(url)) shell.openExternal(url);
        return { action: "deny" };
    });

    webContents.on("will-navigate", (event, url) => {
        if (isAppUrl(url)) return;
        event.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url);
    });

    // No free zoom in any window (audit C-91): pinch stays at 100 % (Electron's
    // default, pinned), and should Chromium zoom on its own (the page blocks
    // Ctrl+wheel, src/main.jsx) the console goes back to its saved step and
    // any other window to 100 % — the projector never zooms.
    webContents.on("did-finish-load", () => { webContents.setVisualZoomLevelLimits(1, 1).catch(() => {}); });
    webContents.on("zoom-changed", () => {
        if (win === mainWindow && consoleZoom) consoleZoom.apply(win);
        else if (!win.isDestroyed()) webContents.setZoomFactor(1);
    });

    webContents.on("did-create-window", (child, details) => {
        guardWindow(child);
        if (outputs) outputs.track(child, details.url);
        const kind = windowState.janelaKind(details.url, appOrigin);
        if (kind) {
            if (janelaPlacement(kind).maximized) child.maximize();
            child.on("close", () => keepJanelaPlacement(child, kind));
        }
    });

    // A page with unsaved changes (the Editor) holds its window with
    // beforeunload, and Electron would then keep it without a word: ask
    // (closeGuard.askLeave). A quit already decided (the updater, an import)
    // is never held up; the console's X closes such windows first
    // (closeGuard.closeAll), so the question comes while the console is up.
    webContents.on("will-prevent-unload", (event) => {
        if (quitting || closeGuard.askLeave(dialog, win)) event.preventDefault();
        else win.emit(closeGuard.KEPT_OPEN);
    });

    // Right click: in a text field, the spellchecker's suggestions (when it
    // marked the word), Desfazer / Refazer and the system's own Recortar /
    // Copiar / Colar; everywhere else the console draws its own menus
    // (src/components/console/ContextMenu.jsx), and a page that shows none
    // gets nothing.
    webContents.on("context-menu", (_event, params) => {
        if (!params.isEditable) return;
        const can = params.editFlags || {};
        const words = params.misspelledWord ? (params.dictionarySuggestions || []).slice(0, 5) : [];
        Menu.buildFromTemplate([
            ...words.map((word) => ({ label: word, click: () => webContents.replaceMisspelling(word) })),
            ...(words.length ? [{ type: "separator" }] : []),
            { label: "Desfazer", role: "undo", enabled: Boolean(can.canUndo) },
            { label: "Refazer", role: "redo", enabled: Boolean(can.canRedo) },
            { type: "separator" },
            { label: "Recortar", role: "cut", enabled: Boolean(can.canCut) },
            { label: "Copiar", role: "copy", enabled: Boolean(can.canCopy) },
            { label: "Colar", role: "paste", enabled: Boolean(can.canPaste) },
            { type: "separator" },
            { label: "Selecionar tudo", role: "selectAll", enabled: Boolean(can.canSelectAll) },
        ]).popup({ window: BrowserWindow.fromWebContents(webContents) || undefined });
    });

    recoverFromCrashes(win);

    if (DEVTOOLS) {
        webContents.on("before-input-event", (event, input) => {
            const toggle = input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i");
            if (input.type === "keyDown" && toggle) {
                webContents.toggleDevTools();
                event.preventDefault();
            }
        });
    }
}

// An output the main process opens itself (open at launch, or on request
// from a page): the same window a page's window.open would get.
function openOutputWindow(url, placement) {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        backgroundColor: "#000000",
        autoHideMenuBar: true,
        ...placement,
        webPreferences,
    });
    guardWindow(win);
    win.loadURL(url).catch((err) => logger.error(`[keryx-outputs] não foi possível abrir ${url}: ${err.message}`));
    return win;
}

// Where the console opens (windowState.cjs): as it was left on this computer
// when that fits a monitor connected now, else maximized on the primary one.
// Smoke runs keep the fixed size their checks resize from.
function consolePlacement(settings) {
    if (SMOKE) return { bounds: { ...windowState.DEFAULT }, maximized: false };
    const primaryId = screen.getPrimaryDisplay().id;
    const displays = screen.getAllDisplays().map((d) => ({ primary: d.id === primaryId, bounds: d.bounds, workArea: d.workArea }));
    return windowState.restoreWindow(settings.get(windowState.SETTINGS_KEY, null), displays);
}

// Kept when the console closes: its normal bounds and whether it was maximized.
function keepConsolePlacement(win, settings) {
    if (SMOKE || win.isDestroyed()) return;
    const previous = settings.get(windowState.SETTINGS_KEY, null);
    const state = windowState.windowStateToSave({ normal: win.getNormalBounds(), maximized: win.isMaximized() || win.isFullScreen(), minimized: win.isMinimized() }, previous);
    if (state) settings.set(windowState.SETTINGS_KEY, state);
}

// A detached page (/Janela, one window per kind of page): the console's
// chrome — no native bar, the system's buttons over the page's own bar (its
// WinBar, which leaves them room and drops its ×) — at least 760 × 480, where
// that kind was left on this computer, else its default size centred on the
// console's monitor (windowState.cjs).
function janelaPlacement(kind) {
    const saved = (appSettings?.get(windowState.JANELA_KEY, {}) || {})[kind] || null;
    let home = null;
    try {
        if (mainWindow && !mainWindow.isDestroyed()) home = screen.getDisplayMatching(mainWindow.getBounds()).id;
    } catch { /* the primary below */ }
    if (home === null) home = screen.getPrimaryDisplay().id;
    const displays = screen.getAllDisplays().map((d) => ({ primary: d.id === home, bounds: d.bounds, workArea: d.workArea }));
    return windowState.restoreWindow(saved, displays, windowState.JANELA);
}

function janelaWindowOptions(kind) {
    return {
        ...janelaPlacement(kind).bounds,
        minWidth: windowState.JANELA.min.width,
        minHeight: windowState.JANELA.min.height,
        backgroundColor: BG,
        ...(process.platform === "win32"
            ? { titleBarStyle: "hidden", titleBarOverlay: { color: BG, symbolColor: TITLEBAR_SYMBOLS, height: JANELA_BAR_HEIGHT } }
            : {}),
    };
}

function keepJanelaPlacement(win, kind) {
    if (SMOKE || !appSettings || win.isDestroyed()) return;
    const all = appSettings.get(windowState.JANELA_KEY, {}) || {};
    const state = windowState.windowStateToSave({ normal: win.getNormalBounds(), maximized: win.isMaximized(), minimized: win.isMinimized() }, all[kind]);
    if (state) appSettings.set(windowState.JANELA_KEY, { ...all, [kind]: state });
}

function createMainWindow(settings) {
    const placement = consolePlacement(settings);
    mainWindow = new BrowserWindow({
        ...placement.bounds,
        minWidth: windowState.MIN.width,
        minHeight: windowState.MIN.height,
        show: false,
        backgroundColor: BG,
        title: "KERYX",
        autoHideMenuBar: true,
        // Windows: no native bar. The minimize/maximize/close buttons stay (drawn
        // by the system over the page) in the console's colour; the page leaves
        // the strip to them with env(titlebar-area-height) (console.css).
        ...(process.platform === "win32"
            ? { titleBarStyle: "hidden", titleBarOverlay: { color: BG, symbolColor: TITLEBAR_SYMBOLS, height: TITLEBAR_HEIGHT } }
            : {}),
        // Zoom per window, never per host: every output is on the same
        // 127.0.0.1, and the default mode would zoom the projector with the
        // console (electron/consoleZoom.cjs).
        webPreferences: { ...webPreferences, zoomMode: "isolated", zoomFactor: consoleZoom ? consoleZoom.get() : 1 },
    });
    guardWindow(mainWindow);
    mainWindow.webContents.on("before-input-event", (event, input) => {
        const cmd = consoleZoom && zoomCommand(input);
        if (!cmd) return;
        event.preventDefault();
        consoleZoom.command(cmd);
    });
    mainWindow.once("ready-to-show", () => {
        if (placement.maximized) mainWindow.maximize();
        mainWindow.show();
    });
    // Closing the console closes KERYX. The outputs are not in the taskbar, so
    // otherwise the app could keep running unseen (and the network server up).
    // "close" (not "closed"): the import restart's app.exit() destroys windows
    // without it, so that restart is untouched; the updater's quitAndInstall
    // is already quitting, and app.quit() then does nothing more.
    // The X always asks first (closeGuard.cjs): staying open is the default; the smoke answers through setAsk.
    // Then the windows that are neither the console nor an output (the Editor)
    // close before the quit: one with unsaved changes asks, and "Continuar
    // editando" keeps KERYX open, console and all.
    mainWindow.on("close", (event) => {
        keepConsolePlacement(mainWindow, settings);
        if (quitting) return; // a quit already decided closes every window
        event.preventDefault();
        const enabled = closeGuard.machinePrefs(appSettings?.get(closeGuard.MACHINE_KEY, {})).confirmClose;
        const onAir = Boolean(liveRules?.isOnAir && live && liveRules.isOnAir(live.get()));
        const asked = closeGuard.shouldConfirmClose({ enabled, quitting }) ? closeGuard.askClose(dialog, mainWindow, onAir) : Promise.resolve(true);
        const others = () => BrowserWindow.getAllWindows().filter((w) => w !== mainWindow && !w.isDestroyed() && !outputKeyForUrl(w.webContents.getURL(), appOrigin));
        asked.then((close) => (close ? closeGuard.closeAll(others()) : false)).then((closed) => { if (closed) app.quit(); }, () => {});
    });
    mainWindow.on("closed", () => { mainWindow = null; });
    // Windows is shutting down or logging off (it may not wait for will-quit):
    // not a crash, so neither the watchdog nor the next start brings anything back.
    mainWindow.on("session-end", () => {
        if (live) live.flush();
        if (runMarker) runMarker.clear();
    });
    mainWindow.loadURL(appUrl + START_PATH).catch((err) => {
        // Also what a bad KERYX_START_PATH looks like (Git Bash rewrites "/Console"
        // to a Windows path; use MSYS_NO_PATHCONV=1 or "Console" without a slash).
        console.error(`[keryx] não foi possível abrir ${appUrl + START_PATH}: ${err.message}`);
        if (SMOKE) {
            console.log(`SMOKE FAIL ${JSON.stringify({ load: err.message })}`);
            app.exit(1);
        }
    });
    return mainWindow;
}

function fatal(title, message) {
    // A dialog would block a test run forever; report instead.
    if (SMOKE) console.log(`SMOKE FAIL ${JSON.stringify({ fatal: title, message })}`);
    else dialog.showErrorBox(title, message);
    app.exit(1);
}

app.on("render-process-gone", (_e, contents, details) => logger.error(`render-process-gone: ${details.reason} (${contents.getURL()})`));
app.on("child-process-gone", (_e, details) => logger.error(`child-process-gone: ${details.type} ${details.reason}`));

app.whenReady().then(async () => {
    if (!gotLock) return;
    Menu.setApplicationMenu(null);
    // KERYX is dark only (the owner's decision): Windows draws the title bars
    // of the detached pages and windowed outputs, the text fields' Recortar /
    // Copiar / Colar menu and the native dialogs dark too, whatever the
    // system's own theme.
    nativeTheme.themeSource = "dark";
    logger.info(`KERYX ${app.getVersion()} iniciado (Electron ${process.versions.electron}, ${process.platform})`);
    if (importOutcome && importOutcome.error) {
        dialog.showErrorBox("Importação não aplicada", `Os dados anteriores foram mantidos.\n\n${importOutcome.error}`);
    }

    try {
        store = createStore({ file: path.join(dataDir, "keryx.db"), schema, log: (m) => console.warn(m) });
    } catch (err) {
        fatal("KERYX não conseguiu abrir os dados", `Não foi possível abrir ${path.join(dataDir, "keryx.db")}:\n${err.message}`);
        return;
    }

    // The loopback server runs in dev too: it serves the media library.
    let serverUrl;
    try {
        ({ url: serverUrl } = await startStaticServer({
            root: path.join(app.getAppPath(), "dist"),
            mediaDir,
            bundledDir: path.join(app.getAppPath(), "resources"),
            host: HOST,
            port: PORT,
        }));
    } catch (err) {
        fatal(
            "KERYX não conseguiu iniciar",
            err && err.code === "EADDRINUSE"
                ? `A porta ${PORT} já está em uso por outro programa. Feche-o e abra o KERYX novamente.`
                : `Não foi possível iniciar o servidor local: ${err && err.message}`,
        );
        return;
    }

    appUrl = DEV_URL || serverUrl;
    appOrigin = new URL(appUrl).origin;

    // The spellchecker reads Portuguese whatever the PC's language: on an
    // English Windows "palavrra" offered "palabra" and "palaver".
    try { session.defaultSession.setSpellCheckerLanguages(["pt-BR"]); } catch (err) { console.warn("[keryx] spellchecker:", err?.message || err); }

    // The console's level meters read the sound the PC is putting out
    // (system loopback, Windows), so measuring can never disturb playback.
    // getDisplayMedia needs a video source; the page is given its own frame
    // and stops that track at once. Anything not the app is denied.
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        if (process.platform !== "win32" || !isAppUrl(request.frame?.url || "")) {
            callback({});
            return;
        }
        try {
            callback({ video: request.frame, audio: "loopback" });
        } catch {
            callback({});
        }
    }, { useSystemPicker: false });

    // No page reads the PC's font list through the browser (Local Font
    // Access, window.queryLocalFonts): KERYX lists the fonts itself, in this
    // process (systemFonts.cjs, keryx:fonts; owner 2026-10-20), so the
    // permission is refused everywhere. Electron grants every permission by
    // default; naming this one keeps the rest as they were.
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission !== "local-fonts");
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission !== "local-fonts"));

    const settings = createSettings(path.join(dataDir, "settings.json"), (m) => console.warn(m));
    appSettings = settings;
    consoleZoom = createConsoleZoom({
        settings,
        getWindow: () => mainWindow,
        notify: (z) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("keryx:zoom", z); },
    });
    // First run: the main projector opens with the app (the operator can
    // turn it off in Telas e saídas). Smoke runs manage outputs themselves.
    if (!SMOKE && settings.get("outputs") === undefined) {
        settings.set("outputs", { "/Projection": { target: "auto", openAtLaunch: true } });
    }
    outputs = createOutputManager({
        screen,
        settings,
        getOrigin: () => appOrigin,
        openWindow: openOutputWindow,
        operatorWindow: () => mainWindow,
        log: (m) => console.warn(m),
    });

    // The bell (notifications.cjs) and the updater push to every window; the
    // console listens (system.onNotifications / onUpdate in preload.cjs).
    const broadcast = (channel, payload) => {
        for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
    };
    const notifications = createNotifications({ settings, onChange: (list) => broadcast("keryx:notifications", list) });
    notify = (n) => notifications.add(n);
    const autoUpdates = () => Boolean((settings.get("updates", {}) || {}).auto);
    const updater = createUpdater({
        app,
        log: (m) => logger.info(m),
        isAuto: autoUpdates,
        onChange: (state, before) => {
            broadcast("keryx:update", { ...state, auto: autoUpdates() });
            const v = state.version;
            if (state.status === "available" && before.status !== "available") {
                notifications.add({ key: `update:${v}`, kind: "update", title: `Nova versão do KERYX: ${v}`, body: autoUpdates() ? "Baixando automaticamente." : "Atualize pelo menu do KERYX (Atualizar agora) ou em Configurações.", action: "update" });
            } else if (state.status === "downloaded" && before.status !== "downloaded") {
                // Kept for after the restart: the bell says what this version brings.
                settings.set("pendingNotes", { version: v, notes: state.notes || "" });
                notifications.add({ key: `update:${v}`, kind: "update", title: `Versão ${v} pronta para instalar`, body: "O KERYX fecha e abre de novo em uns 30 segundos, e as telas apagam nesse tempo. Instale fora do culto.", action: "update" });
            } else if (state.status === "error" && before.status === "downloading") {
                notifications.add({ key: "update-error", kind: "warn", title: "A atualização não foi baixada", body: state.message, action: "update" });
            }
        },
    });
    // After an update: say so once, and drop the notes it answered.
    const version = app.getVersion();
    const lastVersion = settings.get("lastVersion", null);
    const updated = installedNote({ lastVersion, version, pending: settings.get("pendingNotes", null) });
    if (updated) {
        notifications.remove((n) => n.key.startsWith("update:") || n.key === "update-error");
        notifications.add(updated);
        // The console opens "Novidades" once, with every version since this
        // one (cleared when the operator closes it: whatsNewSeen).
        settings.set("whatsNew", { from: lastVersion, to: version });
    }
    if (lastVersion !== version) {
        settings.set("lastVersion", version);
        settings.set("pendingNotes", null);
    }
    system = createSystem({ app, dialog, shell, BrowserWindow, store, dataDir, mediaDir, settings, outputs, updater, logger, screen, notifications, consoleZoom, syncInfo: () => (sync ? sync.status() : null) });
    try {
        system.backupNow("ao abrir");
    } catch { /* logged; the app still opens */ }

    // Did the last run end normally? A crash a few minutes ago brings the
    // screens back as the audience saw them and reopens the outputs that were
    // open (owner 2026-10-20). A restart KERYX asked for itself (an import or
    // a restore swapped in at this start, app.exit without will-quit) is not one.
    const markerFile = path.join(dataDir, "running.json");
    runMarker = createRunMarker({ file: markerFile, log: (m) => logger.warn(m) });
    const crash = importOutcome ? null : runMarker.plan;
    if (crash) logger.warn(`[keryx-crash] o KERYX não fechou normalmente (último sinal ${new Date(crash.diedAt).toISOString()}); ${crash.lit ? `voltando como estava, saídas: ${crash.outputs.join(", ") || "nenhuma"}` : "faz tempo: telas pretas, como num início normal"}`);

    // What every output shows right now (shared/live-state.mjs).
    try {
        liveRules = await loadLiveRules();
        live = createLive({ file: path.join(dataDir, "live.json"), rules: liveRules, log: (m) => logger.warn(m), afterCrash: Boolean(crash && crash.lit) });
        // A live state starting empty takes the church's logo look and idle
        // screen (Configurações › Igreja and Aparência, liveSeed.cjs).
        if (live.fresh) {
            try {
                const profile = store.call("User", "get", ["local"]);
                for (const [op, args] of require("./liveSeed.cjs").seedOps(profile)) live.call(op, args);
            } catch (err) { logger.warn(`[keryx-live] não foi possível aplicar o logo e a tela ociosa da igreja: ${err.message}`); }
        }
    } catch (err) {
        fatal("KERYX não conseguiu iniciar", `Não foi possível carregar o estado da projeção: ${err && err.message}`);
        return;
    }
    runMarker.start(() => outputs.list().outputs.filter((o) => o.open).map((o) => o.key));
    if (crash && crash.lit) {
        notify({ key: "keryx-crashed", kind: "warn", title: "O KERYX fechou sozinho e abriu de novo", body: "As telas voltaram como estavam. O som e os vídeos estão pausados: dê play no player para continuar." });
    }
    // If main itself dies, the watchdog opens KERYX again (electron/watchdog.cjs).
    // Only the installed app: in desktop:dev Ctrl+C would bring it back, and
    // smoke runs manage their own windows.
    if (app.isPackaged && !SMOKE && !process.env.KERYX_DATA_DIR) {
        startWatchdog({
            spawn: require("node:child_process").spawn,
            execPath: process.execPath,
            pid: process.pid,
            markerFile,
            relaunch: { command: process.execPath, args: process.argv.slice(1), cwd: process.cwd() },
            log: (m) => logger.warn(m),
        });
    }

    // The windows' own errors into the daily log (electron/rendererLog.cjs:
    // rate-limited per window). Only the app's windows have the preload, so
    // network screens never send here.
    const rendererLog = createRendererLog({ logger });
    const rendererSeen = new Set();
    ipcMain.on("keryx:log", (event, payload) => {
        const url = event.senderFrame && event.senderFrame.url;
        if (!isAppUrl(url)) return;
        const id = event.sender.id;
        if (!rendererSeen.has(id)) {
            rendererSeen.add(id);
            event.sender.once("destroyed", () => { rendererSeen.delete(id); rendererLog.forget(id); });
        }
        rendererLog.write(id, url, payload);
    });

    // Controle remoto: a phone's command (electron/lan.cjs, checked there
    // against shared/remoteProtocol.json) goes to the console, which runs it
    // as its own keys would and answers; its refusal code goes back too.
    const remotePending = new Map();
    let remoteSeq = 0;
    ipcMain.on("keryx:remote:result", (event, answer = {}) => {
        if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
        const done = remotePending.get(answer.id);
        if (!done) return;
        remotePending.delete(answer.id);
        done({ ok: Boolean(answer.ok), message: typeof answer.message === "string" ? answer.message.slice(0, 200) : "", status: Number(answer.status) || undefined, code: typeof answer.code === "string" ? answer.code : undefined, data: answer.data });
    });
    const onRemote = (action, args, meta = {}) => new Promise((resolve) => {
        if (!mainWindow || mainWindow.isDestroyed()) return resolve({ ok: false, message: "O console não está aberto no computador.", status: 503, code: "busy" });
        const id = ++remoteSeq;
        remotePending.set(id, resolve);
        // Past the longest wait lan.cjs gives (8 s for the Bíblia).
        setTimeout(() => remotePending.delete(id), 10000).unref();
        // Reads (state every few seconds, the library) are not logged.
        if (!remoteReads(action)) logger.info(`[keryx-remote] ${action} de ${String(meta.ip || "").replace(/^::ffff:/, "")}`);
        // v: the phone's protocol version (1 = an old page; state answers it in its shape).
        mainWindow.webContents.send("keryx:remote", { id, action, args, v: meta.v || 1 });
    });

    // Destacar em janela (Rodada F5): a page in a window of its own (/Janela;
    // /Editor is its old name) and the console talk through here — a page's
    // message goes to the console, the console's to every detached page.
    // Main only says who sent it; the side that receives checks the message
    // against its closed list (src/lib/janelaRelay.js, checkMessage).
    const isJanelaUrl = (url) => {
        try { const u = new URL(url); return u.origin === appOrigin && (u.pathname === "/Janela" || u.pathname === "/Editor"); } catch { return false; }
    };
    ipcMain.on("keryx:janela", (event, msg) => {
        if (!mainWindow || mainWindow.isDestroyed() || !msg || typeof msg !== "object" || typeof msg.type !== "string") return;
        try { if (JSON.stringify(msg).length > 1024 * 1024) return; } catch { return; }
        if (event.sender === mainWindow.webContents) {
            const out = { ...msg, from: "console" };
            for (const w of BrowserWindow.getAllWindows()) {
                if (w !== mainWindow && !w.isDestroyed() && isJanelaUrl(w.webContents.getURL())) w.webContents.send("keryx:janela", out);
            }
        } else if (isJanelaUrl(event.senderFrame && event.senderFrame.url)) {
            mainWindow.webContents.send("keryx:janela", { ...msg, from: "janela" });
        }
    });

    // Tablets and TVs on the church network (off until enabled in Settings).
    // KERYX_LAN_PORT=0 lets a smoke run use a free port.
    network = createNetwork({
        onRemote,
        store,
        live,
        settings,
        distDir: path.join(app.getAppPath(), "dist"),
        mediaDir,
        bundledDir: path.join(app.getAppPath(), "resources"),
        logger,
        port: process.env.KERYX_LAN_PORT !== undefined ? Number(process.env.KERYX_LAN_PORT) : undefined,
    });
    await network.startIfEnabled();
    // Finds out on launch (at once with Atualizar automaticamente, which also
    // downloads), every 6 hours for a PC left on, again soon after a check
    // that failed (a PC that boots before its network does) and when the PC
    // wakes (electron/updateSchedule.cjs). The bell tells; it never installs
    // by itself: the console does, from its popup, only with nothing on air.
    if (updater.enabled() && !SMOKE && !DEV_URL) {
        const checks = createCheckSchedule({ updater, firstMs: autoUpdates() ? 2000 : 8000 });
        checks.start();
        powerMonitor.on("resume", () => checks.resume());
    }

    // Sync with the church's other computers through a shared folder
    // (electron/sync.cjs), set up in Configurações › Sincronização
    // (electron/syncControl.cjs): off until a folder is chosen and the
    // church's code typed. A pass every 30 s and 3 s after a local change.
    let missingSent = "";
    // The Bible editions installed here, for the others' "Falta a NVI aqui"
    // (computer.json; never the text). Counted at most once a minute: the
    // status is asked every few seconds and an edition is 31k rows.
    let bibles = { at: 0, list: [] };
    const installedBibles = () => {
        if (Date.now() - bibles.at > 60000) {
            let list = bibles.list;
            try {
                list = Object.entries(installedVersions(store)).filter(([, n]) => n > 0).map(([v]) => v);
            } catch { /* the last list */ }
            bibles = { at: Date.now(), list };
        }
        return bibles.list;
    };
    sync = createSyncControl({
        store,
        mediaDir,
        settings,
        protect: sealWith(safeStorage),
        chooseFolder: async (event) => {
            const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender) || undefined, {
                title: "Pasta da sincronização",
                buttonLabel: "Usar esta pasta",
                properties: ["openDirectory", "createDirectory"],
            });
            return canceled || !filePaths[0] ? null : filePaths[0];
        },
        openPath: (folder) => shell.openPath(folder),
        describe: () => ({ name: os.hostname(), version: app.getVersion(), bibles: installedBibles() }),
        notify: (n) => notifications.add(n),
        dismiss: (key) => notifications.remove((n) => n.key === key),
        log: (m) => logger.warn(m),
        onStatus: () => {
            const names = sync ? sync.missing() : [];
            const key = names.join("|");
            if (key === missingSent) return;
            missingSent = key;
            broadcast("keryx:sync:missing", names);
        },
    });

    registerDataIpc({
        store,
        outputs,
        system,
        network,
        sync,
        live,
        lyrics: createLyrics(),
        mediaDir,
        mediaBaseUrl: serverUrl + MEDIA_PREFIX,
        isTrustedSender: (event) => isAppUrl(event.senderFrame && event.senderFrame.url),
        log: (m) => console.error(m),
    });

    // A backup restored, or an export imported, on a computer that syncs:
    // what the operator chose before the restart (system.cjs syncQuestion),
    // now that the swapped-in database is open.
    const afterImport = settings.get("syncAfterImport", null);
    if (afterImport) {
        settings.set("syncAfterImport", null);
        if (importOutcome && !importOutcome.error) sync.afterImport(afterImport.mode);
    }
    // The windows hear which media files rows name that have not come down
    // yet ("Baixando…", and the console refuses to send them): asked once,
    // then pushed when the list changes (syncControl's onStatus, above).
    ipcMain.handle("keryx:sync:missing", (event) => (isAppUrl(event.senderFrame && event.senderFrame.url)
        ? { data: sync.missing() }
        : { error: { message: "Origem não autorizada.", status: 403 } }));
    sync.start();
    powerMonitor.on("resume", () => sync.poke());

    const win = createMainWindow(settings);
    // Outputs set to "Abrir ao iniciar" in Telas e saídas.
    // After a recent crash, also the ones that were open then.
    win.once("ready-to-show", () => outputs.openAtLaunch(crash && crash.lit ? crash.outputs : []));
    if (SMOKE) require("./smoke.cjs").runSmokeTest(win, { dev: Boolean(DEV_URL), outputs, screen, system, settings, network, live, dataDir, importOutcome });
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
    if (sync) sync.stop();
    if (network) network.stop();
    if (live) live.flush();
    // A normal quit: nothing to recover, and the watchdog lets it go.
    if (runMarker) runMarker.clear();
    if (system) {
        try {
            system.backupNow("ao fechar");
        } catch { /* logged */ }
    }
    if (store) store.close();
});
