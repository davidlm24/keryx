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

    // keryx.live through the projection service, as operator pages will use it.
    const { projection } = await import("/src/lib/projection.js");
    const heard = [];
    const offLive = keryx.live.subscribe((s) => heard.push(s.rev));
    await keryx.live.load();
    const shown = await projection.showLyrics({ title: "L", slides: [{ text: "a" }, { text: "b" }], style: { background_image: file_url } });
    await projection.next();
    await new Promise((r) => setTimeout(r, 150));
    offLive();
    out.live = {
        index: keryx.live.current().content.index,
        heard: heard.includes(shown.rev) && heard.includes(shown.rev + 1),
        rendered: shown.content.style.background_image === file_url,
        stored: (await window.keryxDesktop.live.get()).data.content.style.background_image,
        clock: Math.abs(keryx.live.now() - Date.now()) < 1000,
    };
    try { await projection.showMedia({ kind: "nope", url: "x" }); out.live.bad = "no error"; } catch (e) { out.live.bad = e.status; }
    await projection.clear();

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

// The live state (electron/live.cjs): the operator window changes it over
// IPC and every window hears it, outputs included.
const LIVE_LISTEN = `(() => {
    window.__keryxLiveSeen = [];
    window.keryxDesktop.live.onChange((s) => window.__keryxLiveSeen.push(s.rev + ":" + s.screen + ":" + (s.content ? s.content.index : "-")));
    return true;
})()`;
const LIVE_DRIVE = `(async () => {
    const live = window.keryxDesktop.live;
    const before = (await live.get()).data;
    const shown = (await live.call("content.show", { kind: "lyrics", title: "Smoke", slides: [{ text: "Primeira" }, { text: "Segunda" }] })).data;
    const moved = (await live.call("content.next", {})).data;
    const unchanged = (await live.call("content.next", {})).data;
    const bad = await live.call("content.explode", {});
    const black = (await live.call("screen.set", { mode: "black" })).data;
    await new Promise((r) => setTimeout(r, 300));
    return {
        startRev: before.rev,
        revs: [shown.rev, moved.rev, unchanged.rev, black.rev],
        slide: moved.content.slides[moved.content.index].text,
        serverNow: typeof moved.serverNow,
        badStatus: bad.error && bad.error.status,
        badMessage: bad.error && bad.error.message,
        seen: window.__keryxLiveSeen,
    };
})()`;

const windowFor = (path) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(path));
// The window showing this path, once it has one (dev mode compiles pages on first load).
const waitWindow = async (path, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const w = windowFor(path);
        if (w) return w;
        await sleep(200);
    }
    return undefined;
};

// win: a BrowserWindow or its webContents.
const bodyText = (win) => {
    const wc = win && (win.webContents || win);
    return wc ? wc.executeJavaScript("document.body ? document.body.innerText : ''").catch(() => "") : Promise.resolve("");
};

async function checkLive(webContents, { live }) {
    const result = { ok: false };
    await webContents.executeJavaScript(LIVE_LISTEN);
    const opened = await webContents.executeJavaScript(OPEN_OUTPUT("/StageView", "stageView"), true);
    const projector = await webContents.executeJavaScript(OPEN_OUTPUT("/Projection", "keryx_projection"), true);
    const output = windowFor("/StageView");
    const main = windowFor("/Projection");
    result.outputOpened = Boolean(opened.opened && output && projector.opened && main);
    if (output) await output.webContents.executeJavaScript(LIVE_LISTEN);

    const drive = await webContents.executeJavaScript(LIVE_DRIVE);
    // What the windows show after show + next + black (LIVE_DRIVE ends black).
    result.stageText = (await bodyText(output)).includes("Segunda");
    result.projectorBlack = !(await bodyText(main)).includes("Segunda");
    live.call("screen.set", { mode: "show" });
    await sleep(500);
    result.projectorText = (await bodyText(main)).includes("Segunda");
    live.call("screen.set", { mode: "black" });
    const r0 = drive.startRev;
    const expected = [`${r0 + 1}:show:0`, `${r0 + 2}:show:1`, `${r0 + 3}:black:1`];
    result.drive = drive;
    result.outputSeen = output ? await output.webContents.executeJavaScript("window.__keryxLiveSeen") : null;
    result.mainScreen = live.get().screen;
    if (output) output.close();
    if (main) main.close();
    live.call("clear");
    live.call("screen.set", { mode: "show" });

    result.ok = result.outputOpened
        && drive.revs.join(",") === [r0 + 1, r0 + 2, r0 + 2, r0 + 3].join(",")
        && drive.slide === "Segunda" && drive.serverNow === "number"
        && drive.badStatus === 400 && /Operação desconhecida/.test(drive.badMessage)
        && drive.seen.join(",") === expected.join(",")
        && Array.isArray(result.outputSeen) && result.outputSeen.slice(0, 3).join(",") === expected.join(",")
        && result.mainScreen === "black"
        && result.stageText && result.projectorBlack && result.projectorText;
    return result;
}

// The operator flow through the real Músicas page: Projetar on a song puts it
// on the projector, an arrow key moves every screen, Parar Projeção clears it.
const CLICK_TEXT = (selector, text) => `(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
})()`;

async function checkOperatorFlow(webContents, { live }) {
    const result = { ok: false };
    const waitText = async (win, needle, present = true, ms = 8000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if ((await bodyText(win)).includes(needle) === present) return true;
            await sleep(250);
        }
        return false;
    };
    const song = (await webContents.executeJavaScript(`window.keryxDesktop.db.call("Song", "create", [{
        title: "Hino da fumaça", artist: "Coral do Teste", lyrics: "Primeira estrofe do hino\\n\\nSegunda estrofe do hino",
        slides: [{ text: "Primeira estrofe do hino" }, { text: "Segunda estrofe do hino" }],
    }])`)).data;
    try {
        webContents.reload();
        await sleep(500);
        result.listed = await waitText(webContents, "Coral do Teste");
        await webContents.executeJavaScript(CLICK_TEXT("button", "Coral do Teste"));
        await sleep(500);
        result.clickedPlay = await webContents.executeJavaScript(CLICK_TEXT("button", "Projetar"));
        await sleep(1500);
        const main = windowFor("/Projection");
        result.projectorOpened = Boolean(main);
        result.projected = await waitText(main, "Primeira estrofe do hino");
        result.sessionStarted = Boolean(live.get().session);
        result.panel = (await bodyText(webContents)).includes("1 / 2");

        await webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })); true`);
        result.advanced = await waitText(main, "Segunda estrofe do hino");
        result.liveIndex = live.get().content && live.get().content.index;

        // KERYX_SMOKE_SHOTS=<folder>: what the projector, the stage and the operator page look like now.
        const shots = process.env.KERYX_SMOKE_SHOTS;
        if (shots) {
            await webContents.executeJavaScript(CLICK_TEXT("button", "Palco"));
            await sleep(2000);
            fs.mkdirSync(shots, { recursive: true });
            for (const [name, win] of [["projetor", main], ["palco", windowFor("/StageView")], ["operador", { webContents }]]) {
                if (win) fs.writeFileSync(require("node:path").join(shots, `${name}.png`), (await win.webContents.capturePage()).toPNG());
            }
            const stageWin = windowFor("/StageView");
            if (stageWin) stageWin.close();
        }

        result.clickedStop = await webContents.executeJavaScript(CLICK_TEXT("button", "Parar Projeção"));
        result.cleared = await waitText(main, "Segunda estrofe do hino", false);
        result.liveCleared = !live.get().content && !live.get().session;
        if (main) main.close();
    } finally {
        await webContents.executeJavaScript(`window.keryxDesktop.db.call("Song", "delete", ["${song && song.id}"])`);
    }
    result.ok = result.listed && result.clickedPlay && result.projectorOpened && result.projected && result.sessionStarted
        && result.panel && result.advanced && result.liveIndex === 1 && result.clickedStop && result.cleared && result.liveCleared;
    return result;
}

// Video and media through the live state: a short real video recorded in
// the page, a video screen that opens after it started (it must join), pause
// and play from the operator, and a playlist the projector moves on by itself.
const RECORD_VIDEO = `(async () => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 36;
    const g = c.getContext("2d");
    const rec = new MediaRecorder(c.captureStream(15), { mimeType: "video/webm" });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    let i = 0;
    const paint = setInterval(() => { g.fillStyle = i++ % 2 ? "#c33" : "#33c"; g.fillRect(0, 0, 64, 36); }, 60);
    // Long enough that the checks below finish before it ends, even on a slow run.
    rec.start(250);
    await new Promise((r) => setTimeout(r, 8000));
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.stop();
    await stopped;
    clearInterval(paint);
    const res = await window.keryxDesktop.media.importFile(new File(chunks, "smoke.webm", { type: "video/webm" }));
    return res.data && res.data.fileName;
})()`;
const VIDEO_STATE = `(() => {
    const v = document.querySelector("video");
    return v ? { src: v.src, paused: v.paused, ended: v.ended, time: v.currentTime, duration: v.duration, ready: v.readyState, error: v.error && v.error.code } : null;
})()`;

async function checkVideo(webContents, { live }) {
    const result = { ok: false };
    const stateOf = (win) => (win ? win.webContents.executeJavaScript(VIDEO_STATE).catch(() => null) : null);
    const waitState = async (win, test, ms = 6000) => {
        const end = Date.now() + ms;
        let last = null;
        while (Date.now() < end) {
            last = await stateOf(win);
            if (last && test(last)) return true;
            await sleep(250);
        }
        result.lastState = last;
        return false;
    };

    const fileName = await webContents.executeJavaScript(RECORD_VIDEO);
    result.recorded = Boolean(fileName);
    result.fileName = fileName;
    live.call("video.show", { kind: "video", url: `keryx-media://${fileName}`, title: "Vídeo de teste" });
    await sleep(500);
    // Opened after the video started: it joins (the old VideoSync screens missed it).
    await webContents.executeJavaScript(OPEN_OUTPUT("/VideoProjection", "videoProjection"), true);
    const screenWin = windowFor("/VideoProjection");
    // It lands where the shared playback is (however long it took to load)...
    const sharedPosition = () => {
        const pb = live.get().video.playback;
        return pb.position + (pb.paused ? 0 : (Date.now() - pb.at) / 1000);
    };
    result.lateJoin = await waitState(screenWin, (v) => v.src.endsWith(`/media/${fileName}`) && v.ready >= 1
        && Math.abs(v.time - Math.min(sharedPosition(), v.duration || Infinity)) < 2);
    // ...then plays from the start when the operator seeks there.
    live.call("transport", { action: "seek", time: 0 });
    result.playing = await waitState(screenWin, (v) => !v.paused && v.time < 4);
    result.title = (await bodyText(screenWin)).includes("Vídeo de teste");
    live.call("transport", { action: "pause" });
    result.paused = await waitState(screenWin, (v) => v.paused);
    live.call("transport", { action: "play" });
    result.resumed = await waitState(screenWin, (v) => !v.paused);
    live.call("video.clear");
    result.cleared = await (async () => {
        const end = Date.now() + 5000;
        while (Date.now() < end) {
            if ((await bodyText(screenWin)).includes("Dispositivo de Vídeo")) return true;
            await sleep(250);
        }
        return false;
    })();
    if (screenWin) screenWin.close();

    // A playlist of two images on the projector: it reports the end of each.
    const img = (name) => ({ kind: "image", url: `keryx-media://bundled/backgrounds/${name}`, duration: 1 });
    live.call("media.playlist", { items: [img("1418065460487-3e41a6c84dc5.webp"), img("1419242902214-272b3f66ee7a.webp")] });
    await webContents.executeJavaScript(OPEN_OUTPUT("/Projection", "keryx_projection"), true);
    const projector = windowFor("/Projection");
    await sleep(3000);
    const media = live.get().media;
    result.playlistAdvanced = Boolean(media && media.shownAt > Date.now() - 2500);
    result.projectorImage = projector ? await projector.webContents.executeJavaScript(`Boolean(document.querySelector("img[src*='/media/bundled/backgrounds/']"))`) : false;
    live.call("clear");
    if (projector) projector.close();

    result.ok = result.recorded && result.lateJoin && result.playing && result.title && result.paused && result.resumed && result.cleared
        && result.playlistAdvanced && result.projectorImage;
    return result;
}

// The other layers, driven straight through the live state: tools,
// communication (and a sequence that moves on by itself), alert, overlays,
// logo, Escola bíblica; outputs the main process opens, and "Abrir ao iniciar".
async function checkLayers(webContents, { live, outputs }) {
    const result = { ok: false };
    // KERYX_SMOKE_SHOTS=<folder>: screenshots of the projector at each layer.
    const shot = async (win, name) => {
        const dir = process.env.KERYX_SMOKE_SHOTS;
        if (!dir || !win) return;
        await sleep(800);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(require("node:path").join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    };
    const waitText = async (win, needle, present = true, ms = 6000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if ((await bodyText(win)).includes(needle) === present) return true;
            await sleep(250);
        }
        return false;
    };
    // Windows the earlier checks closed may still be on their way out.
    for (const path of ["/Projection", "/CommunicationProjection", "/BibleMaterialProjection", "/StageView"]) {
        const end = Date.now() + 5000;
        while (windowFor(path) && Date.now() < end) await sleep(200);
    }
    // Opened by the main process this time (the earlier checks used window.open).
    outputs.open("/Projection");
    const main = await waitWindow("/Projection");
    result.projectorErrors = [];
    if (main) main.webContents.on("console-message", (e) => { if (e.level === "error") result.projectorErrors.push(String(e.message).slice(0, 300)); });
    outputs.open("/CommunicationProjection");
    outputs.open("/BibleMaterialProjection");
    const comm = await waitWindow("/CommunicationProjection");
    const school = await waitWindow("/BibleMaterialProjection");
    result.mainOpened = Boolean(main && comm && school);
    try {
        live.call("tool.show", { mode: "freetext", text: "Texto livre de teste" });
        result.freetext = await waitText(main, "Texto livre de teste");
        live.call("tool.show", { mode: "timer", durationMs: 125000 });
        result.timer = await waitText(main, "02:0");
        await shot(main, "temporizador");

        live.call("communication.show", { item: { type: "announcement", text: "Aviso de teste", duration: 30, text_color: "#ffffff", font_size: "large" } });
        result.communication = await waitText(main, "Aviso de teste") && await waitText(comm, "Aviso de teste");
        await shot(main, "comunicacao");
        live.call("communication.show", { playlist: [
            { type: "countdown", text: "Primeiro aviso", duration: 1, text_color: "#ffffff", font_size: "large" },
            { type: "announcement", text: "Segundo aviso", duration: 30, text_color: "#ffffff", font_size: "large" },
        ] });
        result.sequence = await waitText(main, "Segundo aviso");
        result.sequenceIndex = live.get().communication && live.get().communication.playlistIndex;

        live.call("alert.show", { message: "Alerta de teste", type: "message" });
        result.alert = await waitText(main, "Alerta de teste");
        live.call("alert.clear");

        live.call("content.show", { title: "Camadas", slides: [{ text: "Letra sob a camada" }] });
        live.call("overlays.set", { overlays: [{ id: "o1", type: "text", content: "Sobreposição de teste", x: 5, y: 5, width: 30 }] });
        result.overlay = await waitText(main, "Sobreposição de teste") && await waitText(main, "Letra sob a camada");
        await shot(main, "sobreposicao");
        live.call("screen.set", { mode: "logo" });
        result.logoCovers = await waitText(main, "Letra sob a camada", false) && !(await bodyText(main)).includes("Sobreposição de teste");
        live.call("screen.set", { mode: "show" });
        live.call("overlays.set", { overlays: [] });

        live.call("school.show", { content_type: "quiz", title: "Lição", quiz_questions: [{ question: "Quem construiu a arca?", options: ["Noé", "Moisés"], correct: 0 }] });
        result.school = await waitText(school, "Quem construiu a arca?");
        live.call("school.update", { quiz_reveal: true });
        await sleep(300);

        // Abrir ao iniciar: what the main process opens when KERYX starts.
        outputs.setAssignment("/StageView", { openAtLaunch: true });
        const launched = outputs.openAtLaunch().join(",");
        result.openAtLaunch = launched === "/StageView" && Boolean(await waitWindow("/StageView"));
        result.keptTarget = outputs.list().outputs.find((o) => o.key === "/StageView").assignment.target === "auto";
        outputs.setAssignment("/StageView", { openAtLaunch: false });
    } finally {
        live.call("clear");
        live.call("school.clear");
        live.call("alert.clear");
        live.call("overlays.set", { overlays: [] });
        live.call("screen.set", { mode: "show" });
        for (const path of ["/Projection", "/CommunicationProjection", "/BibleMaterialProjection", "/StageView"]) {
            const w = windowFor(path);
            if (w) w.close();
        }
    }
    result.ok = result.mainOpened && result.freetext && result.timer && result.communication && result.sequence && result.sequenceIndex === 1
        && result.alert && result.overlay && result.logoCovers && result.school && result.openAtLaunch && result.keptTarget;
    return result;
}

// Backups, logs and the Settings bridge, as the packaged app runs them.
// A tablet on the network: a plain browser window (no preload, no desktop
// bridge) opening screen pages from the LAN server, fed by store changes.
async function checkNetwork({ network, live, videoFile }) {
    const result = { started: false, lyrics: false, stage: false, live: null, operatorPageBlocked: false, pinForm: false, tabletErrors: [], ok: false };
    await network.ops.setPin(null, ""); // start open, whatever the data folder had
    await network.ops.setEnabled(null, true);
    const info = network.info();
    result.started = info.running;
    if (!info.running) return { ...result, error: info.error };
    const base = `http://127.0.0.1:${info.port}`;

    const tablet = () => {
        const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, partition: `keryx-smoke-lan-${Date.now()}` } });
        win.webContents.on("console-message", (event) => {
            if (event.level === "error") result.tabletErrors.push(String(event.message).slice(0, 160));
        });
        return win;
    };
    const textOf = (win) => win.webContents.executeJavaScript("document.body ? document.body.innerText : ''");
    const waitFor = async (win, needle, ms = 8000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if ((await textOf(win).catch(() => "")).includes(needle)) return true;
            await sleep(250);
        }
        return false;
    };

    const lyrics = tablet();
    const stage = tablet();
    try {
        await lyrics.loadURL(`${base}/LyricProjection`);
        await stage.loadURL(`${base}/StageView`);
        await sleep(1500);
        result.isNetworkScreen = await lyrics.webContents.executeJavaScript("window.keryxLan === true && !window.keryxDesktop");

        // The operator projects after the screens are open: only the event stream can deliver it.
        live.call("content.show", {
            kind: "lyrics",
            title: "Hino de teste",
            slides: [{ text: "Primeira linha da letra" }, { text: "Segunda linha da letra" }],
            stage: { song_key: "Sol maior", chords: "G D Em C" },
        });
        result.lyrics = await waitFor(lyrics, "Primeira linha da letra");
        live.call("content.goTo", { index: 1 });
        result.stage = await waitFor(stage, "Segunda linha da letra");
        result.stageChords = (await textOf(stage)).includes("Sol maior");
        result.lyricsAdvanced = await waitFor(lyrics, "Segunda linha da letra");
        const projectorTablet = tablet();
        await projectorTablet.loadURL(`${base}/Projection`);
        result.projectorScreen = await waitFor(projectorTablet, "Segunda linha da letra");
        await projectorTablet.loadURL(`${base}/PastorView`);
        result.pastorScreen = await waitFor(projectorTablet, "Segunda linha da letra");
        projectorTablet.close();
        live.call("screen.set", { mode: "black" });
        await sleep(500);
        result.lyricsBlack = !(await textOf(lyrics)).includes("Segunda linha da letra");
        result.stageDuringBlack = (await textOf(stage)).includes("Segunda linha da letra");
        live.call("screen.set", { mode: "show" });

        // A tablet's video screen: media from the KERYX computer, on its network address.
        live.call("video.show", { kind: "video", url: `keryx-media://${videoFile}`, title: "Na rede" });
        const videoTablet = tablet();
        await videoTablet.loadURL(`${base}/VideoProjection`);
        await sleep(1500);
        result.videoSrc = await videoTablet.webContents.executeJavaScript(`(document.querySelector("video") || {}).src || ""`);
        videoTablet.close();
        live.call("video.clear");

        // The live state reaches a tablet as a read and as "live" events, and the tablet can't change it.
        await lyrics.webContents.executeJavaScript(`(() => {
            window.__live = [];
            new EventSource("/api/events").addEventListener("live", (e) => {
                const s = JSON.parse(e.data);
                window.__live.push(s.content ? s.content.slides[0].text : "(vazio)");
            });
            return new Promise((r) => setTimeout(r, 500));
        })()`);
        live.call("content.show", { title: "Na rede", slides: [{ text: "Texto ao vivo" }], style: { background_image: "keryx-media://fundo.png" } });
        await sleep(500);
        result.live = await lyrics.webContents.executeJavaScript(`(async () => {
            const read = await (await fetch("/api/live")).json();
            const write = await fetch("/api/live", { method: "POST", headers: { "X-Keryx": "1" }, body: "{}" });
            return { events: window.__live, read: read.data.content.slides[0].text, media: read.data.content.style.background_image, writeStatus: write.status };
        })()`);
        live.call("clear");

        await lyrics.loadURL(`${base}/Settings`);
        result.operatorPageBlocked = (await textOf(lyrics)).includes("computador do operador");

        await network.ops.setPin(null, "2468");
        const locked = tablet();
        await locked.loadURL(`${base}/StageView`);
        result.pinForm = (await textOf(locked)).includes("PIN") && locked.webContents.getURL().includes("/lan/pin");
        locked.close();
        await network.ops.setPin(null, "");
    } finally {
        lyrics.close();
        stage.close();
        await network.ops.setEnabled(null, false);
    }
    const l = result.live;
    result.ok = result.started && result.isNetworkScreen && result.lyrics && result.stage && result.lyricsAdvanced
        && result.stageChords && result.lyricsBlack && result.stageDuringBlack
        && result.videoSrc === `${base}/media/${videoFile}`
        && result.projectorScreen && result.pastorScreen
        && Boolean(l && l.events.includes("Texto ao vivo") && l.read === "Texto ao vivo" && l.media === "keryx-media://fundo.png" && l.writeStatus === 405)
        && result.operatorPageBlocked && result.pinForm && result.tabletErrors.length === 0;
    return result;
}

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
        && a.live.index === 1 && a.live.heard === true && a.live.rendered && /^keryx-media:\/\/[0-9a-f-]{36}\.png$/.test(a.live.stored)
        && a.live.clock && a.live.bad === 400
        && a.bible.passage === "16,17" && a.bible.source === "local" && a.bible.preferred === "ACF"
        && a.bible.search === "ACF 17" && a.bible.parsed === "João" && a.bible.missing === 404;
}

const VERBOSE = process.env.KERYX_SMOKE_VERBOSE === "1";
const step = (name) => { if (VERBOSE) console.log(`smoke: ${name}`); };

function runSmokeTest(win, { dev, outputs, screen, system, network, live, dataDir, importOutcome }) {
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
            const liveResult = await checkLive(webContents, { live });
            const operatorResult = await checkOperatorFlow(webContents, { live });
            const videoResult = await checkVideo(webContents, { live });
            const layersResult = await checkLayers(webContents, { live, outputs });
            // The LAN server serves the built app (dist/), so this runs in built mode only.
            const networkResult = dev ? "skipped (built mode only)" : await checkNetwork({ network, live, videoFile: videoResult.fileName });
            finish(bridgeOk && adapterOk && outputsResult.ok && systemResult.ok && liveResult.ok && operatorResult.ok && videoResult.ok && layersResult.ok && !importOutcome && (dev || networkResult.ok),
                { rendered, bridge, adapter, outputs: outputsResult, system: systemResult, live: liveResult, operator: operatorResult, video: videoResult, layers: layersResult, network: networkResult });
        } catch (err) {
            finish(false, { rendered, exception: String(err && (err.stack || err.message)).slice(0, 800) });
        }
    };
    webContents.once("did-finish-load", poll);
}

module.exports = { runSmokeTest };
