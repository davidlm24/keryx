const path = require("node:path");
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { startStaticServer } = require("./server.cjs");

const HOST = "127.0.0.1";
const PORT = 7700;
const BG = "#1a1714";

// KERYX_DEV_URL: a running Vite dev server (npm run desktop:dev).
// KERYX_SMOKE: load the app, check it rendered, print the result and exit.
const DEV_URL = process.env.KERYX_DEV_URL || "";
const SMOKE = process.env.KERYX_SMOKE === "1";
const DEVTOOLS = Boolean(DEV_URL) || process.env.KERYX_DEVTOOLS === "1";

let appUrl = "";
let appOrigin = "";
let mainWindow = null;

// Same page, same origin, so a second launch just focuses the first.
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
        if (isAppUrl(url)) {
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

// Loads the app, waits for React to mount, reports, exits. Lets us verify the
// shell without looking at a window.
function runSmokeTest(win) {
    const errors = [];
    win.webContents.on("console-message", (event) => {
        if (event.level === "error") errors.push(String(event.message).slice(0, 200));
    });
    win.webContents.on("did-fail-load", (_e, code, desc, url) => {
        console.log("SMOKE FAIL", JSON.stringify({ code, desc, url }));
        app.exit(1);
    });

    const deadline = Date.now() + 20000;
    const poll = async () => {
        try {
            const state = await win.webContents.executeJavaScript(`({
                path: location.pathname,
                desktop: Boolean(window.keryxDesktop && window.keryxDesktop.isDesktop),
                rootChildren: document.getElementById("root") ? document.getElementById("root").children.length : -1,
                text: document.body.innerText.slice(0, 80),
            })`);
            if (state.rootChildren > 0 && state.text.trim()) {
                console.log("SMOKE OK", JSON.stringify({ ...state, errors }));
                app.exit(state.desktop ? 0 : 1);
                return;
            }
        } catch { /* page still loading */ }
        if (Date.now() > deadline) {
            console.log("SMOKE TIMEOUT", JSON.stringify({ errors }));
            app.exit(1);
            return;
        }
        setTimeout(poll, 400);
    };
    win.webContents.once("did-finish-load", poll);
}

async function resolveAppUrl() {
    if (DEV_URL) return DEV_URL;
    try {
        const { url } = await startStaticServer({ root: path.join(app.getAppPath(), "dist"), host: HOST, port: PORT });
        return url;
    } catch (err) {
        const inUse = err && err.code === "EADDRINUSE";
        dialog.showErrorBox(
            "KERYX não conseguiu iniciar",
            inUse
                ? `A porta ${PORT} já está em uso por outro programa. Feche-o e abra o KERYX novamente.`
                : `Não foi possível iniciar o servidor local: ${err && err.message}`,
        );
        return "";
    }
}

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    appUrl = await resolveAppUrl();
    if (!appUrl) {
        app.exit(1);
        return;
    }
    appOrigin = new URL(appUrl).origin;
    const win = createMainWindow();
    if (SMOKE) runSmokeTest(win);
});

app.on("window-all-closed", () => app.quit());
