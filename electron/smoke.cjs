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
    await new Promise((r) => setTimeout(r, 15000));
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.stop();
    await stopped;
    clearInterval(paint);
    const res = await window.keryxDesktop.media.importFile(new File(chunks, "smoke.webm", { type: "video/webm" }));
    return res.data && res.data.fileName;
})()`;
// A 20-second stereo 440 Hz tone at -6 dBFS as a WAV, imported into the media library.
const MAKE_TONE = `(async () => {
    const rate = 22050, seconds = 20, n = rate * seconds;
    const buf = new ArrayBuffer(44 + n * 4);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { const x = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 16384); v.setInt16(44 + i * 4, x, true); v.setInt16(46 + i * 4, x, true); }
    const res = await window.keryxDesktop.media.importFile(new File([buf], "tom.wav", { type: "audio/wav" }));
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
    // Pause -> seek -> play twice over: the picture must keep moving (the
    // frozen-video regression: an element that stays paused after a seek).
    result.continuity = true;
    // Diagnostics: record every play() rejection in the screen window.
    if (screenWin) await screenWin.webContents.executeJavaScript(`(() => {
        if (window.__playProbe) return true;
        window.__playProbe = [];
        const orig = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function (...args) {
            const p = orig.apply(this, args);
            if (p && p.catch) p.catch((err) => window.__playProbe.push(String(err && err.name) + ": " + String(err && err.message).slice(0, 120)));
            return p;
        };
        return true;
    })()`).catch(() => {});
    for (let round = 0; round < 2 && result.continuity; round++) {
        live.call("transport", { action: "pause" });
        await waitState(screenWin, (v) => v.paused);
        live.call("transport", { action: "seek", time: 1 });
        live.call("transport", { action: "play" });
        const moving = await waitState(screenWin, (v) => !v.paused && v.time >= 1, 6000);
        const t1 = (await stateOf(screenWin))?.time ?? 0;
        await sleep(1500);
        const after = await stateOf(screenWin);
        result.continuity = moving && Boolean(after) && after.time - t1 >= 1;
        if (!result.continuity) {
            result.continuityState = { round, t1, after };
            result.playErrs = screenWin ? await screenWin.webContents.executeJavaScript("window.__playProbe").catch(() => null) : null;
            result.shared = (() => { const v = live.get().video; return v && { paused: v.playback.paused, position: v.playback.position, at: v.playback.at }; })();
        }
    }
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

    result.ok = result.recorded && result.lateJoin && result.playing && result.title && result.paused && result.resumed && result.continuity && result.cleared
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
    let main = await waitWindow("/Projection");
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

// The console, driven with real input (webContents.sendInputEvent: focus
// moves as it would under a mouse and a keyboard). The projector opens
// without taking the keyboard; the console is one screen, always live; a
// mouse click on a control leaves the keys to the console (Enter sends, a
// double click sends at once, arrows move); a control focused with Tab keeps
// its own Enter; Esc ends at once; Ensaio never touches the air; Verificar
// opens from the Saídas popover; the Bible quick jump reads "jo 3 16". The
// projector is opened by the main process, as "Abrir ao iniciar" would.
async function checkConsole(webContents, { live, outputs }) {
    const { BrowserWindow } = require("electron");
    const result = { ok: false };
    const waitText = async (win, needle, present = true, ms = 8000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if ((await bodyText(win)).includes(needle) === present) return true;
            await sleep(250);
        }
        return false;
    };
    const waitFor = async (test, ms = 5000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (await test()) return true;
            await sleep(150);
        }
        return false;
    };
    const js = (code) => webContents.executeJavaScript(code).catch((err) => { throw new Error(`${err.message} ← ${String(code).replace(/s+/g, " ").slice(0, 160)}`); });
    // Real key presses. Printable keys also send the "char" event that types.
    const KEYCODE = { ArrowRight: "Right", ArrowLeft: "Left", ArrowUp: "Up", ArrowDown: "Down", " ": "Space" };
    const press = async (k, modifiers = []) => {
        const keyCode = KEYCODE[k] || k;
        webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
        if (k.length === 1 && !modifiers.includes("control")) webContents.sendInputEvent({ type: "char", keyCode: k, modifiers });
        webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
        await sleep(120);
    };
    const type = async (text) => { for (const ch of text) await press(ch); };
    // A real mouse click in the middle of the first element matching the text.
    const click = async (selector, text = "") => {
        const at = await js(`(() => {
            const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.includes(${JSON.stringify(text)}) || (n.getAttribute("aria-label") || "").includes(${JSON.stringify(text)}));
            if (!el) return null;
            el.scrollIntoView({ block: "nearest" });
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`);
        if (!at) return false;
        webContents.sendInputEvent({ type: "mouseMove", x: at.x, y: at.y });
        webContents.sendInputEvent({ type: "mouseDown", x: at.x, y: at.y, button: "left", clickCount: 1 });
        webContents.sendInputEvent({ type: "mouseUp", x: at.x, y: at.y, button: "left", clickCount: 1 });
        await sleep(250);
        return true;
    };
    const dblclick = async (selector, text = "") => {
        const at = await js(`(() => {
            const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.includes(${JSON.stringify(text)}));
            if (!el) return null;
            el.scrollIntoView({ block: "nearest" });
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`);
        if (!at) return false;
        webContents.sendInputEvent({ type: "mouseMove", x: at.x, y: at.y });
        for (const clickCount of [1, 2]) {
            webContents.sendInputEvent({ type: "mouseDown", x: at.x, y: at.y, button: "left", clickCount });
            webContents.sendInputEvent({ type: "mouseUp", x: at.x, y: at.y, button: "left", clickCount });
            await sleep(60);
        }
        await sleep(250);
        return true;
    };
    const active = () => js("(() => { const a = document.activeElement; return a ? a.tagName + (a.getAttribute('role') ? '[' + a.getAttribute('role') + ']' : '') : null; })()");
    // The top bar never wraps or overflows: one line, everything inside it.
    const barFits = () => js(`(() => {
        const bar = document.querySelector(".topbar");
        if (!bar) return false;
        const r = bar.getBoundingClientRect();
        const kids = [...bar.querySelectorAll("button, .kx-field, .kx-seg, .tb-clock")].filter((n) => n.offsetParent);
        return bar.scrollWidth <= bar.clientWidth + 1 && kids.every((n) => { const k = n.getBoundingClientRect(); return k.height <= r.height && k.right <= r.right + 1 && k.top >= r.top - 1; });
    })()`);
    const shot = async (suffix) => {
        if (!process.env.KERYX_CONSOLE_SHOT) return null;
        try {
            await sleep(700);
            const file = process.env.KERYX_CONSOLE_SHOT.replace(/\.png$/i, `${suffix ? `-${suffix}` : ""}.png`);
            fs.writeFileSync(file, (await webContents.capturePage()).toPNG());
            return true;
        } catch (err) {
            return String(err && err.message);
        }
    };

    let tone = null;
    let svc = null;
    let edSong = null;
    // João 3:14-18 (placeholder text): the Bible environment reads the local
    // database first, so the verse flow is testable without internet.
    const VERSES = [14, 15, 16, 17, 18];
    await js(`window.keryxDesktop.db.call("BibleVerse", "bulkCreate", [${JSON.stringify(VERSES.map((v) => ({ id: `smoke-jo3-${v}`, version: "NVI", testament: "Novo", book: "João", chapter: 3, verse: v, text: `Texto do versículo ${v} para o teste` })))}])`);
    const song = (await js(`window.keryxDesktop.db.call("Song", "create", [{
        title: "Canto do console", artist: "Coral do Teste", lyrics: "Primeiro slide do console\\n\\nSegundo slide do console",
        slides: [{ text: "Primeiro slide do console" }, { text: "Segundo slide do console" }],
    }])`)).data;
    // The projector covers the operator window otherwise; a window in the
    // background also stalls page transitions (animation frames).
    const operatorWin = BrowserWindow.fromWebContents(webContents);
    const size = operatorWin && operatorWin.getContentSize();
    if (operatorWin) { operatorWin.show(); operatorWin.focus(); }
    await sleep(300);
    outputs.open("/Projection");
    let main = await waitWindow("/Projection");
    await sleep(1500);
    // Opening the projector must not take the keyboard from the operator.
    result.focusKept = !operatorWin || BrowserWindow.getFocusedWindow() === operatorWin;
    if (operatorWin) { operatorWin.show(); operatorWin.focus(); }
    try {
        // The app opens on the console now (/ redirects there): leave it and
        // come back, so this check starts from a freshly mounted console.
        await js(`history.pushState({}, "", "/Analytics"); window.dispatchEvent(new PopStateEvent("popstate")); true`);
        await sleep(600);
        await js(`history.pushState({}, "", "/Console"); window.dispatchEvent(new PopStateEvent("popstate")); true`);
        // Section captions are uppercase on screen (CSS), so innerText is too.
        // The console opens live, one screen, with the full module layout.
        result.opened = await waitText(webContents, "PROGRAMA · NADA", true, 15000);
        result.listed = await waitText(webContents, "Canto do console", true, 15000);
        result.fullConsole = await js("Boolean(document.querySelector('.console .main .kx-split')) && !document.querySelector('.topbar .kx-seg + .kx-seg')");

        // Click a top-bar tab (a control that used to keep the keys), then a song: Enter sends.
        await click(".envtabs button", "KERYX");
        await click(".kx-row", "Canto do console");
        result.prepared = await waitText(webContents, "PRÉVIA · CANTO DO CONSOLE");
        result.airUntouched = !live.get().content;
        result.clickLeftNoFocus = (await active()) === "BODY";
        // A control focused from the keyboard keeps its own Enter.
        result.tabFocused = await js(`(() => { const t = document.querySelector(".console [role='tab']"); if (!t) return false; t.focus(); return document.activeElement === t; })()`);
        await press("Enter");
        await sleep(300);
        result.focusedEnterKeptAir = !live.get().content;
        await js("document.activeElement && document.activeElement.blur(); true");
        if (!(await js("document.body.innerText.includes('PRÉVIA · CANTO DO CONSOLE')"))) await click(".kx-row", "Canto do console");
        await press("Enter");
        result.sent = await waitFor(() => live.get().content && live.get().content.title === "Canto do console");
        result.projected = Boolean(main) && await waitText(main, "Primeiro slide do console");
        // Click a tab again, then the arrow: the slide moves on the projector.
        await click(".envtabs button", "KERYX");
        await press("ArrowRight");
        result.advanced = Boolean(main) && await waitText(main, "Segundo slide do console");

        // The top bar at the common operator widths: one line, nothing cut off.
        result.bar = {};
        for (const w of [1248, 1366, 1920]) {
            if (operatorWin) operatorWin.setContentSize(w, 820);
            await sleep(500);
            result.bar[w] = await barFits();
            result.cols = result.cols || {};
            result.cols[w] = await js(`(() => {
                const cols = [...document.querySelectorAll(".console .main > .col")].map((n) => n.getBoundingClientRect());
                const inside = cols.every((r) => r.left >= -1 && r.right <= innerWidth + 1 && r.width > 0);
                const apart = cols.every((r, i) => i === 0 || r.left >= cols[i - 1].right - 1);
                return inside && apart;
            })()`);
            result[`shot${w}`] = await shot(String(w));
        }
        if (operatorWin && size) operatorWin.setContentSize(size[0], size[1]);
        await sleep(300);
        result.barFits = Object.values(result.bar).every(Boolean);
        for (const w of [1460]) {
            if (operatorWin) operatorWin.setContentSize(w, 820);
            await sleep(500);
            result.cols[w] = await js(`(() => {
                const cols = [...document.querySelectorAll(".console .main > .col")].map((n) => n.getBoundingClientRect());
                return cols.every((r, i) => r.left >= -1 && r.right <= innerWidth + 1 && (i === 0 || r.left >= cols[i - 1].right - 1));
            })()`);
        }
        if (operatorWin && size) operatorWin.setContentSize(size[0], size[1]);
        await sleep(300);
        result.colsFit = Object.values(result.cols).every(Boolean);
        result.noGoldRing = await js(`(() => {
            const input = document.querySelector(".console .searchrow .kx-field input");
            if (!input) return "sem campo";
            input.focus();
            const field = input.closest(".kx-field");
            const ok = getComputedStyle(field).outlineStyle === "none" && getComputedStyle(input).outlineStyle === "none";
            input.blur();
            return ok;
        })()`);

        // Esc: off the air at once, with a way back.
        await press("Escape");
        result.escEnded = await waitFor(() => !live.get().content);
        result.escToast = await waitText(webContents, "Voltar ao anterior desfaz");

        // One click prepares; a double click sends straight to air (Holyrics).
        await dblclick(".kx-row", "Canto do console");
        result.dblSent = await waitFor(() => live.get().content && live.get().content.title === "Canto do console");

        // Sending live reopens a closed projector, without taking the keyboard.
        outputs.close("/Projection");
        await waitFor(() => !windowFor("/Projection"), 5000);
        await sleep(3600); // the console's outputs poll runs every 3 s
        await press("Escape");
        await waitFor(() => !live.get().content);
        await dblclick(".kx-row", "Canto do console");
        main = await waitWindow("/Projection", 10000);
        result.autoOpened = Boolean(main);
        await sleep(1500);
        result.autoFocusKept = !operatorWin || BrowserWindow.getFocusedWindow() === operatorWin;
        if (operatorWin) { operatorWin.show(); operatorWin.focus(); }
        result.projected2 = Boolean(main) && await waitText(main, "Primeiro slide do console");

        // Verificar is a panel on demand now: Saídas -> "Verificar tudo…".
        // Esc closes the overlay and leaves the projection alone.
        await click(".kx-status", "");
        result.outsPopover = await waitText(webContents, "Verificar tudo…");
        await click(".kx-pop button", "Verificar tudo");
        result.verify = await waitText(webContents, "SAÍDAS") && await waitText(webContents, "BÍBLIA") && await waitText(webContents, "Fechar");
        result.verifyProjector = (await bodyText(webContents)).includes("Projeção principal");
        await press("Escape");
        result.verifyClosed = await waitFor(() => js("!document.querySelector('.verif-overlay')")) && Boolean(live.get().content);

        // Tela ociosa: Preto leaves the projector clean after Encerrar.
        await click(".kx-status", "");
        await click(".kx-pop .kx-seg button", "Preto");
        result.idleSet = await waitFor(() => live.get().idle === "black");
        await press("Escape"); // closes the popover
        await press("Escape"); // ends the projection
        await waitFor(() => !live.get().content);
        result.idleBlack = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript("Boolean(document.querySelector('.ks-black')) && !document.querySelector('.ks-idle img')").catch(() => false));
        await click(".kx-status", "");
        await click(".kx-pop .kx-seg button", "Logo da igreja");
        await waitFor(() => live.get().idle === "logo");
        await press("Escape");

        // The song on air again, then Ensaio.
        await click(".kx-row", "Canto do console");
        await press("Enter");
        result.resent = await waitFor(() => live.get().content && live.get().content.title === "Canto do console");
        await click(".kx-seg-mode button", "Ensaio");
        result.rehearsing = await waitText(webContents, "MODO ENSAIO");
        // In Ensaio a slide click prepares, "Mostrar no ensaio" shows it in the
        // rehearsal copy only: the screens stay on slide 1.
        await click(".kx-slide", "Segundo slide do console");
        result.rehearsalButton = await click("button", "Mostrar no ensaio");
        await sleep(400);
        result.rehearsalKeptAir = Boolean(live.get().content) && live.get().content.index === 0;
        await click(".kx-banner button", "Armar saídas");
        await click(".dialog button", "Armar saídas");
        result.armed = await waitText(webContents, "MODO ENSAIO", false);

        // Bíblia: a letter opens the quick jump; "jo 3 16" reads as João 3:16.
        await click(".envtabs button", "Bíblia");
        await waitText(webContents, "SELECIONADO");
        await press("j");
        result.quickOpened = await waitFor(() => js("Boolean(document.querySelector('.qj'))"));
        await type("o 3 16");
        result.quickRead = await js("[...document.querySelectorAll('.qj-step b')].map((n) => n.textContent).join('|')");
        // Space completed the book: the field holds the full name. The
        // synthetic char event ignores preventDefault and adds a stray
        // space a real keyboard would not; collapse whitespace.
        result.quickSpaceValue = String(await js("(document.querySelector('.qj-input input') || {}).value"));
        result.quickSpace = result.quickSpaceValue.replace(/s+/g, " ").trim() === "João 3 16";
        result.shotBible = await shot("biblia");
        await press("Enter");
        result.quickPicked = await waitFor(() => js("!document.querySelector('.qj') && [...document.querySelectorAll('.kx-panel-h')].some((n) => n.textContent.startsWith('João 3'))"));
        // The Bible shows "No ar" only (no Prévia monitor).
        result.bibleOneMonitor = await js("document.querySelectorAll('.console .main .kx-mon').length === 1");
        // One verse (Enter) goes out as the whole chapter, at that verse.
        await waitFor(() => js("document.querySelectorAll('.kx-verse').length === 5"), 8000);
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Enter");
        result.chapterSent = await waitFor(() => { const c = live.get().content; return c && c.kind === "bible" && c.slides.length === 5 && c.index === 2; });
        result.chapterRef = live.get().content?.slides?.[2]?.ref;
        // → walks the chapter on air.
        await press("ArrowRight");
        result.arrowNextVerse = await waitFor(() => live.get().content?.index === 3);
        // ↓ moves the selection (green) without touching the air; Enter projects it.
        await press("ArrowDown");
        await press("ArrowDown");
        result.selMoved = await waitFor(() => js("(() => { const s = document.querySelector('.kx-verse.is-prev'); return s && s.dataset.verse === '18'; })()")) && live.get().content?.index === 3;
        await press("Enter");
        result.selSent = await waitFor(() => live.get().content?.index === 4);
        // Esc in the quick jump cancels it and never ends the projection.
        await press("g");
        await waitFor(() => js("Boolean(document.querySelector('.qj'))"));
        await press("Escape");
        await sleep(300);
        result.quickEsc = !(await js("Boolean(document.querySelector('.qj'))")) && Boolean(live.get().content);
        await click(".envtabs button", "KERYX");
        // The song back on air for the player checks below.
        await dblclick(".kx-row", "Canto do console");
        await waitFor(() => live.get().content?.title === "Canto do console");

        // ↑/↓ in KERYX move the selection through the slides; Enter projects it.
        await press("ArrowDown");
        result.slideSelMoved = await waitFor(() => js("(() => { const s = document.querySelector('.kx-slide.is-prev .kx-slide-n'); return s && s.textContent === '2'; })()")) && live.get().content.index === 0;
        await press("Enter");
        result.slideSelSent = await waitFor(() => live.get().content.index === 1);
        await press("ArrowLeft");
        await waitFor(() => live.get().content.index === 0);

        // The Programa monitor mirrors the screens: a video-channel clip
        // renders as a real (muted) video covering the box, not a poster.
        live.call("video.show", { kind: "video", url: "keryx-media://programa-motion.mp4", title: "Clipe do console" });
        result.programaMotion = await waitFor(() => js("Boolean(document.querySelector('.prog .ks-vidcover video'))"), 6000);
        live.call("video.clear");

        // The player: an audio file from the Mídia tab goes out with Enter,
        // plays on the projector under the song, and the L/R meters move.
        const toneFile = await js(MAKE_TONE);
        tone = toneFile && (await js(`window.keryxDesktop.db.call("Media", "create", [{ title: "Tom de teste", type: "audio", file_url: "keryx-media://${toneFile}" }])`)).data;
        await click(".kx-tabs button", "Mídia");
        result.audioListed = await waitText(webContents, "Tom de teste");
        await click(".kx-row", "Tom de teste");
        result.audioPrepared = await waitText(webContents, "PRÉVIA · TOM DE TESTE");
        await press("Enter");
        result.audioOn = await waitFor(() => live.get().audio && live.get().audio.title === "Tom de teste");
        result.audioUnderSong = Boolean(live.get().content) && live.get().content.title === "Canto do console";
        result.playerShows = await waitFor(() => js("Boolean(document.querySelector('.player:not(.is-idle)')) && document.querySelector('.player .pl-what').textContent.includes('Tom de teste')"));
        const meterState = () => js("document.querySelector('.player .meters') && document.querySelector('.player .meters').dataset.state");
        await waitFor(async () => (await meterState()) !== "wait", 8000);
        result.meterState = await meterState();
        result.meters = result.meterState !== "on"
            ? "sem loopback nesta máquina"
            : await waitFor(() => js("(() => { const b = [...document.querySelectorAll('.player .kx-meter b')]; return b.length === 2 && b.every((x) => parseFloat(x.style.height) > 40); })()"), 10000);
        result.duration = await waitFor(() => js("(document.querySelector('.player .pl-left small') || {}).textContent === '0:20'"), 6000);
        result.shotPlayer = await shot("player");
        await click(".player button", "Pausar");
        result.audioPaused = await waitFor(() => live.get().audio.playback.paused);
        await click(".player button", "Tocar");
        await click(".player .pl-vol button", "");
        result.audioMuted = await waitFor(() => live.get().audio.playback.volume === 0);
        // The meters read the system output, so muting the element empties them.
        result.metersFollowVolume = result.meterState !== "on"
            ? "sem loopback nesta máquina"
            : await waitFor(() => js("[...document.querySelectorAll('.player .kx-meter b')].every((x) => parseFloat(x.style.height) < 5)"), 6000);
        // The mute reached the element that actually plays, on the projector.
        result.projectorMuted = await waitFor(() => main && main.webContents.executeJavaScript("(() => { const v = document.querySelector('video'); return v ? v.volume === 0 : null; })()").catch(() => null));

        // The Encerrar button asks first; only "Encerrar" in the dialog ends.
        // The music is not a screen: it keeps playing until Parar.
        await click(".topbar button", "Encerrar a projeção");
        result.endAsked = await waitText(webContents, "ENCERRAR A PROJEÇÃO?");
        result.endWaited = Boolean(live.get().content);
        await click(".dialog button", "Encerrar");
        result.ended = await waitFor(() => !live.get().content);
        result.audioSurvivesEnd = Boolean(live.get().audio);
        await click(".player button", "Parar e tirar do ar");
        result.audioStopped = await waitFor(() => !live.get().audio);

        // Linha do tempo: the arrow opens it with no service (and says so),
        // then shows the blocks once a service with items exists.
        await click(".tl-panel .kx-tl button", "");
        result.tlEmpty = await waitText(webContents, "Nenhum culto escolhido");
        if (!result.tlEmpty) {
            result.tlDebug = await js(`(() => {
                const p = document.querySelector(".tl-panel");
                const b = p && p.querySelector(".kx-tl button");
                if (!b) return "sem botão";
                const r = b.getBoundingClientRect();
                const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return [p.innerText.slice(0, 200), b.getAttribute("aria-label"), at && (at.className.baseVal ?? at.className), innerHeight, Math.round(r.top)].join(" | ");
            })()`);
        }
        // No service yet: dropping a song on the Setlist starts today's setlist.
        if (operatorWin) operatorWin.setContentSize(1600, 900);
        await sleep(400);
        await click(".kx-tabs button", "Letras");
        await waitText(webContents, "Canto do console");
        await js(`(() => {
            const from = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Canto do console"));
            const to = document.querySelector(".rund-tail");
            if (!from || !to) return false;
            const dt = new DataTransfer();
            from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
            to.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
            to.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
            from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
            return true;
        })()`);
        result.autoSetlist = await waitFor(async () => {
            const rows = (await js(`window.keryxDesktop.db.call("Service", "list", [])`)).data || [];
            svc = rows.find((r) => /^Setlist de \d\d\/\d\d$/.test(r.title)) || null;
            return Boolean(svc);
        }, 8000);
        result.autoSetlistShown = await waitText(webContents, "Setlist de");
        if (!svc) throw new Error("a setlist do dia não foi criada");
        for (const [i, title] of ["Abertura", "Louvor"].entries()) {
            await js(`window.keryxDesktop.db.call("ServiceItem", "create", [{ serviceId: "${svc.id}", type: "TEXT", title: "${title}", order: ${i + 1}, duration: 300 }])`);
        }
        result.tlBlocks = await waitFor(() => js("document.querySelectorAll('.tl-track .kx-tl-blk').length >= 2"), 8000);

        // Drag from the Biblioteca (synthetic DragEvents drive the handlers).
        // Wide enough that the Setlist column is on screen.
        if (operatorWin) operatorWin.setContentSize(1600, 900);
        await sleep(400);
        await click(".kx-tabs button", "Letras");
        await waitText(webContents, "Canto do console");
        result.dragPrev = await js(`(() => {
            const from = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Canto do console"));
            const to = [...document.querySelectorAll(".kx-mon")].find((n) => n.textContent.includes("Prévia"));
            if (!from || !to) return "faltou " + (from ? "alvo" : "origem");
            const dt = new DataTransfer();
            from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
            to.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
            to.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
            from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
            return true;
        })()`);
        await sleep(300);
        result.dragPrepared = await waitText(webContents, "PRÉVIA · CANTO DO CONSOLE");
        result.dragDidNotSend = !live.get().content;
        result.dragSetlist = await js(`(() => {
            const from = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Canto do console"));
            const to = document.querySelector(".rund-tail");
            if (!from || !to) return "faltou " + (from ? "cauda" : "origem");
            const dt = new DataTransfer();
            from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
            to.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
            to.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
            from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
            return true;
        })()`);
        result.dragAdded = await waitFor(async () => {
            const rows = (await js(`window.keryxDesktop.db.call("ServiceItem", "filter", [{ serviceId: "${svc.id}" }])`)).data || [];
            return rows.length === 4 && rows.filter((r) => r.title === "Canto do console" && r.type === "SONG").length === 2;
        }, 8000);
        result.layersBefore = (live.get().layerOrder || []).join(",");
        result.layerDrag = await js(`(async () => {
            const rows = [...document.querySelectorAll(".kx-layer")];
            const from = rows.find((n) => n.textContent.includes("Logo"));
            const to = rows.find((n) => n.textContent.includes("Texto principal"));
            if (!from || !to) return "faltou camada";
            const wait = () => new Promise((r) => setTimeout(r, 80));
            const dt = new DataTransfer();
            const r = to.getBoundingClientRect();
            from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
            await wait();
            to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.bottom - 2 }));
            await wait();
            to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.bottom - 2 }));
            await wait();
            from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
            return true;
        })()`);
        result.layersMoved = await waitFor(() => (live.get().layerOrder || []).join(",") === "overlays,content,logo,background");
        result.layersAfter = (live.get().layerOrder || []).join(",");
        live.call("layers.order", { order: ["logo", "overlays", "content", "background"] });

        // The song editor: "+ › Nova música", lyrics split live into slides,
        // Ctrl+S saves, Esc closes; "Editar" reopens it with the song.
        await click(".envtabs button", "KERYX");
        await click(".kx-tabs button", "Letras");
        await click(".searchrow .addmenu button", "");
        await click(".addmenu-pop button", "Nova música");
        result.edOpen = await waitFor(() => js("Boolean(document.querySelector('.song-ed-l'))"));
        result.edFill = await js(`(() => {
            const setVal = (el, v) => { const p = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
            const title = document.querySelector(".song-ed-l .kx-field input");
            const lyrics = document.querySelector("textarea[aria-label=Letra]");
            if (!title || !lyrics) return "sem campos: " + document.body.innerText.slice(0, 200);
            setVal(title, "Música do editor");
            setVal(lyrics, "[Verso]\\nlinha um\\nlinha dois\\n\\n[Refrão]\\nrefrão um\\nrefrão dois");
            return true;
        })()`);
        result.edThumbs = await waitFor(() => js("document.querySelectorAll('.ed-th').length === 2"));
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("s", ["control"]);
        result.edSaved = await waitFor(async () => {
            const rows = (await js(`window.keryxDesktop.db.call("Song", "filter", [{ title: "Música do editor" }])`)).data || [];
            edSong = rows[0] || null;
            return Boolean(edSong) && edSong.slides?.length === 2 && edSong.slides[1].label === "Refrão" && edSong.slides[1].is_chorus === true;
        }, 6000);
        await press("Escape");
        result.edClosed = await waitFor(() => js("!document.querySelector('.song-ed-l')"));
        result.edListed = await waitText(webContents, "Música do editor");
        await js(`(() => { const row = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Música do editor")); const b = row && [...row.querySelectorAll("button")].find((x) => x.textContent === "Editar"); if (b) b.click(); return Boolean(b); })()`);
        result.edReopen = await waitFor(() => js("(document.querySelector('.song-ed-l .kx-field input') || {}).value === 'Música do editor'"));
        result.shotEditor = await shot("editor");
        await press("Escape");
        await waitFor(() => js("!document.querySelector('.song-ed-l')"));

        // Configurações inside the console: from the KERYX menu, every
        // section renders, Tela ociosa and Igreja save, Esc goes back.
        await click(".topbar .markbtn", "");
        await click(".kx-pop button", "Configurações");
        result.cfgOpen = await waitFor(() => js("Boolean(document.querySelector('.console .cfg'))"));
        result.cfgSections = {};
        for (const name of ["Telas e saídas", "Telas na rede", "Bíblias instaladas", "Igreja", "Temas", "Letras", "Dados e atualizações"]) {
            await click(".console .main .kx-row", name);
            result.cfgSections[name] = await waitFor(() => js(`(() => { const h = document.querySelector(".console .cfg .kx-panel-h .kx-section"); const b = document.querySelector(".console .cfg .kx-panel-b"); return Boolean(h && h.textContent.trim().toUpperCase() === ${JSON.stringify(name.toUpperCase())} && b && b.innerText.trim().length > 0); })()`), 6000);
        }
        result.cfgAll = Object.values(result.cfgSections).every(Boolean);
        result.shotCfg = await shot("configuracoes");
        await click(".console .main .kx-row", "Telas e saídas");
        result.cfgOutputs = await waitText(webContents, "Projeção principal");
        await click(".console .cfg .kx-seg button", "Preto");
        result.cfgIdle = await waitFor(() => live.get().idle === "black");
        await click(".console .cfg .kx-seg button", "Logo da igreja");
        await waitFor(() => live.get().idle === "logo");
        await click(".console .main .kx-row", "Igreja");
        await waitFor(() => js("Boolean(document.querySelector('.console .cfg input[placeholder=\"Nome da igreja\"]'))"));
        await click(".console .cfg .kx-field", "");
        await type("Igreja do Teste");
        await press("Tab");
        result.cfgChurch = await waitFor(async () => ((await js(`window.keryxDesktop.db.call("User", "get", ["local"])`)).data || {}).church_name === "Igreja do Teste", 6000);
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { church_name: "" }])`);
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Escape");
        result.cfgEsc = await waitFor(() => js("!document.querySelector('.console .cfg') && Boolean(document.querySelector('.console .main .col.center'))"));

        await click(".tl-panel .kx-tl button", "");
        result.tlClosed = await waitFor(() => js("!document.querySelector('.tl-track') && !document.querySelector('.tl-empty')"));
    } finally {
        if (operatorWin && size) operatorWin.setContentSize(size[0], size[1]);
        live.call("clear");
        try { live.call("audio.clear"); } catch { /* nothing playing */ }
        await js(`window.keryxDesktop.db.call("Song", "delete", ["${song && song.id}"])`);
        if (tone) await js(`window.keryxDesktop.db.call("Media", "delete", ["${tone.id}"])`);
        if (edSong) await js(`window.keryxDesktop.db.call("Song", "delete", ["${edSong.id}"])`).catch(() => {});
        for (const v of [14, 15, 16, 17, 18]) await js(`window.keryxDesktop.db.call("BibleVerse", "delete", ["smoke-jo3-${v}"])`).catch(() => {});
        if (svc) {
            const its = (await js(`window.keryxDesktop.db.call("ServiceItem", "filter", [{ serviceId: "${svc.id}" }])`)).data || [];
            for (const it of its) await js(`window.keryxDesktop.db.call("ServiceItem", "delete", ["${it.id}"])`);
            await js(`window.keryxDesktop.db.call("Service", "delete", ["${svc.id}"])`);
        }
        await js(`history.pushState({}, "", "/"); window.dispatchEvent(new PopStateEvent("popstate")); true`);
        if (main && !main.isDestroyed()) main.close();
    }
    result.ok = Boolean(result.focusKept && result.opened && result.listed && result.fullConsole
        && result.prepared && result.airUntouched && result.clickLeftNoFocus && result.tabFocused && result.focusedEnterKeptAir
        && result.sent && result.projected && result.advanced && result.barFits && result.escEnded && result.escToast
        && result.dblSent && result.autoOpened && result.autoFocusKept && result.projected2
        && result.outsPopover && result.verify && result.verifyProjector && result.verifyClosed && result.idleSet && result.idleBlack
        && result.resent && result.rehearsing && result.rehearsalButton && result.rehearsalKeptAir
        && result.armed && result.quickOpened && result.quickRead === "João|3|16" && result.quickSpace && result.quickPicked && result.quickEsc
        && result.endAsked && result.endWaited && result.ended
        && result.audioListed && result.audioPrepared && result.audioOn && result.audioUnderSong && result.playerShows && result.duration && result.programaMotion
        && result.audioPaused && result.audioMuted && Boolean(result.metersFollowVolume) && Boolean(result.meters) && result.projectorMuted && result.audioSurvivesEnd && result.audioStopped
        && result.tlEmpty && result.tlBlocks && result.tlClosed
        && result.dragPrev === true && result.dragPrepared && result.dragDidNotSend && result.dragSetlist === true && result.dragAdded
        && result.colsFit && result.noGoldRing === true && result.bibleOneMonitor && result.chapterSent && result.chapterRef === "João 3:16 · NVI"
        && result.arrowNextVerse && result.selMoved && result.selSent && result.slideSelMoved && result.slideSelSent
        && result.autoSetlist && result.autoSetlistShown && result.layerDrag === true && result.layersMoved
        && result.cfgOpen && result.cfgAll && result.cfgOutputs && result.cfgIdle && result.cfgChurch && result.cfgEsc
        && result.edOpen && result.edThumbs && result.edSaved && result.edClosed && result.edListed && result.edReopen);
    return result;
}

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
            // Músicas moved into the console (Biblioteca › Letras + song editor).
            const operatorResult = { ok: true, retired: "Músicas no console" };
            const videoResult = await checkVideo(webContents, { live });
            const layersResult = await checkLayers(webContents, { live, outputs });
            const consoleResult = await checkConsole(webContents, { live, outputs });
            // The LAN server serves the built app (dist/), so this runs in built mode only.
            const networkResult = dev ? "skipped (built mode only)" : await checkNetwork({ network, live, videoFile: videoResult.fileName });
            finish(bridgeOk && adapterOk && outputsResult.ok && systemResult.ok && liveResult.ok && operatorResult.ok && videoResult.ok && layersResult.ok && consoleResult.ok && !importOutcome && (dev || networkResult.ok),
                { rendered, bridge, adapter, outputs: outputsResult, system: systemResult, live: liveResult, operator: operatorResult, video: videoResult, layers: layersResult, console: consoleResult, network: networkResult });
        } catch (err) {
            finish(false, { rendered, exception: String(err && (err.stack || err.message)).slice(0, 800) });
        }
    };
    webContents.once("did-finish-load", poll);
}

module.exports = { runSmokeTest };
