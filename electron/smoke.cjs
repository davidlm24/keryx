// npm run desktop:smoke — loads the app in the real shell and checks, in the
// page, that it rendered and that data flows through the bridge. In dev mode
// it also drives the renderer adapter (src/api) end to end. Prints one
// "SMOKE OK|FAIL <json>" line and exits 0 or 1. Always runs on a throwaway
// data dir (scripts/desktop.mjs sets KERYX_DATA_DIR).

const fs = require("node:fs");
const { app, BrowserWindow } = require("electron");

const RENDERED = `(() => {
    const root = document.getElementById("root");
    return {
        path: location.pathname,
        desktop: Boolean(window.keryxDesktop && window.keryxDesktop.isDesktop),
        rootChildren: root ? root.children.length : -1,
        text: document.body.innerText.slice(0, 60),
        // The desktop build must not reach the cloud backend.
        supabaseRequests: performance.getEntriesByType("resource").filter((e) => /supabase.co/.test(e.name)).length,
    };
})()`;

// The preload bridge and the main-process store, without the adapter.
const BRIDGE = `(async () => {
    const db = window.keryxDesktop.db;
    const seen = [];
    const off = db.onChange((c) => { if (c.entity === "Song") seen.push(c.type); });
    const created = await db.call("Song", "create", [{ title: "Smoke", lyrics: "x", slides: [{ text: "a" }] }]);
    const listed = await db.call("Song", "filter", [{ title: "Smoke" }]);
    const bad = await db.call("Song", "filter", [{ nope: 1 }]);
    await db.call("Song", "delete", [created.data.id]);
    await new Promise((r) => setTimeout(r, 150));
    off();
    return {
        created: Boolean(created.data && created.data.id),
        slides: created.data && created.data.slides,
        listed: listed.data && listed.data.length,
        badStatus: bad.error && bad.error.status,
        events: seen,
    };
})()`;

// The renderer adapter exactly as pages use it (dev only: needs Vite's /src).
const ADAPTER = `(async () => {
    const { keryx } = await import("/src/api/keryxClient.js");
    const out = { isDesktop: keryx.isDesktop };
    const events = [];
    const unsub = keryx.entities.LyricSync.subscribe((e) => events.push(e.type + ":" + (e.data && e.data.slide_index)));
    const row = await keryx.entities.LyricSync.create({ song_title: "S", slides: [{ text: "a" }, { text: "b" }], status: "active", timestamp: Date.now() });
    await keryx.entities.LyricSync.update(row.id, { slide_index: 1 });
    const page = await keryx.entities.LyricSync.filter({ status: "active" }, { sort: "-timestamp", limit: 1 });
    out.page = page.items.length === 1 && page.items[0].id === row.id;
    const latest = await keryx.entities.LyricSync.list("-timestamp", 1);
    out.latest = latest[0] && latest[0].slide_index;
    try { await keryx.entities.LyricSync.get("missing"); out.notFound = "no error"; } catch (e) { out.notFound = e.status; }
    await keryx.entities.LyricSync.delete(row.id);
    await new Promise((r) => setTimeout(r, 150));
    unsub();
    out.events = events;

    const me = await keryx.auth.me();
    await keryx.entities.User.update(me.id, { full_name: "Teste" });
    out.me = { name: (await keryx.auth.me()).full_name, color: me.primary_color, authed: await keryx.auth.isAuthenticated() };

    const file = new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" });
    const { file_url } = await keryx.integrations.Core.UploadFile({ file });
    out.uploadUrl = file_url;
    out.uploadFetch = (await fetch(file_url)).status;
    const media = await keryx.entities.Media.create({ title: "M", type: "image", file_url });
    const raw = await window.keryxDesktop.db.call("Media", "get", [media.id]);
    out.mediaStored = raw.data.file_url;
    out.mediaRead = media.file_url === file_url;

    try { await keryx.integrations.Core.InvokeLLM({ prompt: "x" }); out.llm = "no error"; } catch (e) { out.llm = e.status; }

    // Bible: two verses as an installed ACF, read the way the components do.
    await window.keryxDesktop.db.call("BibleVerse", "bulkCreate", [[
        { version: "ACF", book: "João", chapter: 3, verse: 16, text: "Porque Deus amou o mundo de tal maneira" },
        { version: "ACF", book: "João", chapter: 3, verse: 17, text: "Porque Deus enviou o seu Filho ao mundo" },
    ]]);
    const bibleText = await import("/src/lib/bibleText.js");
    const bibleBooks = await import("/src/lib/bibleBooks.js");
    const passage = await bibleText.getPassage("ACF", "João", 3, 16, 17);
    out.bible = {
        passage: passage.verses.map((v) => v.number).join(","),
        source: passage.source,
        preferred: await bibleText.preferredVersion("NVI"),
        search: (await bibleText.searchVerses("ENVIOU", "NVI", 5)).map((r) => r.version + " " + r.verse).join(","),
        parsed: bibleBooks.parseReference("jo 3:16").book,
    };
    try { await bibleText.getChapter("AA", "João", 3); out.bible.missing = "no error"; } catch (e) { out.bible.missing = e.status; }
    return out;
})()`;

// Outputs: pages open them with window.open; the main process places them.
const OPEN_OUTPUT = (path, name) => `(async () => {
    const w = window.open(location.origin + "${path}", "${name}", "width=1280,height=720");
    await new Promise((r) => setTimeout(r, 1500));
    return { opened: Boolean(w) && !w.closed };
})()`;
const PICK_PRIMARY = `(async () => {
    const res = await window.keryxDesktop.displays.list();
    const primary = res.data.displays.find((d) => d.primary);
    return { id: primary.id, label: primary.label, width: primary.width, height: primary.height, bounds: primary.bounds };
})()`;
const ASSIGN = (target) => `window.keryxDesktop.displays.set("/Projection", { target: ${JSON.stringify(target)} }).then((r) => Boolean(r.data))`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkOutputs(webContents, outputs, screen, { fullscreen }) {
    const result = {
        displays: screen.getAllDisplays().length,
        defaultPlacement: null,
        popupIgnored: null,
        fullscreen: "skipped (KERYX_SMOKE_FULLSCREEN=1 to run)",
        ok: true,
    };

    // Default placement with the displays this machine has: one display opens
    // a normal window, an external display takes the main projection.
    const listing = outputs.list();
    const planned = listing.outputs.find((o) => o.key === "/Projection").placement;
    const expectFullScreen = planned.mode === "fullscreen";
    const plannedBounds = expectFullScreen ? listing.displays.find((d) => d.id === planned.displayId).bounds : null;
    const first = await webContents.executeJavaScript(OPEN_OUTPUT("/Projection", "keryx_projection"), true);
    const tracked = outputs.trackedWindows().find((w) => w.key === "/Projection");
    result.defaultPlacement = {
        expectFullScreen,
        opened: first.opened,
        tracked: Boolean(tracked),
        fullScreen: tracked ? tracked.fullScreen : null,
        onPlannedDisplay: !expectFullScreen || Boolean(tracked && ["x", "y", "width", "height"].every((k) => tracked.bounds[k] === plannedBounds[k])),
    };
    outputs.close("/Projection");
    await sleep(300);

    // A window.open that is not an output must not be tracked or moved.
    await webContents.executeJavaScript(`window.open("about:blank", "_blank"); 1`, true);
    await sleep(300);
    result.popupIgnored = outputs.trackedWindows().length === 0;

    if (fullscreen) {
        const primary = await webContents.executeJavaScript(PICK_PRIMARY);
        await webContents.executeJavaScript(ASSIGN({ id: primary.id, label: primary.label, width: primary.width, height: primary.height }));
        const second = await webContents.executeJavaScript(OPEN_OUTPUT("/Projection", "keryx_projection"), true);
        const t = outputs.trackedWindows().find((w) => w.key === "/Projection");
        result.fullscreen = {
            opened: second.opened,
            fullScreen: t ? t.fullScreen : null,
            onPrimary: t ? t.bounds.x === primary.bounds.x && t.bounds.y === primary.bounds.y : null,
        };
        outputs.close("/Projection");
        await webContents.executeJavaScript(ASSIGN("auto"));
        await sleep(300);
    }

    for (const w of BrowserWindow.getAllWindows()) {
        if (w.webContents !== webContents && !w.isDestroyed()) w.close();
    }
    const d = result.defaultPlacement;
    result.ok = Boolean(d.opened && d.tracked && d.fullScreen === d.expectFullScreen && d.onPlannedDisplay && result.popupIgnored
        && (!fullscreen || (result.fullscreen.opened && result.fullscreen.fullScreen === true && result.fullscreen.onPrimary === true)));
    return result;
}

// Backups, logs and the Settings bridge, as the packaged app runs them.
async function checkSystem(webContents, { dataDir, system }) {
    const info = (await webContents.executeJavaScript(`window.keryxDesktop.system.call("info")`)).data;
    const made = (await webContents.executeJavaScript(`window.keryxDesktop.system.call("backupNow")`)).data;
    const fs = require("node:fs");
    const path = require("node:path");
    const logs = fs.existsSync(path.join(dataDir, "logs")) ? fs.readdirSync(path.join(dataDir, "logs")).length : 0;
    const result = {
        version: info.version,
        packaged: info.packaged,
        backupsAfterLaunch: info.backup.count,
        backupsAfterManual: made.backup.count,
        backupOpens: false,
        logs,
        update: info.update.status,
        ok: false,
    };
    try {
        const { DatabaseSync } = require("node:sqlite");
        const db = new DatabaseSync(path.join(made.backup.dir, made.backup.last.name), { readOnly: true });
        result.backupOpens = db.prepare("SELECT COUNT(*) AS n FROM profile").get().n === 1;
        db.close();
    } catch { /* stays false */ }
    result.ok = info.dataDir === dataDir && result.backupsAfterLaunch >= 1 && result.backupsAfterManual >= 1
        && result.backupOpens && logs >= 1 && Boolean(system.info);
    return result;
}

function expectAdapter(a) {
    return a.isDesktop === true
        && a.page === true
        && a.latest === 1
        && a.notFound === 404
        && a.events.join(",") === "create:0,update:1,delete:1"
        && a.me.name === "Teste" && a.me.color === "#7d8470" && a.me.authed === true
        && /^http:\/\/127\.0\.0\.1:\d+\/media\/[0-9a-f-]{36}\.png$/.test(a.uploadUrl)
        && a.uploadFetch === 200
        && /^keryx-media:\/\/[0-9a-f-]{36}\.png$/.test(a.mediaStored)
        && a.mediaRead === true
        && a.llm === 501
        && a.bible.passage === "16,17" && a.bible.source === "local" && a.bible.preferred === "ACF"
        && a.bible.search === "ACF 17" && a.bible.parsed === "João" && a.bible.missing === 404;
}

const VERBOSE = process.env.KERYX_SMOKE_VERBOSE === "1";
const step = (name) => { if (VERBOSE) console.log(`smoke: ${name}`); };

function runSmokeTest(win, { dev, outputs, screen, system, dataDir, importOutcome }) {
    const errors = [];
    const { webContents } = win;
    const finish = (ok, details) => {
        console.log(`SMOKE ${ok ? "OK" : "FAIL"} ${JSON.stringify({ ...details, errors })}`);
        app.exit(ok ? 0 : 1);
    };

    for (const name of ["did-start-loading", "did-stop-loading", "dom-ready", "did-finish-load", "did-navigate", "did-navigate-in-page", "unresponsive", "responsive", "render-process-gone"]) {
        webContents.on(name, (_e, ...rest) => step(`event ${name} ${name.startsWith("did-navigate") ? rest[0] : ""}`));
    }
    webContents.on("render-process-gone", (_e, details) => step(`render-process-gone ${JSON.stringify(details)}`));
    webContents.on("console-message", (event) => {
        if (event.level === "error") errors.push(String(event.message).slice(0, 200));
    });
    webContents.on("did-fail-load", (_e, code, desc, url) => finish(false, { load: { code, desc, url } }));

    const deadline = Date.now() + 20000;
    const poll = async () => {
        let rendered;
        try {
            step("polling render");
            rendered = await webContents.executeJavaScript(RENDERED);
        } catch { /* still loading */ }
        if (!rendered || !(rendered.rootChildren > 0 && rendered.text.trim())) {
            if (Date.now() > deadline) finish(false, { rendered });
            else setTimeout(poll, 400);
            return;
        }
        try {
            step("rendered; checking bridge");
            const bridge = await webContents.executeJavaScript(BRIDGE);
            const bridgeOk = rendered.desktop && rendered.supabaseRequests === 0 && bridge.created && bridge.listed === 1 && bridge.badStatus === 400
                && bridge.events.join(",") === "create,delete" && Array.isArray(bridge.slides);
            const adapter = dev ? await webContents.executeJavaScript(ADAPTER) : "skipped (dev mode only)";
            const adapterOk = !dev || expectAdapter(adapter);

            step("outputs ok; screenshot");
            if (process.env.KERYX_SCREENSHOT) {
                // KERYX_SCREENSHOT_CLICK: click the first button/tab/link with exactly this text.
                const click = process.env.KERYX_SCREENSHOT_CLICK;
                if (click) {
                    await webContents.executeJavaScript(`(() => {
                        const el = [...document.querySelectorAll("button,[role=tab],a")].find((n) => n.textContent.trim() === ${JSON.stringify(click)});
                        if (!el) return;
                        // Radix tabs switch on mousedown/focus, not on click.
                        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
                        el.focus();
                        el.click();
                    })()`);
                    await sleep(2500);
                }
                // KERYX_SCREENSHOT_TEXT: scroll to the first element containing this text.
                const text = process.env.KERYX_SCREENSHOT_TEXT;
                if (text) {
                    await webContents.executeJavaScript(`(() => {
                        const el = [...document.querySelectorAll("body *")].find((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes(${JSON.stringify(text)})));
                        if (el) el.scrollIntoView({ block: "center" });
                    })()`);
                    await sleep(500);
                }
                await sleep(1000); // let page transitions finish
                const image = await webContents.capturePage();
                fs.writeFileSync(process.env.KERYX_SCREENSHOT, image.toPNG());
            }
            step("bridge ok; checking outputs");
            const outputsResult = await checkOutputs(webContents, outputs, screen, { fullscreen: process.env.KERYX_SMOKE_FULLSCREEN === "1" });
            const systemResult = await checkSystem(webContents, { dataDir, system });
            finish(bridgeOk && adapterOk && outputsResult.ok && systemResult.ok && !importOutcome, { rendered, bridge, adapter, outputs: outputsResult, system: systemResult });
        } catch (err) {
            finish(false, { rendered, exception: String(err && err.message) });
        }
    };
    webContents.once("did-finish-load", poll);
}

module.exports = { runSmokeTest };
