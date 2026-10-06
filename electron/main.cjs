const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { startStaticServer, MEDIA_PREFIX } = require("./server.cjs");
const { createStore } = require("./db/store.cjs");
const { registerDataIpc } = require("./data-ipc.cjs");
const schema = require("./db/schema.json");

const HOST = "127.0.0.1";
const PORT = 7700;
const BG = "#1a1714";

// KERYX_DEV_URL: a running Vite dev server (npm run desktop:dev).
// KERYX_DATA_DIR: where the database and media live (tests use a temp dir).
// KERYX_SMOKE: load the app, run the checks in smoke.cjs, print, exit.
const DEV_URL = process.env.KERYX_DEV_URL || "";
const SMOKE = process.env.KERYX_SMOKE === "1";
const DEVTOOLS = Boolean(DEV_URL) || process.env.KERYX_DEVTOOLS === "1";

// Everything the app keeps lives here: keryx.db, media/, and Chromium's own
// profile (localStorage). Back up this folder and nothing is lost.
const dataDir = process.env.KERYX_DATA_DIR || path.join(app.getPath("appData"), "KERYX");
const mediaDir = path.join(dataDir, "media");
fs.mkdirSync(mediaDir, { recursive: true });
app.setPath("userData", dataDir);

let appUrl = "";
let appOrigin = "";
let mainWindow = null;
let store = null;

// Same database, same port: a second launch just focuses the first.
if (!app.requestSingleInstanceLock()) {
    app.quit();
}
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
};

function isAppUrl(url) {
    try {
        return new URL(url).origin === appOrigin;
    } catch {
        return false;
    }
}

function guardWindow(win) {
    const { webContents } = win;

    // Pages open projection windows with window.open. Keep those in the app;
    // anything else (YouTube, docs links) goes to the system browser.
    webContents.setWindowOpenHandler(({ url }) => {
        if (isAppUrl(url) || url === "about:blank") {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    backgroundColor: "#000000",
                    autoHideMenuBar: true,
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

    webContents.on("did-create-window", guardWindow);

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

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        show: false,
        backgroundColor: BG,
        title: "KERYX",
        autoHideMenuBar: true,
        webPreferences,
    });
    guardWindow(mainWindow);
    mainWindow.once("ready-to-show", () => mainWindow.show());
    mainWindow.on("closed", () => { mainWindow = null; });
    mainWindow.loadURL(appUrl);
    return mainWindow;
}

function fatal(title, message) {
    dialog.showErrorBox(title, message);
    app.exit(1);
}

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    try {
        store = createStore({ file: path.join(dataDir, "keryx.db"), schema, log: (m) => console.warn(m) });
    } catch (err) {
        fatal("KERYX não conseguiu abrir os dados", `Não foi possível abrir ${path.join(dataDir, "keryx.db")}:\n${err.message}`);
        return;
    }

    // The loopback server runs in dev too: it serves the media library.
    let serverUrl;
    try {
        ({ url: serverUrl } = await startStaticServer({ root: path.join(app.getAppPath(), "dist"), mediaDir, host: HOST, port: PORT }));
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

    registerDataIpc({
        store,
        mediaDir,
        mediaBaseUrl: serverUrl + MEDIA_PREFIX,
        isTrustedSender: (event) => isAppUrl(event.senderFrame && event.senderFrame.url),
        log: (m) => console.error(m),
    });

    const win = createMainWindow();
    if (SMOKE) require("./smoke.cjs").runSmokeTest(win, { dev: Boolean(DEV_URL) });
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
    if (store) store.close();
});
