// npm run desktop:smoke — loads the app in the real shell and checks, in the
// page, that it rendered and that data flows through the bridge. In dev mode
// it also drives the renderer adapter (src/api) end to end. Prints one
// "SMOKE OK|FAIL <json>" line and exits 0 or 1. Always runs on a throwaway
// data dir (scripts/desktop.mjs sets KERYX_DATA_DIR).

const fs = require("node:fs");
const { focusVerdict, meterVerdict } = require("./smoke-verdicts.cjs");
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
        // ACF installed: NVI is read online (ACF if that fails); AA exists only
        // as an install, so ACF is used.
        preferred: (await bibleText.preferredVersion("NVI")) + "|" + (await bibleText.preferredVersion("AA")),
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

    // A crashed output comes back by itself (ARCH-001): kill its renderer and
    // it must reload on the same page, tracked and alive.
    outputs.open("/Projection");
    const crashing = await waitWindow("/Projection", 10000);
    if (crashing) {
        await sleep(500);
        const reloaded = new Promise((resolve) => crashing.webContents.once("did-finish-load", () => resolve(true)));
        crashing.webContents.forcefullyCrashRenderer();
        const back = await Promise.race([reloaded, sleep(8000).then(() => false)]);
        const after = outputs.trackedWindows().find((w) => w.key === "/Projection");
        result.crashRecovery = {
            reloaded: back,
            stillTracked: Boolean(after && !after.destroyed),
            samePage: !crashing.isDestroyed() && crashing.webContents.getURL().includes("/Projection") && !crashing.webContents.isCrashed(),
        };
    } else {
        result.crashRecovery = { reloaded: false, stillTracked: false, samePage: false };
    }
    outputs.close("/Projection");
    await sleep(300);

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
        && result.crashRecovery.reloaded && result.crashRecovery.stillTracked && result.crashRecovery.samePage
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
    // Cleared, the video screen falls back to the live idle look (the church
    // logo or black, src/lib/network/views.js standbyView): the clip no longer
    // plays there (a background loop may) and its name is gone.
    result.cleared = await (async () => {
        const end = Date.now() + 5000;
        while (Date.now() < end) {
            const idle = screenWin ? await screenWin.webContents.executeJavaScript(`![...document.querySelectorAll("video")].some((v) => v.src.includes(${JSON.stringify(fileName)})) && Boolean(document.querySelector(".ks-idle, .ks-black"))`).catch(() => false) : false;
            if (idle && !(await bodyText(screenWin)).includes("Vídeo de teste")) return true;
            await sleep(250);
        }
        return false;
    })();
    if (screenWin) screenWin.close();

    // The eye (Rodada G4): the same clip on the projector, then the player's
    // "Tirar o vídeo" clicked in the console. The picture fades out ("Ao
    // tirar do ar", 0,3 s by default) while the sound goes on in the
    // projector's hidden audio player — in the SAME <video> (mediaPool): the
    // fading picture is a still (the ghost never claims a second element,
    // which would load the file again and echo). Right after the click the
    // projector has one video element, still advancing, at full volume.
    // Whether the still looks right needs a real window (PR G4).
    {
        live.call("media.show", { kind: "video", url: `keryx-media://${fileName}`, title: "Vídeo do olho" });
        await webContents.executeJavaScript(OPEN_OUTPUT("/Projection", "keryx_projection"), true);
        const proj = windowFor("/Projection");
        result.eyeOnProjector = await waitState(proj, (v) => v.src.endsWith(`/media/${fileName}`) && !v.paused && v.ready >= 2, 8000);
        const eye = "(() => { const b = document.querySelector('.player .pl-eye'); if (!b || b.disabled) return false; b.click(); return true; })()";
        let clicked = false;
        for (let i = 0; i < 24 && !clicked; i++) { clicked = await webContents.executeJavaScript(eye).catch(() => false); if (!clicked) await sleep(250); }
        const videosIn = () => (proj ? proj.webContents.executeJavaScript(`(() => { const v = [...document.querySelectorAll("video")].filter((x) => x.src.includes(${JSON.stringify(fileName)})); return { n: v.length, time: v[0] ? v[0].currentTime : null, volume: v[0] ? v[0].volume : null, paused: v[0] ? v[0].paused : null, still: Boolean(document.querySelector(".ks-ghost canvas, .ks-ghost img")) }; })()`).catch(() => null) : null);
        const end = Date.now() + 3000;
        while (clicked && Date.now() < end && !(live.get().audio && !live.get().media)) await sleep(20);
        const first = await videosIn();
        await sleep(1200);
        const later = await videosIn();
        const s = live.get();
        result.eye = {
            clicked,
            moved: Boolean(s.audio && s.audio.url.endsWith(fileName) && !s.media),
            fade: s.fade ? s.fade.ms : 0,
            first,
            later,
            // Informative only: the ghost lasts 0,3 s, a round trip may miss it.
            stillSeen: Boolean(first && first.still),
        };
        result.eyeOk = Boolean(result.eyeOnProjector && clicked && result.eye.moved && result.eye.fade > 0
            && first && later && first.n === 1 && later.n === 1 && later.time - first.time >= 0.8 && !later.paused && later.volume === 1);
        live.call("audio.clear");
        if (proj) proj.close();
        await sleep(500);
    }

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

    // Ao entrar ou trocar (Rodada G5): a song replaced by another fades. The
    // projector draws both for a moment — the old one as a ghost going
    // transparent over the new one — then settles on the new one alone. The
    // fade rides in the op (1 s, so a round trip cannot miss it); whether it
    // looks smooth needs a real window.
    {
        // The projector closed just above: wait until it is gone, or the
        // open below finds the closing window and the look reads nothing.
        for (let end = Date.now() + 4000; Date.now() < end && windowFor("/Projection");) await sleep(100);
        live.call("content.show", { kind: "lyrics", title: "Primeira", slides: ["Primeira música"] });
        await webContents.executeJavaScript(OPEN_OUTPUT("/Projection", "keryx_projection"), true);
        const proj = await waitWindow("/Projection");
        const look = () => (proj ? proj.webContents.executeJavaScript(`(() => ({ ghosts: document.querySelectorAll(".ks-ghost").length, text: document.body.innerText }))()`).catch(() => null) : null);
        let ready = false;
        for (let end = Date.now() + 6000; Date.now() < end && !ready;) { ready = Boolean((await look())?.text.includes("Primeira música")); if (!ready) await sleep(100); }
        live.call("content.show", { kind: "lyrics", title: "Segunda", slides: ["Segunda música"], fade: 1000 });
        let both = null;
        for (let end = Date.now() + 900; Date.now() < end && !both;) {
            const v = await look();
            if (v && v.ghosts > 0 && v.text.includes("Primeira música") && v.text.includes("Segunda música")) both = v;
            else await sleep(30);
        }
        await sleep(1400);
        const settled = await look();
        result.songFade = { ready, both: Boolean(both), fade: live.get().fade ? live.get().fade.ms : 0, settled: Boolean(settled && settled.ghosts === 0 && settled.text.includes("Segunda música") && !settled.text.includes("Primeira música")) };
        result.songFadeOk = ready && result.songFade.both && result.songFade.fade === 1000 && result.songFade.settled;
        live.call("clear");
        if (proj) proj.close();
    }

    result.ok = result.recorded && result.lateJoin && result.playing && result.title && result.paused && result.resumed && result.continuity && result.cleared
        && result.eyeOk && result.playlistAdvanced && result.projectorImage && result.songFadeOk;
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
    for (const path of ["/Projection", "/CommunicationProjection", "/StageView"]) {
        const end = Date.now() + 5000;
        while (windowFor(path) && Date.now() < end) await sleep(200);
    }
    // Opened by the main process this time (the earlier checks used window.open).
    outputs.open("/Projection");
    let main = await waitWindow("/Projection");
    result.projectorErrors = [];
    if (main) main.webContents.on("console-message", (e) => { if (e.level === "error") result.projectorErrors.push(String(e.message).slice(0, 300)); });
    outputs.open("/CommunicationProjection");
    const comm = await waitWindow("/CommunicationProjection");
    result.mainOpened = Boolean(main && comm);
    // Outputs are not in the taskbar (only the console is), both open here.
    const openNow = outputs.trackedWindows().filter((w) => !w.destroyed);
    result.offTaskbar = openNow.length >= 2 && openNow.every((w) => w.skipTaskbar === true);
    // While an output is open Windows must not turn the displays off (WIN-01).
    result.keepsAwake = outputs.keepsAwake();
    try {
        live.call("tool.show", { mode: "freetext", text: "Texto livre de teste" });
        result.freetext = await waitText(main, "Texto livre de teste");
        live.call("tool.show", { mode: "timer", durationMs: 125000 });
        result.timer = await waitText(main, "02:0");
        await shot(main, "temporizador");

        live.call("communication.show", { item: { type: "announcement", text: "Aviso de teste", duration: 30, text_color: "#ffffff", font_size: "large" } });
        result.communication = await waitText(main, "Aviso de teste") && await waitText(comm, "Aviso de teste");
        await shot(main, "comunicacao");
        // Camadas' eye on the Fundo leaves an aviso its own background (the
        // aviso's, not the Fundo's): hidden, the aviso still has its colour.
        live.call("layers.hide", { layer: "background" });
        live.call("communication.show", { item: { type: "announcement", text: "Aviso com fundo", duration: 30, text_color: "#ffffff", background_color: "#123456" } });
        result.hiddenFundoAviso = await waitText(main, "Aviso com fundo")
            && await main.webContents.executeJavaScript('[...document.querySelectorAll(".ks-layer")].some((n) => getComputedStyle(n).backgroundColor === "rgb(18, 52, 86)")').catch(() => false);
        live.call("layers.show", { layer: "background" });
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

        // Camadas, more control (2026-10-10): the projector window itself
        // draws the text's box, capitals and opacity, the Fundo's fit and
        // darkening, and the logo's opacity (shared/live-state.mjs + ScreenRenderer).
        live.call("content.update", { style: { text_box: "block", text_box_color: "#102030", text_box_opacity: 0.5, text_case: "upper", text_opacity: 0.8 } });
        live.call("background.set", { kind: "image", value: "keryx-media://bundled/backgrounds/1418065460487-3e41a6c84dc5.webp", title: "Fundo", fit: "contain", dim: 0.6 });
        live.call("logo.set", { visible: true, opacity: 0.5, width: 15 });
        await sleep(900);
        result.layersPlus = main ? await main.webContents.executeJavaScript(`(() => {
            const t = document.querySelector(".ks-text"), bg = document.querySelector(".ks-bg-img"), dim = document.querySelector(".ks-bg-dim"), logo = document.querySelector(".ks-logo");
            if (!t || !bg || !dim) return { missing: [!t && "text", !bg && "bg", !dim && "dim"].filter(Boolean) };
            const ts = getComputedStyle(t);
            return { box: ts.backgroundColor, upper: ts.textTransform, opacity: ts.opacity, fit: getComputedStyle(bg).backgroundSize, dim: getComputedStyle(dim).backgroundColor, logo: logo ? getComputedStyle(logo).opacity : null };
        })()`).catch((err) => ({ error: String(err.message || err) })) : null;
        const lp = result.layersPlus || {};
        result.layersPlusOk = lp.box === "rgba(16, 32, 48, 0.5)" && lp.upper === "uppercase" && lp.opacity === "0.8" && lp.fit === "contain" && lp.dim === "rgba(0, 0, 0, 0.6)" && lp.logo === "0.5";

        // Per-output settings (OutputPref, src/lib/outputPrefs.js): a row for
        // /Projection written like Configurações does reaches the open
        // projector live: text 120%, 5% margins, no logo; deleting it brings
        // the output back exactly as before.
        const prefCall = (op, args) => webContents.executeJavaScript(`window.keryxDesktop.db.call("OutputPref", ${JSON.stringify(op)}, ${JSON.stringify(args)})`);
        const prefLook = () => (main ? main.webContents.executeJavaScript(`(() => {
            const t = document.querySelector(".ks-text"), c = document.querySelector(".ks-content"), w = document.querySelector(".kp-out");
            if (!t || !c) return { missing: true };
            const size = parseFloat(getComputedStyle(c).getPropertyValue("--ks-size")) / 100 * innerWidth;
            return { wrapped: Boolean(w), scale: Math.round(parseFloat(getComputedStyle(t).fontSize) / size * 100) / 100,
                margin: Math.round(c.getBoundingClientRect().top / innerWidth * 100), logo: Boolean(document.querySelector(".ks-logo")) };
        })()`).catch((err) => ({ error: String(err.message || err) })) : null);
        const created = await prefCall("create", [{ screen_path: "/Projection", text_scale: 120, margin_pct: 5, show_logo: false }]).catch((err) => ({ error: String(err.message || err) }));
        await sleep(900);
        const prefOn = await prefLook();
        if (created && created.data) await prefCall("delete", [created.data.id]).catch(() => {});
        await sleep(900);
        const prefOff = await prefLook();
        result.outputPref = { created: Boolean(created && created.data), on: prefOn, off: prefOff };
        result.outputPrefOk = Boolean(created && created.data) && prefOn && prefOn.wrapped && prefOn.scale === 1.2 && prefOn.margin === 5 && prefOn.logo === false
            && prefOff && !prefOff.wrapped && prefOff.scale === 1 && prefOff.margin === 0 && prefOff.logo === true;
        // Mostrar (hidden_kinds, the old field: ruleOf migrates it into "O
        // que esta tela recebe"): the projector leaves the song's words out
        // while they stay on air, and still shows the aviso rápido; deleting
        // the row brings the words back.
        // The words are read from the text node (textContent): the checks above
        // set the text to capitals, which innerText would return.
        const words = async (present, ms = 6000) => {
            const end = Date.now() + ms;
            while (Date.now() < end) {
                const t = main ? await main.webContents.executeJavaScript(`[...document.querySelectorAll(".ks-text")].map((n) => n.textContent).join(" ")`).catch(() => "") : "";
                if (t.includes("Letra sob a camada") === present) return true;
                await sleep(250);
            }
            return false;
        };
        const hideBefore = await words(true);
        const hide = await prefCall("create", [{ screen_path: "/Projection", hidden_kinds: ["lyrics"] }]).catch((err) => ({ error: String(err.message || err) }));
        live.call("alert.show", { message: "Alerta com a letra escondida", type: "message" });
        const hideGone = await words(false) && Boolean(main) && await waitText(main, "Alerta com a letra escondida");
        const hideOnAir = live.get().content?.slides?.[0]?.text === "Letra sob a camada";
        live.call("alert.clear");
        if (hide && hide.data) await prefCall("delete", [hide.data.id]).catch(() => {});
        const hideBack = await words(true);
        result.outputHide = { created: Boolean(hide && hide.data), before: hideBefore, gone: hideGone, onAir: hideOnAir, back: hideBack };
        result.outputHideOk = Boolean(hide && hide.data) && hideBefore && hideGone && hideOnAir && hideBack;
        // O que esta tela recebe (Rodada H2, content_rule): a Projeção that
        // receives only the Bíblia leaves the song's words out, the same;
        // deleting the row brings them back.
        const rule = await prefCall("create", [{ screen_path: "/Projection", content_rule: { kinds: ["bible"], top: { alert: true, logo: true }, empty: "wall" } }]).catch((err) => ({ error: String(err.message || err) }));
        const ruleGone = await words(false);
        const ruleOnAir = live.get().content?.slides?.[0]?.text === "Letra sob a camada";
        if (rule && rule.data) await prefCall("delete", [rule.data.id]).catch(() => {});
        const ruleBack = await words(true);
        result.outputRule = { created: Boolean(rule && rule.data), gone: ruleGone, onAir: ruleOnAir, back: ruleBack };
        result.outputRuleOk = Boolean(rule && rule.data) && ruleGone && ruleOnAir && ruleBack;
        // Tema por parte (songTheme.js): a slide carrying its part's look is
        // drawn with it on the projector; the slide before keeps the song's.
        live.call("content.show", { title: "Partes", style: { text_color: "#ffffff", font_family: "sans" }, slides: [
            { text: "Verso da parte", label: "Verso" },
            { text: "Refrão da parte", label: "Refrão", style: { text_color: "#ffe9a8", font_family: "serif" } },
        ] });
        // The text without the hidden fit probe (.ks-fit-probe doubles the
        // slide's textContent since the lyric-fit of 2026-10-14).
        const partLook = () => (main ? main.webContents.executeJavaScript(`(() => { const t = document.querySelector(".ks-text"); return t ? { text: (t.querySelector(".ks-fit") || t).textContent, color: getComputedStyle(t).color, serif: /serif/.test(getComputedStyle(t).fontFamily) && !/sans/i.test(getComputedStyle(t).fontFamily.split(",")[0]) } : null; })()`).catch(() => null) : null);
        await waitText(main, "Verso da parte");
        const partVerse = await partLook();
        live.call("content.goTo", { index: 1 });
        let partChorus = null;
        for (const end = Date.now() + 4000; Date.now() < end; await sleep(250)) {
            partChorus = await partLook();
            if (partChorus && partChorus.text === "Refrão da parte") break;
        }
        result.partTheme = { verse: partVerse, chorus: partChorus };
        result.partThemeOk = Boolean(partVerse && partVerse.color === "rgb(255, 255, 255)" && partChorus && partChorus.text === "Refrão da parte" && partChorus.color === "rgb(255, 233, 168)" && partChorus.serif);
        live.call("content.clear");
        live.call("logo.set", { visible: false, opacity: null, width: null });
        live.call("background.clear");

        // Abrir ao iniciar: what the main process opens when KERYX starts.
        outputs.setAssignment("/StageView", { openAtLaunch: true });
        const launched = outputs.openAtLaunch().join(",");
        result.openAtLaunch = launched === "/StageView" && Boolean(await waitWindow("/StageView"));
        result.keptTarget = outputs.list().outputs.find((o) => o.key === "/StageView").assignment.target === "auto";
        outputs.setAssignment("/StageView", { openAtLaunch: false });
    } finally {
        live.call("clear");
        live.call("alert.clear");
        live.call("overlays.set", { overlays: [] });
        live.call("screen.set", { mode: "show" });
        for (const path of ["/Projection", "/CommunicationProjection", "/StageView"]) {
            const w = windowFor(path);
            if (w) w.close();
        }
    }
    result.ok = result.mainOpened && result.freetext && result.timer && result.communication && result.hiddenFundoAviso && result.sequence && result.sequenceIndex === 1
        && result.alert && result.overlay && result.logoCovers && result.layersPlusOk && result.outputPrefOk && result.outputHideOk && result.outputRuleOk && result.partThemeOk && result.openAtLaunch && result.keptTarget && result.offTaskbar && result.keepsAwake;
    return result;
}

// The console, driven with real input (webContents.sendInputEvent: focus
// moves as it would under a mouse and a keyboard). The projector opens
// without taking the keyboard; the console is one screen, always live; a
// mouse click on a control leaves the keys to the console (Enter sends, a
// double click sends at once, arrows move); a control focused with Tab keeps
// its own Enter; Esc ends at once; Travar telas lets nothing new on air (but
// Tela preta still works); Verificar
// opens from the Saídas popover; the Bible quick jump reads "jo 3 16". The
// projector is opened by the main process, as "Abrir ao iniciar" would.
async function checkConsole(webContents, { live, outputs }) {
    const { BrowserWindow } = require("electron");
    const result = { ok: false };
    // Fields save when they lose focus, and Chromium sends no focus or blur
    // events to a page whose window is not the active one (someone using the
    // computer during the run). The page is told it has focus instead, so the
    // run never needs to take the user's window away.
    let emulatingFocus = false;
    try {
        if (!webContents.debugger.isAttached()) { webContents.debugger.attach("1.3"); emulatingFocus = true; }
        await webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
    } catch { /* runs without it */ }
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
    const js = (code) => webContents.executeJavaScript(code).catch((err) => { throw new Error(`${err.message} ← ${String(code).replace(/\s+/g, " ").slice(0, 160)}`); });
    // The live column's monitors caption in parts (state word, title, position):
    // read the title of the Programa (".prog") or the Prévia (".prev-panel .kx-mon").
    const PROG = ".prog";
    const PREV = ".prev-panel .kx-mon";
    // The culto environment's modules (the dock, Ver › Editar disposição):
    // every group inside the window, none over another.
    const GROUPS_FIT = `(() => {
        const gs = [...document.querySelectorAll(".console .dock .dock-group")].map((n) => n.getBoundingClientRect());
        const inside = gs.length > 0 && gs.every((r) => r.left >= -1 && r.right <= innerWidth + 1 && r.width > 0 && r.height > 0);
        const apart = gs.every((a, i) => gs.every((b, j) => j <= i || a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1));
        return inside && apart;
    })()`;
    // Both captions sit inside their screens (.kx-prog-cap): the Programa's
    // in its pill, bottom-right (Rodada E1: the Programa has no header), the
    // Prévia's in its badge, top-left (2026-10-14).
    const capSel = (mon) => (mon === PROG ? ".prog-pill:not(.prev-pill) .kx-prog-cap .kx-mon-t" : ".prev-panel .kx-prog-cap .kx-mon-t");
    const capTitle = (mon) => js(`(document.querySelector(${JSON.stringify(capSel(mon))}) || {}).textContent || ""`).catch(() => "");
    const waitCap = (mon, title, ms = 8000) => waitFor(async () => (await capTitle(mon)) === title, ms);
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
        click.last = at;
        webContents.sendInputEvent({ type: "mouseMove", x: at.x, y: at.y });
        webContents.sendInputEvent({ type: "mouseDown", x: at.x, y: at.y, button: "left", clickCount: 1 });
        webContents.sendInputEvent({ type: "mouseUp", x: at.x, y: at.y, button: "left", clickCount: 1 });
        await sleep(250);
        return true;
    };
    // An item of the content's menus (Culto, Música, Mídia, Ferramentas): the
    // logo's menu is the app's now (Rodada M0), so it comes from the bar's own
    // menus when the bar is shown, else from the Menu button's popover (the bar
    // folds away under 1240 px; both list the same items, menuBar.js).
    const contentMenuItem = async (text) => {
        const bar = await js("Boolean(document.querySelector('.topbar .tb-menus')?.offsetParent)");
        if (!bar) { await click(".topbar .tb-menubtn", ""); return click(".kx-pop button", text); }
        for (const id of ["culto", "musica", "midia", "ferramentas"]) {
            await click(`.topbar .tb-menus [data-menu="${id}"]`, "");
            if (await click(".kx-pop button", text)) return true;
        }
        return false;
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
    // The Programa pill's buttons (Rodada E1): a real click on the button when
    // the pill shows it; folded (a small Programa) through its "…", the
    // Programa's menu, as the operator would. `menuText` names the item there.
    const pillClick = async (label, menuText = label) => {
        const sel = `.prog-pill:not(.prev-pill) button[aria-label="${label}"]`;
        if (await js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); return Boolean(b && b.offsetParent); })()`)) return click(sel, "");
        if (!(await click(".prog-pill:not(.prev-pill) .pp-more", ""))) return false;
        await waitFor(() => js("Boolean(document.querySelector('.console .ctx-menu[role=menu]'))"), 3000);
        return click(".console .ctx-menu button", menuText);
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
    let plTpl = null;
    const mvRows = [];
    const svRows = [];
    let svClass = null;
    const nvRows = [];
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
    // A computer in use makes some checks inconclusive, not failed
    // (smoke-verdicts.cjs); they are listed so a run says what it could not see.
    const inconclusive = [];
    const verdict = (name, v) => { if (typeof v === "string") inconclusive.push(`${name}: ${v}`); return v; };
    const keptFocus = (name) => verdict(name, focusVerdict(BrowserWindow.getFocusedWindow(), operatorWin));
    const size = operatorWin && operatorWin.getContentSize();
    if (operatorWin) { operatorWin.show(); operatorWin.focus(); }
    await sleep(300);
    outputs.open("/Projection");
    let main = await waitWindow("/Projection");
    await sleep(1500);
    // Opening the projector must not take the keyboard from the operator.
    result.focusKept = keptFocus("focusKept");
    // Which window had the focus instead (none: another program is in front).
    if (result.focusKept === false) { const fw = BrowserWindow.getFocusedWindow(); result.focusedInstead = fw ? fw.webContents.getURL() : "nenhuma janela do KERYX"; }
    if (operatorWin) { operatorWin.show(); operatorWin.focus(); }
    try {
        // The app opens on the console now (/ redirects there): leave it and
        // come back, so this check starts from a freshly mounted console.
        await js(`history.pushState({}, "", "/smoke-remount"); window.dispatchEvent(new PopStateEvent("popstate")); true`);
        await sleep(600);
        await js(`history.pushState({}, "", "/Console"); window.dispatchEvent(new PopStateEvent("popstate")); true`);
        // Section captions are uppercase on screen (CSS), so innerText is too.
        // The console opens live, one screen, with the full module layout.
        result.opened = await waitCap(PROG, "Nada no ar", 15000);
        result.listed = await waitText(webContents, "Canto do console", true, 15000);
        result.fullConsole = await js("Boolean(document.querySelector('.console .main .kx-split')) && !document.querySelector('.topbar .kx-seg + .kx-seg')");

        // Click a top-bar tab (a control that used to keep the keys), then a song: Enter sends.
        await click(".envtabs button", "KERYX");
        await click(".kx-row", "Canto do console");
        result.prepared = await waitCap(PREV, "Canto do console");
        // When the first click misses, say where it went: the row's box, what
        // sits at its centre, what holds the focus and what the Prévia shows.
        if (!result.prepared) {
            result.prepDiag = await js(`(() => {
                const row = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Canto do console"));
                const r = row ? row.getBoundingClientRect() : null;
                const at = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
                const name = (el) => (el ? el.tagName + "." + String(el.className || "").slice(0, 40) : null);
                return {
                    row: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
                    atCentre: name(at), atIsRow: Boolean(row && at && row.contains(at)),
                    active: name(document.activeElement),
                    prevCap: (document.querySelector(${JSON.stringify(`${PREV} .kx-mon-cap`)}) || {}).textContent || null,
                    overlays: [...document.querySelectorAll(".scrim, .pop, .drawer, .dialog")].map(name),
                    win: [innerWidth, innerHeight, devicePixelRatio],
                };
            })()`).catch((err) => String(err.message || err));
            if (result.prepDiag && typeof result.prepDiag === "object") result.prepDiag.clickedAt = click.last || null;
        }
        // Live information has its own type steps: what is prepared is a small
        // badge inside the Prévia's screen at 12 px (owner 2026-10-14); the
        // Programa's title is 13 px in its pill once on air (Rodada E1).
        result.prevTitle12 = await js(`getComputedStyle(document.querySelector(".prev-panel .kx-mon-badge .kx-mon-t")).fontSize === "12px"`).catch(() => false);
        result.airUntouched = !live.get().content;
        result.clickLeftNoFocus = (await active()) === "BODY";
        // A control focused from the keyboard keeps its own Enter.
        result.tabFocused = await js(`(() => { const t = document.querySelector(".console [role='tab']"); if (!t) return false; t.focus(); return document.activeElement === t; })()`);
        await press("Enter");
        await sleep(300);
        result.focusedEnterKeptAir = !live.get().content;
        await js("document.activeElement && document.activeElement.blur(); true");
        if ((await capTitle(PREV)) !== "Canto do console") await click(".kx-row", "Canto do console");
        await press("Enter");
        result.sent = await waitFor(() => live.get().content && live.get().content.title === "Canto do console");
        result.projected = Boolean(main) && await waitText(main, "Primeiro slide do console");
        // The projector's letters are the Geist that ships with KERYX (src/fonts.css),
        // loaded from the app, never from the internet.
        result.progTitle13 = (await capTitle(PROG)) === "Canto do console" && await js(`getComputedStyle(document.querySelector("${capSel(PROG)}")).fontSize === "13px"`).catch(() => false);
        // No "Programa" word (owner 2026-10-14): the title itself is red while on
        // air, and no permanent red frame on the monitor.
        result.progOneTitle = await js(`(() => {
            const caps = [...document.querySelectorAll(".console .dock .kx-live-cap")].filter((e) => /^programa/i.test(e.textContent.trim()));
            const title = document.querySelector(".prog-pill:not(.prev-pill) .prog-cap .kx-mon-t");
            const frame = getComputedStyle(document.querySelector(".prog .kx-mon-screen"), "::after").borderTopColor;
            return caps.length === 0 && Boolean(title) && getComputedStyle(title).color === "rgb(255, 107, 112)" && frame !== "rgb(229, 72, 77)" && !document.querySelector(".prog .kx-mon-cap");
        })()`).catch(() => false);
        result.projectorFont = Boolean(main) && await main.webContents.executeJavaScript(`(async () => {
            const faces = await document.fonts.load("40px Geist");
            const text = [...document.querySelectorAll(".ks [style]")].find((n) => n.textContent.includes("Primeiro slide do console"));
            const remote = performance.getEntriesByType("resource").some((e) => /googleapis|gstatic/.test(e.name));
            return faces.length > 0 && Boolean(text) && /^"?Geist/.test(getComputedStyle(text).fontFamily) && !remote;
        })()`).catch(() => false);
        // A church font (Rodada HF1): a Media row of category font, made from
        // the bundled Geist woff2 under the family "Geist Smoke", is declared
        // by every window (src/hooks/useFonts.js) and loads in the console
        // and on the projector; the PC's font list (queryLocalFonts) is
        // offered to the console (electron/main.cjs grants it there).
        result.localFontsApi = await js('typeof window.queryLocalFonts === "function"').catch(() => false);
        const fontRow = (await js(`(async () => {
            const url = (performance.getEntriesByType("resource").find((e) => /Geist-Variable[^/]*\\.woff2$/.test(new URL(e.name).pathname)) || {}).name;
            if (!url) return null;
            const buf = await (await fetch(url)).arrayBuffer();
            const res = await window.keryxDesktop.media.importFile(new File([buf], "geist-smoke.woff2", { type: "font/woff2" }));
            if (!res.data) return null;
            return window.keryxDesktop.db.call("Media", "create", [{ title: "Geist Smoke", type: "font", category: "font", file_url: "keryx-media://" + res.data.fileName, duration: 0, font: { family: "Geist Smoke", weight: "100 900", style: "normal", face: "Regular", origin: "file" } }]);
        })()`).catch(() => null))?.data;
        const loadsChurchFont = (wc) => waitFor(() => wc.executeJavaScript(`document.fonts.load('12px "Geist Smoke"').then((f) => f.length > 0).catch(() => false)`).catch(() => false), 8000);
        result.churchFont = Boolean(fontRow) && await loadsChurchFont(webContents);
        result.churchFontOutput = Boolean(fontRow) && Boolean(main) && await loadsChurchFont(main.webContents);
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
            result.cols[w] = await js(GROUPS_FIT);
            result[`shot${w}`] = await shot(String(w));
        }
        if (operatorWin && size) operatorWin.setContentSize(size[0], size[1]);
        await sleep(300);
        result.barFits = Object.values(result.bar).every(Boolean);
        // The screen actions are glyphs in the Programa's pill (Rodada E1, the
        // owner's pick B; before, a chip in the top bar): each named by
        // aria-label and tooltip, none showing text; the top bar has none, and
        // Ver sits beside the bell. A splitter focused with Tab resizes with the
        // arrows while the slide on air stays put; no visible control smaller
        // than 24 x 24.
        result.telasChip = await js(`(() => {
            const g = document.querySelector(".prog-pill:not(.prev-pill) .pp-screens");
            if (!g || document.querySelector(".topbar .tb-screens")) return false;
            const bs = [...g.querySelectorAll("button")];
            const named = ["Tela preta", "Mostrar logo", "Limpar texto", "Encerrar a projeção"].every((t) => bs.some((b) => b.getAttribute("aria-label") === t && b.title));
            const ver = document.querySelector(".topbar .tb-ver");
            const bell = document.querySelector(".topbar .tb-bell");
            return named && bs.length === 4 && bs.every((b) => !b.textContent.trim()) && Boolean(ver && bell && ver.nextElementSibling === bell);
        })()`);
        // The Programa has no header: its screen starts at the top of its cell
        // (so it lines up with the panels beside it), and the pill sits inside
        // the screen, bottom-right, with Multiview always in it.
        result.progPill = await js(`(() => {
            const scr = document.querySelector(".prog .kx-mon-screen");
            const pill = scr && scr.querySelector(".prog-pill:not(.prev-pill)");
            const cell = document.querySelector(".console .dock .dock-group[data-dock-mods~='programa']");
            if (!pill || !cell || document.querySelector(".prog-panel > .kx-panel-h")) return false;
            const s = scr.getBoundingClientRect(), p = pill.getBoundingClientRect(), l = cell.getBoundingClientRect();
            const mx = pill.querySelector(".mx-toggle");
            return Math.abs(s.top - l.top) <= 1 && p.left >= s.left && p.right <= s.right && s.right - p.right <= 12 && p.bottom <= s.bottom && s.bottom - p.bottom <= 12 && Boolean(mx && mx.offsetParent);
        })()`);
        const airIndex = () => (live.get().content ? live.get().content.index : null);
        const indexBefore = airIndex();
        // The first splitter of the columns (Biblioteca | Slides): the strip
        // under them is pinned, its gap has no handle (owner 2026-10-14).
        const SPLIT = `document.querySelector(".console .dock .dock-cell:has(> .dock-group[data-dock-mods='lib']) + .kx-split[role='separator']")`;
        const splitWidth = () => js(`(() => { const s = ${SPLIT}; return s && s.previousElementSibling ? Math.round(s.previousElementSibling.getBoundingClientRect().width) : null; })()`);
        result.splitterFound = await js(`(() => { const s = ${SPLIT}; if (s) s.focus(); return s ? document.activeElement === s : [...document.querySelector(".console .dock").children].map((c) => c.className).join(" | "); })()`);
        const widthBefore = await splitWidth();
        if (result.splitterFound === true) { await press("ArrowRight"); await sleep(300); }
        const widthAfter = await splitWidth();
        if (result.splitterFound === true) { await press("Enter"); await sleep(300); } // Enter restores the width
        const widthRestored = await splitWidth();
        result.splitterDiag = { widthBefore, widthAfter, widthRestored, indexBefore, indexAfter: airIndex(), active: await js("document.activeElement ? document.activeElement.className : null") };
        const splitOk = result.splitterFound === true && widthAfter > widthBefore && airIndex() === indexBefore && widthRestored === widthBefore;
        // With another program in front the arrow may never reach the splitter:
        // the width stays and so does the air. That is inconclusive (like
        // focusKept). The air moving is a real failure whoever is in front.
        const keyNeverArrived = result.splitterFound === true && widthAfter === widthBefore && airIndex() === indexBefore;
        result.splitterKeys = splitOk ? true : keyNeverArrived && !BrowserWindow.getFocusedWindow() ? verdict("splitterKeys", "outro programa na frente") : false;
        await js("document.activeElement && document.activeElement.blur(); true");
        result.smallTargets = await js(`[...document.querySelectorAll(".console button, .console [role=button]")].filter((b) => b.offsetParent).filter((b) => { const r = b.getBoundingClientRect(); return r.width < 23.5 || r.height < 23.5; }).map((b) => ((b.textContent || "").trim() || b.title || b.getAttribute("aria-label") || b.className).slice(0, 30) + " " + Math.round(b.getBoundingClientRect().width) + "x" + Math.round(b.getBoundingClientRect().height))`);
        result.targets24 = Array.isArray(result.smallTargets) && result.smallTargets.length === 0;
        for (const w of [1460]) {
            if (operatorWin) operatorWin.setContentSize(w, 820);
            await sleep(500);
            result.cols[w] = await js(GROUPS_FIT);
        }
        // The Slides have a minimum width (a slide's line stays whole): the
        // splitter widens them, then dragged far narrower stops at 300 px;
        // a double click restores.
        result.slidesMinDiag = await js(`(async () => {
            // The slides group's cell is no longer a direct child of the root
            // split (the No ar band nests the columns): climb from the group
            // to the nearest cell with a splitter beside it.
            const grp = document.querySelector(".console .dock .dock-group[data-dock-mods='slides']");
            let col = grp && grp.closest(".dock-cell"), s = null;
            for (let i = 0; col && !s && i < 5; i += 1) {
                s = [col.nextElementSibling, col.previousElementSibling].find((n) => n && n.getAttribute("role") === "separator");
                if (!s) col = col.parentElement && col.parentElement.closest(".dock-cell");
            }
            if (!s) return { found: false };
            const colW = () => Math.round(col.getBoundingClientRect().width);
            const sign = s === col.nextElementSibling ? 1 : -1;
            const drag = async (dx) => {
                const r = s.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
                const ev = (t, cx, target) => target.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: cx, clientY: y, button: 0 }));
                ev("mousedown", x, s); ev("mousemove", x + sign * dx, window); ev("mouseup", x + sign * dx, window);
                await new Promise((res) => setTimeout(res, 300));
                return colW();
            };
            const wider = await drag(150);
            const squeezed = await drag(-800);
            s.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
            await new Promise((res) => setTimeout(res, 300));
            return { found: true, wider, squeezed, back: colW() };
        })()`).catch((err) => ({ error: err.message }));
        { const d = result.slidesMinDiag || {}; result.slidesMinW = d.found === true && d.wider > 400 && d.squeezed === 300; }
        if (operatorWin && size) operatorWin.setContentSize(size[0], size[1]);
        await sleep(300);
        result.colsFit = Object.values(result.cols).every(Boolean);
        // Ver › Editar disposição (dock.js): a banner with the tray, a bar on
        // every group; the Biblioteca dragged by its name to the right of the
        // Slides goes there (a hint shows where while dragging), saved with
        // the layout; the groups still fit; Esc leaves the edit mode without
        // ending the projection; Restaurar posições puts the default back.
        {
            const groupOrder = () => js(`[...document.querySelectorAll(".console .dock .dock-group")].map((n) => n.dataset.dockMods).join(",")`);
            const orderBefore = await groupOrder();
            await click(".topbar .tb-ver");
            await click(".pop .kx-menu-item", "Editar disposição");
            result.editBanner = await waitFor(() => js("Boolean(document.querySelector('.arr-banner [data-dock-tray]')) && [...document.querySelectorAll('.console .dock .dock-group')].every((g) => g.querySelector(':scope > .dock-bar'))"));
            const dragHint = await js(`(async () => {
                const chip = document.querySelector('.dock-group[data-dock-mods="lib"] .dock-chip');
                const to = document.querySelector('.dock-group[data-dock-mods="slides"]');
                if (!chip || !to) return "faltou " + (chip ? "alvo" : "nome");
                const a = chip.getBoundingClientRect();
                const b = to.getBoundingClientRect();
                // Inside the right-quarter zone, but off the splitter's %
                // badge (.kx-split-pct), which sits at the edge's middle
                // while editing and belongs to no group.
                const dx = b.right - Math.max(12, Math.round(b.width * 0.12));
                const dy = b.top + Math.round(b.height * 0.3);
                const pe = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }));
                pe("pointerdown", a.left + 8, a.top + 8, chip);
                pe("pointermove", a.left + 40, a.top + 40, window);
                pe("pointermove", dx, dy, window);
                await new Promise((res) => setTimeout(res, 150));
                const hint = Boolean(document.querySelector(".dock-hint"));
                pe("pointerup", dx, dy, window);
                await new Promise((res) => setTimeout(res, 300));
                return hint;
            })()`);
            const orderMoved = await groupOrder();
            const savedLeaves = await js(`(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("keryx.console.layout")); try { const out = []; const walk = (n) => (n.tabs ? out.push(...n.tabs) : n.children.forEach(walk)); walk(JSON.parse(localStorage.getItem(k)).dock.tree); return out.join(","); } catch { return null; } })()`);
            const fits = await js(GROUPS_FIT);
            result.editMove = dragHint === true && orderMoved.startsWith("slides,lib") && Boolean(savedLeaves && savedLeaves.startsWith("slides,lib")) && fits ? true : { dragHint, orderBefore, orderMoved, savedLeaves, fits };
            const airBefore = JSON.stringify(live.get().content || null);
            await js("document.activeElement && document.activeElement.blur(); true");
            await press("Escape");
            result.editEsc = await waitFor(() => js("!document.querySelector('.arr-banner')")) && JSON.stringify(live.get().content || null) === airBefore;
            await click(".topbar .tb-ver");
            await click(".pop .kx-menu-item", "Editar disposição");
            await click(".arr-banner button", "Restaurar posições");
            await click(".arr-banner button", "Concluir");
            result.editRestore = (await groupOrder()) === orderBefore;
        }
        result.noGoldRing = await js(`(() => {
            const input = document.querySelector(".console .searchrow .kx-field input");
            if (!input) return "sem campo";
            input.focus();
            const field = input.closest(".kx-field");
            // A focused field draws a quiet fg-3 line (C-21, #244): never the gold.
            const probe = document.createElement("span");
            probe.style.color = "var(--brand)";
            document.body.appendChild(probe);
            const gold = getComputedStyle(probe).color;
            probe.remove();
            const fs = getComputedStyle(field);
            const ok = getComputedStyle(input).outlineStyle === "none" && (fs.outlineStyle === "none" || fs.outlineColor !== gold) && !fs.boxShadow.includes(gold);
            input.blur();
            return ok;
        })()`);

        // Esc: off the air at once, with a way back: the toast's Desfazer puts
        // the same slide back on air; Esc again takes it off for what follows.
        const beforeEsc = live.get().content ? { title: live.get().content.title, index: live.get().content.index } : null;
        await press("Escape");
        result.escEnded = await waitFor(() => !live.get().content);
        result.escToast = await waitText(webContents, "Projeção encerrada") && await waitFor(() => js("Boolean(document.querySelector('.toast .toast-act'))"));
        await click(".toast .toast-act", "Desfazer");
        result.escUndo = Boolean(beforeEsc) && await waitFor(() => live.get().content && live.get().content.title === beforeEsc.title && live.get().content.index === beforeEsc.index);
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Escape");
        await waitFor(() => !live.get().content);

        // One click prepares; a double click sends straight to air (Holyrics).
        await dblclick(".kx-row", "Canto do console");
        result.dblSent = await waitFor(() => live.get().content && live.get().content.title === "Canto do console");

        // Sending live reopens a closed projector, without taking the keyboard.
        outputs.close("/Projection");
        await waitFor(() => !windowFor("/Projection"), 5000);
        // Closed by something other than the operator: a banner says so (outputs.js).
        result.closedBanner = await waitText(webContents, "Projeção fechada", true, 8000);
        await press("Escape");
        await waitFor(() => !live.get().content);
        await dblclick(".kx-row", "Canto do console");
        main = await waitWindow("/Projection", 10000);
        result.autoOpened = Boolean(main);
        await sleep(1500);
        result.autoFocusKept = keptFocus("autoFocusKept");
        if (operatorWin) { operatorWin.show(); operatorWin.focus(); }
        result.projected2 = Boolean(main) && await waitText(main, "Primeiro slide do console");
        // Back on: the banner goes, and the Programa says where it is.
        result.closedCleared = await waitText(webContents, "Projeção fechada", false, 8000);
        result.onScreens = await waitFor(() => js("/^\\d+ telas?$/.test((document.querySelector('.prog-pill:not(.prev-pill) .prog-where') || {}).textContent || '')"), 8000);

        // Multiview (Programa › Multiview): the Programa as four outputs; the
        // Projeção quadrant shows what is on air and says it is on screen; a
        // quadrant's label picks another output (Pastor, in its own layout);
        // off again, the Programa is back.
        await click(".mx-toggle");
        result.mvOn = await waitFor(() => js(`[...document.querySelectorAll(".mx-tile")].map((t) => t.dataset.page).join(",") === "/Projection,/LyricProjection,/StageView,/CommunicationProjection"`));
        result.mvShows = await waitFor(() => js(`(() => { const t = document.querySelector('.mx-tile[data-page="/Projection"]'); return Boolean(t) && ((t.querySelector(".ks-text") || {}).textContent || "").includes("Primeiro slide do console") && /^em \\d+ telas?$/.test(t.querySelector(".mx-st").textContent); })()`), 8000);
        await click(".mx-tile[data-page='/LyricProjection'] .mx-pick");
        await waitFor(() => js("Boolean(document.querySelector('.console .ctx-menu[role=menu]'))"), 3000);
        await click(".console .ctx-menu button", "Pastor");
        result.mvPicked = await waitFor(() => js(`(() => { const t = document.querySelectorAll(".mx-tile")[1]; return Boolean(t) && t.dataset.page === "/PastorView" && Boolean(t.querySelector(".net-pastor")); })()`));
        await click(".mx-toggle");
        result.mvOff = await waitFor(() => js("!document.querySelector('.mx-grid') && Boolean(document.querySelector('.kx-mon.prog .ks'))"));

        // Verificar is a panel on demand now: Saídas -> "Verificar tudo".
        // Esc closes the overlay and leaves the projection alone.
        await click(".kx-status", "");
        result.outsPopover = await waitText(webContents, "Verificar tudo");
        // Top-bar popovers open under their own button, inside the window.
        result.outsAnchored = await js("(() => { const p = document.querySelector('.pop-outs'); const b = document.querySelector('.topbar .kx-status'); if (!p || !b) return false; const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect(); return pr.left >= 0 && pr.right <= innerWidth + 1 && Math.abs(pr.right - br.right) <= 2; })()");
        await click(".kx-pop button", "Verificar tudo");
        result.verify = await waitText(webContents, "SAÍDAS") && await waitText(webContents, "BÍBLIA") && await waitText(webContents, "Fechar");
        result.verifyProjector = (await bodyText(webContents)).includes("Projeção");
        await press("Escape");
        result.verifyClosed = await waitFor(() => js("!document.querySelector('.verif-overlay')")) && Boolean(live.get().content);

        // Tela ociosa: Preto leaves the projector clean after Encerrar. The
        // status click toggles, so make sure the popover really opened.
        for (let i = 0; i < 3 && !(await js("Boolean(document.querySelector('.pop-outs'))")); i += 1) { await click(".kx-status", ""); await sleep(400); }
        await click(".kx-pop .kx-seg button", "Preto");
        result.idleSet = await waitFor(() => live.get().idle === "black");
        // When the click misses, say where it went.
        if (!result.idleSet) {
            result.idleDiag = await js(`(() => {
                const b = [...document.querySelectorAll(".kx-pop .kx-seg button")].find((n) => n.textContent.includes("Preto"));
                const r = b ? b.getBoundingClientRect() : null;
                const at = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
                const name = (el) => (el ? el.tagName + "." + String(el.className || "").slice(0, 40) : null);
                return { button: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null, atCentre: name(at), atIsButton: Boolean(b && at && b.contains(at)), pops: [...document.querySelectorAll(".kx-pop, .pop, .scrim, .dialog, .verif-overlay")].map(name), win: [innerWidth, innerHeight] };
            })()`);
            result.idleDiag.idle = live.get().idle;
        }
        await press("Escape"); // closes the popover
        await press("Escape"); // ends the projection
        await waitFor(() => !live.get().content);
        result.idleBlack = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript("Boolean(document.querySelector('.ks-black')) && !document.querySelector('.ks-idle img')").catch(() => false));
        await click(".kx-status", "");
        await click(".kx-pop .kx-seg button", "Logo da igreja");
        await waitFor(() => live.get().idle === "logo");
        await press("Escape");
        // Fundo de espera: the wallpaper the operator chose is what the idle
        // projector shows, cover and without the logo on it, and the image
        // really loads; Logo brings the logo back.
        const wallUrl = String(await js("window.keryxDesktop.mediaBaseUrl")) + "bundled/backgrounds/1557672172-298e090bd0f1.webp";
        live.call("idle.set", { mode: "background", url: wallUrl });
        result.idleWall = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript(`(() => {
            const w = document.querySelector(".ks-idle-wall");
            return Boolean(w && w.style.backgroundImage.includes("1557672172-298e090bd0f1") && !document.querySelector(".ks-idle img"));
        })()`).catch(() => false));
        result.idleWallLoads = Boolean(main) && await main.webContents.executeJavaScript(`new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 0); i.onerror = () => ok(false); i.src = ${JSON.stringify(wallUrl)}; setTimeout(() => ok(false), 5000); })`).catch(() => false);
        live.call("idle.set", { mode: "logo" });
        result.idleWallOff = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript("!document.querySelector('.ks-idle-wall')").catch(() => false));
        // Transitions really animate on the projector (the class sits on a
        // display: contents wrapper; the animation is on its children), and
        // they end with the text fully visible.
        live.call("content.show", { kind: "lyrics", title: "Transição", slides: [{ text: "Primeiro" }, { text: "Segundo" }] });
        await sleep(400);
        live.call("content.next", {});
        // A lyrics slide holds its text twice (the hidden .ks-fit-probe that
        // measures the longest line, 2026-10-14): read the visible span only.
        result.slideAnimates = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript("(() => { const t = document.querySelector('.ks-text'); return Boolean(t && (t.querySelector('.ks-fit') || t).textContent === 'Segundo' && t.getAnimations().some((a) => a.animationName === 'ks-fade')); })()").catch(() => false), 1500);
        await sleep(1000);
        result.slideSettles = Boolean(main) && await main.webContents.executeJavaScript("(() => { const t = document.querySelector('.ks-text'); return Boolean(t && t.getAnimations().length === 0 && getComputedStyle(t).opacity === '1'); })()").catch(() => false);
        live.call("clear", {});
        // The transition is the theme's alone (audit 2026-10-14): the legacy
        // Aparência fields on the row stamp nothing into an item any more.
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { transition_type: "slide", transition_ms: 200 }])`);
        await sleep(600);
        await dblclick(".kx-row", "Canto do console");
        result.lookDefault = await waitFor(() => { const st = live.get().content && live.get().content.style; return Boolean(st && !st.transition && st.transition_ms == null); }, 5000);
        // No "no ar há" in the Programa's pill any more (Rodada F1); lyrics
        // keep their title there (the player does not name them).
        result.pillNoSince = await waitFor(() => js("(() => { const p = document.querySelector('.prog-pill:not(.prev-pill)'); return Boolean(p) && !/no ar há/.test(p.textContent) && ((p.querySelector('.pp-title') || {}).textContent || '') === 'Canto do console'; })()"), 5000);
        // Títulos nas telas off: the song's name leaves the Programa (and every output).
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { show_item_title: false }])`);
        result.titleHidden = await waitFor(() => js("Boolean(document.querySelector('.kx-mon .ks-text')) && !document.querySelector('.kx-mon .ks-title')"), 5000);
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { show_item_title: null }])`);
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { transition_type: null, transition_ms: null }])`);
        live.call("clear", {});
        await waitFor(() => !live.get().content);

        // The default theme (Configurações › Temas) dresses a song with no
        // look of its own when it is sent — its transition included (the only
        // place one is chosen) — and changing the theme afterwards does not
        // reskin what is on air.
        const defTheme = (await js(`window.keryxDesktop.db.call("ProjectionTheme", "create", [{ name: "Padrão Smoke", font_family: "serif", font_size: "xlarge", transition: "slide", transition_ms: 200, is_default: true }])`)).data;
        await sleep(800);
        await dblclick(".kx-row", "Canto do console");
        result.themeDefaultApplied = await waitFor(() => { const st = live.get().content && live.get().content.style; return Boolean(st && st.font_family === "serif" && st.font_size === "xlarge" && st.transition === "slide" && st.transition_ms === 200); }, 5000);
        await js(`window.keryxDesktop.db.call("ProjectionTheme", "update", [${JSON.stringify(defTheme.id)}, { font_family: "mono" }])`);
        await sleep(800);
        result.themeDefaultNoReskin = ((live.get().content || {}).style || {}).font_family === "serif";
        await js(`window.keryxDesktop.db.call("ProjectionTheme", "delete", [${JSON.stringify(defTheme.id)}])`);
        live.call("clear", {});
        await waitFor(() => !live.get().content);

        // Aparência › Fundos: a song whose background has its own dim and
        // blur goes on air with them, and the projector draws them. The
        // song's background goes to the Fundo layer (backgroundSpec.js
        // fundoOps), so it is the Fundo that carries them, and Esc keeps it.
        const BG = "1557672172-298e090bd0f1";
        const bgPref = (await js(`window.keryxDesktop.db.call("BackgroundPref", "create", [{ source: "bundled:${BG}", dim_pct: 70, blur_px: 6 }])`)).data;
        await js(`window.keryxDesktop.db.call("Song", "update", [${JSON.stringify(song.id)}, { background_image: "keryx-media://bundled/backgrounds/${BG}.webp" }])`);
        await sleep(800);
        await dblclick(".kx-row", "Canto do console");
        result.bgPrefStamped = await waitFor(() => { const b = live.get().background; const st = live.get().content && live.get().content.style; return Boolean(b && String(b.value).includes(BG) && b.dim === 0.7 && b.blur === 6 && st && !st.background_image); }, 5000);
        result.bgPrefDrawn = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript("(() => { const d = document.querySelector('.ks-bg-dim'); const i = document.querySelector('.ks-bg-img'); return Boolean(d && i && getComputedStyle(d).backgroundColor === 'rgba(0, 0, 0, 0.7)' && getComputedStyle(i).filter.startsWith('blur(')); })()").catch(() => false), 3000);
        // The Fundo on air follows its picture's settings (the library is the
        // one place for them): changing the dim there changes the screen now.
        await js(`window.keryxDesktop.db.call("BackgroundPref", "update", [${JSON.stringify(bgPref.id)}, { dim_pct: 30, fit: "contain" }])`);
        result.bgPrefFollows = await waitFor(() => { const b = live.get().background; return Boolean(b && b.dim === 0.3 && b.fit === "contain"); }, 5000);
        await js(`window.keryxDesktop.db.call("BackgroundPref", "update", [${JSON.stringify(bgPref.id)}, { dim_pct: 70, fit: "" }])`);
        await waitFor(() => (live.get().background || {}).dim === 0.7, 5000);
        live.call("clear", {});
        await waitFor(() => !live.get().content);
        result.bgSongStays = Boolean(live.get().background && String(live.get().background.value).includes(BG));
        // The idle checks below need no Fundo (the idle look shows only without one).
        live.call("background.clear", {});
        await waitFor(() => !live.get().background);

        // The idle wallpaper follows the same settings: set with no look at
        // all (as the main process does), the console puts the settings' on it,
        // the projector draws them, and editing the settings moves it.
        const bgWall = String(await js("window.keryxDesktop.mediaBaseUrl")) + `bundled/backgrounds/${BG}.webp`;
        live.call("idle.set", { mode: "background", url: bgWall });
        result.idlePrefStamped = await waitFor(() => live.get().idleDim === 0.7 && live.get().idleBlur === 6, 5000);
        result.idlePrefDrawn = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript("(() => { const w = document.querySelector('.ks-idle-wall'); const d = document.querySelector('.ks-bg-dim'); return Boolean(w && d && getComputedStyle(d).backgroundColor === 'rgba(0, 0, 0, 0.7)' && getComputedStyle(w).filter.startsWith('blur(')); })()").catch(() => false), 3000);
        await js(`window.keryxDesktop.db.call("BackgroundPref", "update", [${JSON.stringify(bgPref.id)}, { dim_pct: 30, blur_px: null }])`);
        result.idlePrefFollows = await waitFor(() => live.get().idleDim === 0.3 && live.get().idleBlur === null, 5000);
        await js(`window.keryxDesktop.db.call("BackgroundPref", "update", [${JSON.stringify(bgPref.id)}, { dim_pct: 70, blur_px: 6 }])`);
        live.call("idle.set", { mode: "logo", url: null });

        // An aviso whose picture has settings goes on air with them.
        const bgNotice = (await js(`window.keryxDesktop.db.call("CommunicationVideo", "create", [{ title: "BBB aviso fundo", type: "announcement", text: "BBB aviso fundo", background_image: "keryx-media://bundled/backgrounds/${BG}.webp" }])`)).data;
        await sleep(600);
        await click(".kx-tabs button", "Avisos");
        await waitText(webContents, "BBB aviso fundo");
        // The console in front first: this double click was lost only while
        // another program was in front (3 runs; the 0.2.19 audit traced it to
        // the injected input, not the app). If it still never reaches the
        // console with another program in front, the pair is inconclusive.
        if (operatorWin) { operatorWin.show(); operatorWin.focus(); }
        await sleep(200);
        await dblclick(".kx-row", "BBB aviso fundo");
        const noticeOnAir = await waitFor(() => Boolean(live.get().communication), 5000);
        const noticeLost = !noticeOnAir && !BrowserWindow.getFocusedWindow();
        result.noticeOnAir = noticeOnAir; // what a failure was: never on air, or on air without the look
        result.noticePrefStamped = noticeLost ? verdict("noticePrefStamped", "outro programa na frente") : noticeOnAir && await waitFor(() => { const it = live.get().communication && live.get().communication.item; return Boolean(it && it.background_dim === 0.7 && it.background_blur === 6); }, 5000);
        result.noticePrefDrawn = noticeLost ? verdict("noticePrefDrawn", "outro programa na frente") : Boolean(main) && noticeOnAir && await waitFor(() => main.webContents.executeJavaScript("(() => { const d = document.querySelector('.ks-bg-dim'); const i = document.querySelector('.ks-bg-img'); return Boolean(d && i && getComputedStyle(d).backgroundColor === 'rgba(0, 0, 0, 0.7)' && getComputedStyle(i).filter.startsWith('blur(')); })()").catch(() => false), 3000);
        live.call("clear", {});
        await waitFor(() => !live.get().communication);
        if (bgNotice && bgNotice.id) await js(`window.keryxDesktop.db.call("CommunicationVideo", "delete", [${JSON.stringify(bgNotice.id)}])`);
        await click(".kx-tabs button", "Letras");
        await js(`window.keryxDesktop.db.call("Song", "update", [${JSON.stringify(song.id)}, { background_image: "" }])`);
        if (bgPref && bgPref.id) await js(`window.keryxDesktop.db.call("BackgroundPref", "delete", [${JSON.stringify(bgPref.id)}])`);
        await sleep(800);

        // Cifras na letra: [G]Deus é [D]fiel projeta sem colchetes; o Palco
        // de verdade mostra o acorde sobre a sílaba e transpõe para G#.
        await js(`window.keryxDesktop.db.call("Song", "update", [${JSON.stringify(song.id)}, { lyrics: "[Verso]\\n[G]Deus é [D]fiel\\n[Em]Santo é [C]Ele", slides: [] }])`);
        await sleep(600);
        await dblclick(".kx-row", "Canto do console");
        result.chordStripped = await waitFor(() => { const ct = live.get().content; return Boolean(ct && ct.slides[0] && ct.slides[0].text === "Deus é fiel\nSanto é Ele" && ct.stage && Array.isArray(ct.stage.chordedSlides)); }, 5000);
        result.chordProjector = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript("(() => { const t = document.querySelector('.ks-text'); return Boolean(t && t.textContent.includes('Deus é fiel') && !t.textContent.includes('[')); })()").catch(() => false), 3000);
        await js("window.keryxDesktop.displays.open('/StageView')");
        const stageWin = await waitWindow("/StageView");
        result.chordStage = Boolean(stageWin) && await waitFor(() => stageWin.webContents.executeJavaScript("(() => { const seg = [...document.querySelectorAll('.ns-seg')].find((g) => g.querySelector('.ns-tx') && g.querySelector('.ns-tx').textContent.startsWith('Deus')); return Boolean(seg && seg.querySelector('.ns-ch') && seg.querySelector('.ns-ch').textContent === 'G'); })()").catch(() => false), 6000);
        if (stageWin) await stageWin.webContents.executeJavaScript("(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Subir meio tom'); if (b) b.click(); return true; })()").catch(() => {});
        result.chordTranspose = Boolean(stageWin) && await waitFor(() => stageWin.webContents.executeJavaScript("(() => { const seg = [...document.querySelectorAll('.ns-seg')].find((g) => g.querySelector('.ns-tx') && g.querySelector('.ns-tx').textContent.startsWith('Deus')); return Boolean(seg && seg.querySelector('.ns-ch').textContent === 'G#'); })()").catch(() => false), 4000);
        await js("window.keryxDesktop.displays.close('/StageView')");
        await js(`window.keryxDesktop.db.call("Song", "update", [${JSON.stringify(song.id)}, { lyrics: "Primeiro slide do console\\n\\nSegundo slide do console", slides: [{ text: "Primeiro slide do console" }, { text: "Segundo slide do console" }] }])`);
        live.call("clear", {});
        await waitFor(() => !live.get().content);
        await sleep(600);

        // The song on air again, then Travar telas (Saídas): nothing new goes
        // on (a double click, Enter and the main process all refuse), anything
        // can come off (Tela preta), and unlocking sends again.
        await click(".kx-row", "Canto do console");
        await press("Enter");
        result.resent = await waitFor(() => live.get().content && live.get().content.title === "Canto do console");
        await click(".kx-status", "");
        await click(".kx-pop .kx-seg button", "Travadas");
        result.locked = await waitFor(() => live.get().locked === true) && await waitText(webContents, "TELAS TRAVADAS");
        await press("Escape"); // closes the popover
        await dblclick(".kx-slide", "Segundo slide do console");
        await press("Enter");
        await sleep(400);
        result.lockKeptAir = Boolean(live.get().content) && live.get().content.index === 0 && await waitText(webContents, "Telas travadas: nada vai ao ar");
        result.lockRefusedMain = (() => { try { live.call("content.next", {}); return false; } catch (err) { return err.status === 423; } })();
        await pillClick("Tela preta", "ela preta");
        result.lockBlackWorks = await waitFor(() => live.get().screen === "black");
        await pillClick("Tela preta", "ela preta");
        await waitFor(() => live.get().screen !== "black");
        await click(".kx-banner button", "Destravar");
        result.unlocked = await waitFor(() => live.get().locked === false) && await waitText(webContents, "TELAS TRAVADAS", false);
        await dblclick(".kx-slide", "Segundo slide do console");
        result.unlockedSends = await waitFor(() => live.get().content && live.get().content.index === 1);
        // The service clock took Ensaio | Ao vivo's place in the top bar.
        result.serviceClock = await js(`(document.querySelector(".topbar .tb-svc")?.textContent || "")`);

        // Bíblia: a letter opens the quick jump; "jo 3 16" reads as João 3:16.
        await click(".envtabs button", "Bíblia");
        await waitText(webContents, "SELECIONADO");
        // Three columns (owner layout 2026-10-12): Livro · Capítulo ·
        // Versículo stacked, the text, No ar. Salmos' 150th chapter is
        // reachable inside the Capítulos card; the text keeps a usable height;
        // the page never scrolls sideways.
        await click(".bgrid .kx-book", "Sl");
        await waitFor(() => js("document.querySelectorAll('.bpick-chapters .chapters button').length === 150"));
        result.bibleNoScroll = {};
        for (const [w, h] of [[1366, 768], [1920, 1080]]) {
            if (operatorWin) operatorWin.setContentSize(w, h);
            await sleep(500);
            result.bibleNoScroll[`${w}x${h}`] = await js(`(() => {
                const mods = [...document.querySelectorAll(".console .dock .dock-group")].map((n) => n.dataset.dockMods).join(",");
                if (mods !== "books,chapters,verses,reading,air") return "módulos: " + mods;
                const g = (m) => document.querySelector('.console .dock .dock-group[data-dock-mods="' + m + '"]').getBoundingClientRect();
                if (!(g("books").right <= g("reading").left + 1 && g("reading").right <= g("air").left + 1)) return "fora de ordem";
                if (!(g("books").bottom <= g("chapters").top + 1 && g("chapters").bottom <= g("verses").top + 1)) return "pilha fora de ordem";
                const box = document.querySelector(".bpick-chapters > .kx-panel-b");
                const c150 = [...box.querySelectorAll(".chapters button")].find((b) => b.textContent === "150");
                if (!c150) return "sem 150";
                c150.scrollIntoView({ block: "nearest" });
                const cb = c150.getBoundingClientRect(), bb = box.getBoundingClientRect();
                if (!(cb.bottom <= bb.bottom + 2 && cb.top >= bb.top - 2)) return "150 fora da caixa";
                const read = document.querySelector(".bread");
                if (!read || read.getBoundingClientRect().height < 150) return "leitura baixa";
                return document.documentElement.scrollWidth <= innerWidth + 1 || "rolagem lateral";
            })()`);
        }
        // The smallest window: the columns shrink, the air column's Enviar ao
        // ar stays on screen, and the books card scrolls instead of clipping.
        if (operatorWin) operatorWin.setContentSize(960, 600);
        await sleep(500);
        result.bibleShort = await js(`(() => {
            const grid = document.querySelector(".bpick-books .bgrid");
            const send = [...document.querySelectorAll(".bible-air-col button")].find((b) => /Enviar ao ar/.test(b.textContent));
            const r = send && send.getBoundingClientRect();
            return Boolean(grid) && grid.scrollWidth <= grid.clientWidth + 1 && Boolean(r) && r.height > 0 && r.bottom <= innerHeight;
        })()`);
        if (operatorWin && size) operatorWin.setContentSize(size[0], size[1]);
        await sleep(300);
        result.bibleBandFits = Object.values(result.bibleNoScroll).every((v) => v === true);
        // The Bíblia's splitters are real (they were a fixed gap): → grows the
        // Livro · Capítulo · Versículo column, Enter restores it.
        {
            const BSPLIT = `document.querySelector(".console .dock > .dock-split > .kx-split[role='separator']")`;
            const bWidth = () => js(`(() => { const s = ${BSPLIT}; return s && s.previousElementSibling ? Math.round(s.previousElementSibling.getBoundingClientRect().width) : null; })()`);
            const focused = await js(`(() => { const s = ${BSPLIT}; if (s) s.focus(); return Boolean(s) && document.activeElement === s; })()`);
            const w0 = await bWidth();
            if (focused) { await press("ArrowRight"); await sleep(300); }
            const w1 = await bWidth();
            if (focused) { await press("Enter"); await sleep(300); }
            const w2 = await bWidth();
            await js("document.activeElement && document.activeElement.blur(); true");
            result.bibleSplit = focused && w1 > w0 && w2 === w0 ? true : focused && w1 === w0 && !BrowserWindow.getFocusedWindow() ? verdict("bibleSplit", "outro programa na frente") : { focused, w0, w1, w2 };
        }
        // A select left with the focus (a Tab, or a list closed without a
        // pick) never takes the live keys (audit C-03): "j" still opens the
        // quick jump, and the edition stays.
        const edition = await js("(() => { const s = document.querySelector('.bpick-books .bver select'); if (s) s.focus(); return s && document.activeElement === s ? s.value : null; })()");
        await press("j");
        result.quickOpened = await waitFor(() => js("Boolean(document.querySelector('.qj'))"));
        result.selectLeavesJump = edition !== null && result.quickOpened && await js(`(document.querySelector(".bpick-books .bver select") || {}).value === ${JSON.stringify(edition)}`);
        await type("o 3 16");
        result.quickRead = await js("[...document.querySelectorAll('.qj-step b')].map((n) => n.textContent).join('|')");
        // Space completed the book: the field holds the full name. The
        // synthetic char event ignores preventDefault and adds a stray
        // space a real keyboard would not; collapse whitespace.
        result.quickSpaceValue = String(await js("(document.querySelector('.qj-input input') || {}).value"));
        result.quickSpace = result.quickSpaceValue.replace(/\s+/g, " ").trim() === "João 3 16";
        result.shotBible = await shot("biblia");
        await press("Enter");
        result.quickPicked = await waitFor(() => js("!document.querySelector('.qj') && [...document.querySelectorAll('.kx-panel-h')].some((n) => n.textContent.startsWith('João 3'))"));
        // The Bible shows "No ar" only (no Prévia monitor).
        result.bibleOneMonitor = await js("document.querySelectorAll('.console .main .kx-mon').length === 1");
        // The Versículos card: the chapter's verses, the quick jump's verse
        // selected (green). Abrev | Nomes (the Livros card) switches the
        // books to their whole names and back.
        result.bibleVerseRow = await js(`(() => {
            const row = document.querySelector(".bpick-verses .bverses");
            if (!row || getComputedStyle(row).display === "none") return "dobrada";
            const cells = [...row.querySelectorAll(".verse-cells button")];
            // The cell's number; its state for screen readers rides in a .kx-sr span (#263).
            const num = (b) => { const c = b.cloneNode(true); c.querySelectorAll(".kx-sr").forEach((n) => n.remove()); return c.textContent.trim(); };
            const sel = cells.filter((b) => b.classList.contains("is-prev")).map(num);
            return cells.length === 5 && sel.join(",") === "16" ? true : { cells: cells.length, sel };
        })()`);
        await click(".bpick-books .kx-seg button", "Nomes");
        result.bibleNames = await waitFor(() => js(`(() => { const b = document.querySelector(".bpick-books .bgrid .kx-book"); return Boolean(b) && b.textContent === "Gênesis"; })()`), 3000);
        await click(".bpick-books .kx-seg button", "Abrev");
        result.bibleNamesBack = await waitFor(() => js(`(() => { const b = document.querySelector(".bpick-books .bgrid .kx-book"); return Boolean(b) && b.textContent === "Gn"; })()`), 3000);
        // One verse (Enter) goes out as the whole chapter, at that verse. The
        // Bíblia has its own theme (User.bible_theme_id): the passage goes on
        // air with its look and its background in the Fundo.
        const bibleTheme = (await js('window.keryxDesktop.db.call("ProjectionTheme", "create", [{ name: "Tema Bíblia Smoke", font_family: "georgia", background: { kind: "color", value: "#123456" } }])')).data;
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { bible_theme_id: ${JSON.stringify(bibleTheme.id)} }])`);
        await sleep(800);
        await waitFor(() => js("document.querySelectorAll('.kx-verse').length === 5"), 8000);
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Enter");
        result.chapterSent = await waitFor(() => { const c = live.get().content; return c && c.kind === "bible" && c.slides.length === 5 && c.index === 2; });
        result.chapterRef = live.get().content?.slides?.[2]?.ref;
        result.bibleThemeSent = await waitFor(() => { const b = live.get().background; const st = live.get().content && live.get().content.style; return Boolean(b && b.kind === "color" && b.value === "#123456" && st && st.font_family === "georgia"); }, 4000);
        await js('window.keryxDesktop.db.call("User", "update", ["local", { bible_theme_id: "" }])');
        await js(`window.keryxDesktop.db.call("ProjectionTheme", "delete", [${JSON.stringify(bibleTheme.id)}])`);
        live.call("background.clear", {});
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
        await click(".kx-tabs button", "Vídeos");
        result.audioListed = await waitText(webContents, "Tom de teste");
        // The YouTube link is keepable now: Salvar makes a Media row (one,
        // even saved twice) that lists under Vídeos.
        await js(`(() => {
            const el = document.querySelector(".console .yt-field input");
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "https://youtube.com/watch?v=smokeyt");
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        })()`);
        await js("(() => { const b = [...document.querySelectorAll('.console button')].find((x) => (x.title || '').startsWith('Salvar o link')); if (b) b.click(); return Boolean(b); })()");
        result.ytSaved = await waitFor(async () => {
            const rows = (await js('window.keryxDesktop.db.call("Media", "filter", [{ file_url: "https://youtube.com/watch?v=smokeyt" }])')).data || [];
            return rows.length === 1 && rows[0].type === "video";
        }, 6000);
        result.ytListed = await waitText(webContents, "Vídeo do YouTube");
        // The new row lands at the top and the list re-reads the files on
        // disk: click after the rows stop moving (a click mid-shift hit the
        // YouTube row and put it on air instead of the tone).
        {
            const rowsAt = () => js(`[...document.querySelectorAll(".kx-row")].map((n) => n.textContent.slice(0, 24) + Math.round(n.getBoundingClientRect().top)).join("|")`);
            let prev = await rowsAt();
            for (let i = 0; i < 20; i++) { await sleep(250); const now = await rowsAt(); if (now === prev) break; prev = now; }
        }
        await click(".kx-row", "Tom de teste");
        result.audioPrepared = await waitCap(PREV, "Tom de teste");
        await press("Enter");
        result.audioOn = await waitFor(() => live.get().audio && live.get().audio.title === "Tom de teste");
        result.audioUnderSong = Boolean(live.get().content) && live.get().content.title === "Canto do console";
        // Its title, no kind word (Rodada F1: the icon says it); the pill keeps
        // the song's title, which the player does not name.
        result.playerShows = await waitFor(() => js("Boolean(document.querySelector('.player:not(.is-idle)')) && document.querySelector('.player .pl-what').textContent === 'Tom de teste' && ((document.querySelector('.prog-pill:not(.prev-pill) .pp-title') || {}).textContent || '') === 'Canto do console'"));
        const meterState = () => js("document.querySelector('.player .meters') && document.querySelector('.player .meters').dataset.state");
        await waitFor(async () => (await meterState()) !== "wait", 8000);
        result.meterState = await meterState();
        result.meters = result.meterState !== "on"
            ? "sem loopback nesta máquina"
            : await waitFor(() => js("(() => { const b = [...document.querySelectorAll('.player .kx-meter b')]; return b.length === 2 && b.every((x) => parseFloat(x.style.height) > 40); })()"), 10000);
        result.duration = await waitFor(() => js("(document.querySelector('.player .pl-left small') || {}).textContent === '0:20'"), 6000);
        result.shotPlayer = await shot("player");
        // The test tone lasts 20 s and the meter checks above can take most
        // of that on a busy computer: back to the start first, so it is
        // still on air for Pausar and the volume.
        await click(".player button", "Voltar ao início");
        await waitFor(() => (live.get().audio?.playback?.position ?? 99) < 5, 3000);
        await click(".player button", "Pausar");
        result.audioPaused = await waitFor(() => live.get().audio?.playback?.paused === true);
        // Ao pausar o som (Rodada G3, 0,2 s by default): the volume comes
        // down first, then the projector's element pauses.
        result.pauseFades = live.get().audio?.playback?.ramp?.ms === 200 ? true : live.get().audio?.playback?.ramp || "sem rampa";
        result.projectorPausedAfterFade = await waitFor(() => main && main.webContents.executeJavaScript("(() => { const v = document.querySelector('video'); return v ? v.paused : null; })()").catch(() => null), 600);
        await click(".player button", "Tocar");
        await click(".player .pl-vol button", "");
        result.audioMuted = await waitFor(() => live.get().audio?.playback?.volume === 0);
        // The meters read the system output, so muting the element empties them.
        result.metersFollowVolume = result.meterState !== "on"
            ? "sem loopback nesta máquina"
            : await waitFor(() => js("[...document.querySelectorAll('.player .kx-meter b')].every((x) => parseFloat(x.style.height) < 5)"), 6000);
        // The system loopback hears every sound of the computer. When the
        // meters stay up, ask Chromium whether any KERYX window still plays:
        // none means the sound is another program's (music on the PC), and
        // the mute did reach KERYX, so the run is inconclusive, not failed.
        if (!result.metersFollowVolume) {
            result.metersAfterMute = await js("[...document.querySelectorAll('.player .kx-meter b')].map((x) => x.style.height).join(' ')");
            const audible = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.isCurrentlyAudible()).map((w) => w.webContents.getURL());
            await waitFor(() => audible().length === 0, 5000);
            result.audibleWindows = audible();
            result.metersFollowVolume = verdict("metersFollowVolume", meterVerdict(false, result.audibleWindows));
        }
        // The mute reached the element that actually plays, on the projector.
        result.projectorMuted = await waitFor(() => main && main.webContents.executeJavaScript("(() => { const v = document.querySelector('video'); return v ? v.volume === 0 : null; })()").catch(() => null));

        // The progress bar drags (Rodada F1): while the hand holds it only the
        // console moves (the elapsed time and a tip over the thumb follow it),
        // and the screens get ONE seek, on release, so the letra automática
        // never walks the slides in between. Paused, so the times are exact
        // (the tone lasts 20 s: three quarters of the bar is 0:15).
        live.call("transport", { layer: "audio", action: "pause" });
        live.call("transport", { layer: "audio", action: "seek", time: 2 });
        {
            const bar = await js(`(() => { const b = document.querySelector(".player .pl-seek.is-can"); if (!b) return null; b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); return { left: r.left, width: r.width, y: Math.round(r.top + r.height / 2) }; })()`);
            const seeks = [];
            let last = live.get().audio?.playback?.position;
            const offSeek = live.onChange((s) => { const p = s.audio && s.audio.playback; if (p && p.position !== last) { last = p.position; seeks.push(p.position); } });
            if (bar) {
                const x = (f) => Math.round(bar.left + bar.width * f);
                webContents.sendInputEvent({ type: "mouseMove", x: x(0.25), y: bar.y });
                webContents.sendInputEvent({ type: "mouseDown", x: x(0.25), y: bar.y, button: "left", clickCount: 1 });
                for (const f of [0.35, 0.5, 0.65, 0.75]) {
                    webContents.sendInputEvent({ type: "mouseMove", x: x(f), y: bar.y, modifiers: ["leftButtonDown"] });
                    await sleep(60);
                }
                result.seekDragFollows = await waitFor(() => js("(() => { const t = document.querySelector('.player .pl-seek .pl-tip'); return Boolean(t) && /^0:1[45]$/.test(t.textContent) && /^0:1[45]$/.test(document.querySelector('.player .pl-time').textContent); })()"), 3000) && seeks.length === 0;
                webContents.sendInputEvent({ type: "mouseUp", x: x(0.75), y: bar.y, button: "left", clickCount: 1 });
                await waitFor(() => seeks.length > 0, 3000);
                await sleep(400);
            }
            offSeek();
            const tipGone = await js("!document.querySelector('.player .pl-seek .pl-tip')");
            result.seekDragOnce = seeks.length === 1 && Math.abs(seeks[0] - 15) < 0.6 && tipGone ? true : { seeks, bar: Boolean(bar), tipGone };
        }

        // The Encerrar button asks first; only "Encerrar" in the dialog ends.
        // It stops the player's music too (Rodada G3, owner 2026-10-17),
        // fading it out with the screens: playing, it rides in live.leaving.
        // (Muted above: back to full, or there is nothing to hear leaving.)
        live.call("transport", { layer: "audio", action: "volume", volume: 1 });
        live.call("transport", { layer: "audio", action: "play" });
        const toneItem = live.get().audio;
        let toneLeaving = false;
        const offLeaving = live.onChange((st) => { if ((st.leaving || []).some((e) => e.layer === "audio" && e.item && e.item.url === toneItem?.url)) toneLeaving = true; });
        await pillClick("Encerrar a projeção", "Encerrar");
        result.endAsked = await waitText(webContents, "ENCERRAR A PROJEÇÃO?");
        result.endWaited = Boolean(live.get().content);
        await click(".dialog button", "Encerrar");
        result.ended = await waitFor(() => !live.get().content);
        offLeaving();
        result.audioTakenByEnd = !live.get().audio && toneLeaving ? true : { audio: Boolean(live.get().audio), leaving: toneLeaving };
        // The tone again, with nothing else on air: the player names it, so
        // the pill has no title (owner's pick A, Rodada F1), its dot still red.
        if (toneItem) live.call("audio.show", { kind: toneItem.kind, url: toneItem.url, title: toneItem.title, duration: toneItem.duration, id: toneItem.id });
        result.pillTitleInPlayer = await waitFor(() => js("(() => { const p = document.querySelector('.prog-pill:not(.prev-pill)'); return Boolean(p) && !p.querySelector('.pp-title') && p.classList.contains('is-air'); })()"), 4000);
        await click(".player button", "Parar e tirar do ar");
        result.audioStopped = await waitFor(() => !live.get().audio);
        result.pillNada = await waitCap(PROG, "Nada no ar", 4000);
        // The player is always visible under the Programa (owner's decision
        // 2026-10-13): idle it dims, it never disappears, and says nothing —
        // only its icon (Rodada F1: no "Nenhum áudio ou vídeo tocando").
        result.playerAlwaysThere = await js("(() => { const pl = document.querySelector('.pslot .player'); return Boolean(pl) && pl.className.includes('is-idle') && getComputedStyle(pl).visibility === 'visible'; })()");
        result.playerIdleQuiet = await js("(() => { const w = document.querySelector('.pslot .player .pl-what'); return Boolean(w) && w.textContent.trim() === '' && Boolean(w.querySelector('.kx-i')); })()");

        // The Linha do tempo strip is gone (owner decision 2026-10-12); the
        // top bar's service clock is what says how the service goes.
        result.tlGone = await js("!document.querySelector('.tl-panel') && !document.querySelector('.kx-tl')");
        // Camadas (owner's reviews 2026-10-14): the layers first, Temas a
        // card of its own under them (or, with that module in the tray, at
        // the end of Camadas); every layer has its pencil; the Fundo layer
        // has no options of its own (its pencil's menu changes the papel de
        // parede) and the Visual do culto is gone.
        // Camadas may be a card or the drawer at this width.
        const dayLookDrawer = await js("(() => { const b = document.querySelector('.prog-pill:not(.prev-pill) button[aria-label=\"Camadas\"]'); if (b) b.click(); return Boolean(b); })()");
        await click(".kx-layer", "Fundo");
        result.temasCard = await waitFor(() => js("(() => { const t = document.querySelector('[data-dock-mods~=\"temas\"] .tm, .layer-temas .tm'); const l = document.querySelector('.kx-layer'); return Boolean(t && l) && Boolean(l.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) && document.querySelectorAll('.kx-layer .layer-edit').length === 4 && !document.querySelector('.layerprops') && ![...document.querySelectorAll('.layerprops button, .tm-acts button')].some((b) => /Biblioteca…|Editar fundo|Visual d/.test(b.textContent)); })()"), 4000);
        if (dayLookDrawer) await js("(() => { const b = document.querySelector('.prog-pill:not(.prev-pill) button[aria-label=\"Camadas\"]'); if (b) b.click(); return true; })()");
        // No service yet: dropping a song on the Setlist (the right column,
        // under Camadas, in the wide tier) starts today's setlist.
        if (operatorWin) operatorWin.setContentSize(1600, 900);
        await sleep(400);
        await click(".kx-tabs button", "Letras");
        await waitText(webContents, "Canto do console");
        // Configurações › Culto: the day's setlist comes with the usual time,
        // and the song with the church's song length.
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { service_start_time: "18:30", duration_song: 300 }])`);
        await sleep(600);
        await js(`(() => {
            const from = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Canto do console"));
            const to = document.querySelector('[data-dock-mods~="setlist"] .rund-tail');
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
        result.cultoDefaults = svc.startTime === "18:30" && await waitFor(async () => {
            const its = (await js(`window.keryxDesktop.db.call("ServiceItem", "filter", [{ serviceId: "${svc.id}" }])`)).data || [];
            return its.some((it) => it.type === "SONG" && it.duration === 300);
        }, 4000);
        // Back to no usual time (the checks below expect the setlist as before).
        await js(`window.keryxDesktop.db.call("Service", "update", ["${svc.id}", { startTime: null }])`);
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { service_start_time: null, duration_song: null }])`);
        for (const [i, title] of ["Abertura", "Louvor"].entries()) {
            await js(`window.keryxDesktop.db.call("ServiceItem", "create", [{ serviceId: "${svc.id}", type: "TEXT", title: "${title}", order: ${i + 1}, duration: 300 }])`);
        }
        // The forecast ("termina", "passou N min") is off by default: the top
        // bar's service clock counts the service but invents no end; the
        // switch in Configurações › Culto (User.show_forecast) brings it back.
        // The setlist starts 10 minutes ago for this (then has no time again).
        const ago = new Date(Date.now() - 10 * 60000);
        const startedAt = ago.getDate() === new Date().getDate() ? `${String(ago.getHours()).padStart(2, "0")}:${String(ago.getMinutes()).padStart(2, "0")}` : "00:00";
        await js(`window.keryxDesktop.db.call("Service", "update", ["${svc.id}", { startTime: "${startedAt}" }])`);
        const svcClock = () => js("(document.querySelector('.tb-svc') || {}).textContent || ''");
        result.forecastOff = await waitFor(async () => /Culto \d+:\d\d:\d\d/.test(await svcClock()), 6000) && !/termina|passou/.test(await svcClock());
        await js('window.keryxDesktop.db.call("User", "update", ["local", { show_forecast: true }])');
        result.forecastOn = await waitFor(async () => /termina|passou/.test(await svcClock()), 6000);
        if (!result.forecastOff || !result.forecastOn) result.forecastDebug = await svcClock();
        await js('window.keryxDesktop.db.call("User", "update", ["local", { show_forecast: false }])');
        await waitFor(async () => !/termina|passou/.test(await svcClock()), 6000);
        await js(`window.keryxDesktop.db.call("Service", "update", ["${svc.id}", { startTime: null }])`);

        // Drag from the Biblioteca (synthetic DragEvents drive the handlers).
        // Wide: the Setlist is the right column's, under Camadas, full
        // height; the panel beside the Prévia holds the tabs (the console
        // audit, 2026-10-13).
        if (operatorWin) operatorWin.setContentSize(1600, 900);
        await sleep(400);
        await click(".kx-tabs button", "Letras");
        await waitText(webContents, "Canto do console");
        result.dragPrev = await js(`(() => {
            const from = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Canto do console"));
            const to = document.querySelector(".prev-panel .kx-mon");
            if (!from || !to) return "faltou " + (from ? "alvo" : "origem");
            const dt = new DataTransfer();
            from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
            to.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
            to.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
            from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
            return true;
        })()`);
        await sleep(300);
        result.dragPrepared = await waitCap(PREV, "Canto do console");
        result.dragDidNotSend = !live.get().content;
        result.dragSetlist = await js(`(() => {
            const from = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Canto do console"));
            const to = document.querySelector('[data-dock-mods~="setlist"] .rund-tail');
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
        // The default dock: Camadas over Temas over the Setlist in the right
        // column (Camadas and Temas are locked heights, so their gaps carry
        // no handle — a plain .dock-gap, 2026-10-14); under the Programa,
        // the Prévia beside the tabs panel, ending at the Programa's edge.
        result.setlistRight = await js(`(() => {
            const g = (m) => document.querySelector('.console .dock .dock-group[data-dock-mods="' + m + '"]');
            const set = g('setlist'), prog = g('programa'), prev = g('previa'), abas = g('abas');
            if (!g('camadas') || !set || !prog || !prev || !abas || !set.querySelector('.rund')) return "faltou grupo";
            const col = set.closest('.dock-split.is-col');
            const order = col ? [...col.children].map((n) => (n.classList.contains('kx-split') ? '|' : n.classList.contains('dock-gap') ? '_' : ((n.querySelector(':scope > .dock-group') || {}).dataset || {}).dockMods)).join(',') : '';
            const r = (n) => n.getBoundingClientRect();
            if (!/^camadas,[_|],temas,[_|],setlist$/.test(order)) return "ordem: " + order;
            return Math.abs(r(prev).top - r(abas).top) < 2 && r(abas).right <= r(prog).right + 1 && Boolean(abas.querySelector('.tabs-panel'));
        })()`);
        // Notas: the item prepared from the Setlist shows its notes in the
        // panel beside the Prévia (ServiceItem.notes, never on a screen).
        const tabIn = (label) => js(`(() => { const t = [...document.querySelectorAll(".tabs-panel [role=tab]")].find((x) => x.textContent === ${JSON.stringify(label)}); if (t) t.click(); return Boolean(t); })()`);
        const notedRow = ((await js(`window.keryxDesktop.db.call("ServiceItem", "filter", [{ serviceId: "${svc.id}", type: "SONG" }])`)).data || [])[0];
        if (notedRow) await js(`window.keryxDesktop.db.call("ServiceItem", "update", [${JSON.stringify(notedRow.id)}, { notes: "Nota do smoke: entrar no segundo refrão" }])`);
        await sleep(600);
        await tabIn("Notas");
        await click('[data-dock-mods~="setlist"] .rund .kx-row', "Canto do console");
        result.notesPanel = Boolean(notedRow) && await waitFor(() => js(`(document.querySelector(".tabs-panel .kx-panel-b") || {}).textContent.includes("Nota do smoke: entrar no segundo refrão")`), 5000);
        if (notedRow) await js(`window.keryxDesktop.db.call("ServiceItem", "update", [${JSON.stringify(notedRow.id)}, { notes: "" }])`);
        // The panel's (+): unchecking a tab hides it; the last one stays;
        // Restaurar abas padrão; Esc closes the list (and ends nothing).
        const panelTabs = () => js(`[...document.querySelectorAll(".tabs-panel [role=tab]")].map((x) => x.textContent).join(",")`);
        const menuItem = (label) => js(`(() => { const b = [...document.querySelectorAll(".tabs-menu .kx-menu-item")].find((x) => x.textContent.startsWith(${JSON.stringify(label)})); if (b) b.click(); return Boolean(b); })()`);
        await click('[data-tabs-plus="panel"]');
        const tabsMenuOpen = await waitFor(() => js(`Boolean(document.querySelector(".tabs-menu"))`), 3000);
        await menuItem("Aviso rápido");
        const tabsHidden = await waitFor(async () => (await panelTabs()) === "Notas,Timers", 3000);
        await menuItem("Timers");
        await sleep(200);
        await menuItem("Notas");
        await sleep(300);
        const tabsLastStays = (await panelTabs()) === "Notas";
        await menuItem("Restaurar abas padrão");
        const tabsRestored = await waitFor(async () => (await panelTabs()) === "Notas,Aviso rápido,Timers", 3000);
        await press("Escape");
        const tabsClosed = await waitFor(() => js(`!document.querySelector(".tabs-menu")`), 3000);
        result.tabsMenu = tabsMenuOpen && tabsHidden && tabsLastStays && tabsRestored && tabsClosed;
        if (!result.tabsMenu) result.tabsMenuDiag = { tabsMenuOpen, tabsHidden, tabsLastStays, tabsRestored, tabsClosed, now: await panelTabs() };
        result.layersBefore = (live.get().layerOrder || []).join(",");
        // Camadas: in the dock (over the Setlist by default), else (in the
        // tray) a drawer opened from the Programa's pill (or its "…").
        const camadasDrawer = await js("Boolean(document.querySelector('.prog-pill:not(.prev-pill) button[aria-label=\"Camadas\"]'))") && await pillClick("Camadas", "Camadas");
        result.camadasWhere = camadasDrawer ? "drawer" : "section";
        await waitFor(() => js("Boolean(document.querySelector('.kx-layer'))"), 4000);
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
        if (camadasDrawer) await click(".drawer .kx-btn", "Fechar");

        // The song editor: "+ › Nova música" opens it as a floating dialog
        // over the live console (.win-dialog, owner 2026-10-14), lyrics
        // split live into slides, Ctrl+S saves, Esc closes; "Editar" reopens
        // it with the song.
        await click(".envtabs button", "KERYX");
        await click(".kx-tabs button", "Letras");
        await click(".searchrow .addmenu button", "");
        // The + menu must be fully on screen to be clicked: with the
        // Biblioteca as the first column it once hung past the window's left
        // edge (right-anchored pop), and the real click at its negative
        // coordinates landed nowhere.
        result.edMenuOnScreen = await js(`(() => {
            const p = document.querySelector(".addmenu-pop");
            if (!p) return "menu fechado";
            const r = p.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth ? true : "fora da tela: " + Math.round(r.left) + " a " + Math.round(r.right) + " em " + innerWidth;
        })()`);
        await click(".addmenu-pop button", "Nova música");
        result.edOpen = await waitFor(() => js("Boolean(document.querySelector('.win-dialog .song-ed-l'))"));
        if (!result.edOpen) result.edOpenDiag = await js("document.body.innerText.slice(0, 300)");
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
        // A new song reopens as itself once saved (the view remounts "new" →
        // id; the URL is only read at launch, never written): Esc waits for
        // the saved song's editor — "Dados da música" instead of "Nova
        // música" — or it lands while the first one is going away.
        if (edSong) await waitFor(() => js(`[...document.querySelectorAll('.song-ed-l .kx-section')].some((n) => n.textContent.includes('Dados da música')) && (document.querySelector('.song-ed-l .kx-field input') || {}).value === 'Música do editor'`), 4000);
        await sleep(300);
        // Under load the saved song reopens late and a single Esc can land in
        // that gap: press again until the editor is really gone.
        result.edClosed = false;
        for (let i = 0; i < 3 && !result.edClosed; i += 1) {
            await press("Escape");
            result.edClosed = await waitFor(() => js("!document.querySelector('.song-ed-l')"), 4000);
        }
        result.edListed = await waitText(webContents, "Música do editor");
        await js(`(() => { const row = [...document.querySelectorAll(".kx-row")].find((n) => n.textContent.includes("Música do editor")); const b = row && [...row.querySelectorAll("button")].find((x) => x.textContent === "Editar"); if (b) b.click(); return Boolean(b); })()`);
        result.edReopen = await waitFor(() => js("(document.querySelector('.song-ed-l .kx-field input') || {}).value === 'Música do editor'"));
        // Each slide says its lines and characters; the split chosen in the
        // Letra header is saved with the song and comes back when reopened.
        result.edFit = await waitFor(() => js("[...document.querySelectorAll('.ed-th .fit')].map((n) => n.textContent).join('|') === '2 l · 18 c|2 l · 20 c'"), 3000);
        await click(".win-dialog .lines-pick button", "4 linhas");
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("s", ["control"]);
        result.edSplitSaved = await waitFor(async () => {
            const row = edSong && (await js(`window.keryxDesktop.db.call("Song", "get", ["${edSong && edSong.id}"])`)).data;
            return Boolean(row) && row.lines_per_slide === 4;
        }, 6000);
        // A slide's right-click menu (real right button): editing only. On
        // the Refrão slide, Duplicar estrofe repeats its stanza in the lyrics,
        // the song saves with three slides, and the air is not touched.
        const edAt = await js(`(() => {
            const t = document.querySelectorAll(".ed-th")[1];
            if (!t) return null;
            t.scrollIntoView({ block: "nearest" });
            const r = t.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`);
        const edAirBefore = JSON.stringify(live.get().content ? [live.get().content.startedAt, live.get().content.index] : null);
        if (edAt) {
            webContents.sendInputEvent({ type: "mouseMove", x: edAt.x, y: edAt.y });
            webContents.sendInputEvent({ type: "mouseDown", x: edAt.x, y: edAt.y, button: "right", clickCount: 1 });
            webContents.sendInputEvent({ type: "mouseUp", x: edAt.x, y: edAt.y, button: "right", clickCount: 1 });
        }
        const edMenuLabels = (await waitFor(() => js("Boolean(document.querySelector('.console .ctx-menu[role=menu]'))"), 3000))
            ? await js("[...document.querySelectorAll('.console .ctx-menu button')].map((b) => b.textContent.trim()).join('|')") : "";
        await click(".console .ctx-menu button", "Duplicar estrofe");
        const edDuplicated = await waitFor(() => js("document.querySelectorAll('.ed-th').length === 3 && ((((document.querySelector('textarea[aria-label=Letra]') || {}).value || '').match(/refrão um/g)) || []).length === 2"), 3000);
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("s", ["control"]);
        const edDupSaved = await waitFor(async () => {
            const row = edSong && (await js(`window.keryxDesktop.db.call("Song", "get", ["${edSong && edSong.id}"])`)).data;
            return Boolean(row) && row.slides?.length === 3 && row.slides[2].label === "Refrão";
        }, 6000);
        const edAirAfter = JSON.stringify(live.get().content ? [live.get().content.startedAt, live.get().content.index] : null);
        result.edSlideMenu = { labels: edMenuLabels, duplicated: edDuplicated, saved: edDupSaved, airUntouched: edAirAfter === edAirBefore };
        result.edSlideMenuOk = edMenuLabels === "Mostrar na letra|Duplicar estrofe|Dividir em dois" && edDuplicated && edDupSaved && edAirAfter === edAirBefore;
        // Choosing "2 linhas" never rewrites the lyrics (owner 2026-10-14:
        // Song.lines_per_slide is a setting, the old one-way reflow is gone):
        // the 4-row stanza re-splits into two slides and the textarea keeps
        // the exact text that was typed.
        const SPLIT_LYRICS = "[Verso]\num\ndois\ntrês\nquatro";
        const edTyped = await js(`(() => {
            const el = document.querySelector("textarea[aria-label=Letra]");
            if (!el) return "sem textarea · editor aberto: " + Boolean(document.querySelector(".win-dialog .song-ed-l"));
            const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
            set.call(el, ${JSON.stringify(SPLIT_LYRICS)});
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        })()`);
        if (edTyped === true) {
            // The split is still "4 linhas": the 4-row stanza is one slide.
            const edOneSlide = await waitFor(() => js("document.querySelectorAll('.ed-th').length === 1"));
            await click(".win-dialog .lines-pick button", "2 linhas");
            const edTwoSlides = await waitFor(() => js("document.querySelectorAll('.ed-th').length === 2"), 3000);
            const edLyricsKept = await js(`(document.querySelector("textarea[aria-label=Letra]") || {}).value === ${JSON.stringify(SPLIT_LYRICS)}`);
            result.edSplitLive = edOneSlide && edTwoSlides && edLyricsKept === true;
            if (!result.edSplitLive) result.edSplitLiveDiag = { edOneSlide, edTwoSlides, edLyricsKept };
        } else {
            result.edSplitLive = false;
            result.edSplitLiveDiag = edTyped;
        }

        // Nothing in the editor scrolls sideways at the operator widths.
        result.edNoOverflow = {};
        for (const w of [1366, 1248]) {
            if (operatorWin) operatorWin.setContentSize(w, 820);
            await sleep(400);
            result.edNoOverflow[w] = await js(`(() => {
                const sels = [".song-ed-l .kx-panel-b", ".ed-tools", ".win-bar", ".song-ed-r .kx-panel-b", ".ed-lyrics"];
                return sels.every((sel) => [...document.querySelectorAll(sel)].every((n) => n.scrollWidth <= n.clientWidth + 1));
            })()`);
        }
        result.edNoOverflowOk = Object.values(result.edNoOverflow).every(Boolean);
        if (operatorWin) operatorWin.setContentSize(1600, 900);
        await sleep(300);
        result.shotEditor = await shot("editor");
        // The editor is dirty (the split test typed over the lyrics): Esc
        // asks "Descartar as mudanças?" (Rodada C's one guard) and the
        // Descartar button discards; Esc on the question would stay.
        for (let i = 0; i < 4; i += 1) {
            const asked = await js("(() => { const b = [...document.querySelectorAll('.confirm-dialog button')].find((x) => x.textContent.trim() === 'Descartar'); if (b) b.click(); return Boolean(b); })()");
            if (!asked) await press("Escape");
            if (await waitFor(() => js("!document.querySelector('.song-ed-l')"), 3000)) break;
        }

        // The Prévia: the prepared song as Projeção shows it (the picker of
        // other outputs went with the Multiview, 2026-10-12), with its
        // Enviar ao ar pill in the corner (Rodada N5), ready to send.
        await click(".envtabs button", "KERYX");
        await click(".kx-tabs button", "Letras");
        await click(".kx-row", "Canto do console");
        await waitCap(PREV, "Canto do console");
        result.prevShows = await waitFor(() => js("(() => { const m = document.querySelector('.prev-panel .kx-mon'); const send = m && m.querySelector('.prev-pill .pv-send'); return Boolean(m && m.querySelector('.ks-text')) && !document.querySelector('.prev-panel .prev-outs') && Boolean(send) && send.getAttribute('aria-label') === 'Enviar ao ar' && !send.hasAttribute('aria-disabled'); })()"), 3000);
        await js("document.activeElement && document.activeElement.blur(); true");

        // Hover actions never reach the middle of a row, in every Biblioteca
        // list, at the column's default width and at its 260 px minimum (MODULES.lib.minW): a
        // click there prepares the item (PR #38). Measured with the actions
        // forced visible; a list with no actions on its rows passes.
        result.rowActs = await js(`(async () => {
            const st = document.createElement("style");
            st.textContent = ".kx-row .kx-row-acts{display:inline-flex !important}";
            document.head.appendChild(st);
            const panel = [...document.querySelectorAll(".kx-tabs")].map((t) => t.closest(".kx-panel")).find((p) => p && p.textContent.includes("Letras"));
            if (!panel) { st.remove(); return { error: "sem Biblioteca" }; }
            const box = panel.parentElement;
            const keep = box.getAttribute("style") || "";
            const tabs = [...panel.querySelectorAll(".kx-tabs button[role=tab]")];
            const out = {};
            for (const width of [0, 260]) {
                if (width) box.setAttribute("style", keep + ";flex:0 0 " + width + "px !important;width:" + width + "px !important;min-width:" + width + "px !important;max-width:" + width + "px !important");
                for (const b of tabs) {
                    b.click();
                    await new Promise((r) => setTimeout(r, 500));
                    const row = [...panel.querySelectorAll(".kx-row")].find((r) => r.querySelector(".kx-row-acts") && r.querySelector(".kx-row-acts").children.length);
                    const name = b.textContent.trim() + "@" + (width || "padrão");
                    if (!row) { out[name] = "sem botões"; continue; }
                    const rr = row.getBoundingClientRect();
                    const ar = row.querySelector(".kx-row-acts").getBoundingClientRect();
                    out[name] = Math.round(ar.left - (rr.left + rr.width / 2));
                }
            }
            box.setAttribute("style", keep);
            st.remove();
            const letras = tabs.find((b) => b.textContent.trim() === "Letras");
            if (letras) letras.click();
            return out;
        })()`);
        result.rowActsClear = Boolean(result.rowActs && !result.rowActs.error && Object.values(result.rowActs).every((v) => v === "sem botões" || v >= 16));

        // Right click (ContextMenu.jsx), with the real right button: on a song in
        // the Biblioteca a menu opens with "Enviar ao ar" last, after a
        // separator; the click itself prepares nothing and sends nothing; Esc
        // closes the menu (first in the Esc order) and leaves the air alone.
        const ctxAt = await js(`(() => {
            const row = [...document.querySelectorAll(".console .kx-row")].find((n) => n.textContent.includes("Canto do console"));
            if (!row) return null;
            row.scrollIntoView({ block: "nearest" });
            const r = row.getBoundingClientRect();
            return { x: Math.round(r.left + 24), y: Math.round(r.top + r.height / 2) };
        })()`);
        const ctxAirBefore = JSON.stringify(live.get().content ? [live.get().content.startedAt, live.get().content.index] : null);
        const ctxPrevBefore = await capTitle(PREV);
        if (ctxAt) {
            webContents.sendInputEvent({ type: "mouseMove", x: ctxAt.x, y: ctxAt.y });
            webContents.sendInputEvent({ type: "mouseDown", x: ctxAt.x, y: ctxAt.y, button: "right", clickCount: 1 });
            webContents.sendInputEvent({ type: "mouseUp", x: ctxAt.x, y: ctxAt.y, button: "right", clickCount: 1 });
        }
        const ctxOpened = await waitFor(() => js("Boolean(document.querySelector('.console .ctx-menu[role=menu]'))"), 3000);
        const ctxShape = ctxOpened ? await js(`(() => {
            const m = document.querySelector(".console .ctx-menu");
            const kids = [...m.children].filter((k) => !k.classList.contains("kx-menu-h"));
            const labels = kids.map((k) => (k.getAttribute("role") === "separator" ? "|" : k.textContent.trim()));
            const r = m.getBoundingClientRect();
            return { labels, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
        })()`) : null;
        await sleep(300);
        const ctxUntouched = JSON.stringify(live.get().content ? [live.get().content.startedAt, live.get().content.index] : null) === ctxAirBefore && (await capTitle(PREV)) === ctxPrevBefore;
        await press("Escape");
        const ctxClosed = await waitFor(() => js("!document.querySelector('.console .ctx-menu')"), 3000);
        const ctxAfterEsc = JSON.stringify(live.get().content ? [live.get().content.startedAt, live.get().content.index] : null) === ctxAirBefore;
        result.ctxMenu = { opened: ctxOpened, labels: ctxShape && ctxShape.labels, inside: ctxShape && ctxShape.inside, untouched: ctxUntouched, closed: ctxClosed, afterEsc: ctxAfterEsc };
        const ctxLabels = (ctxShape && ctxShape.labels) || [];
        result.ctxMenuOk = Boolean(ctxOpened && ctxShape && ctxShape.inside && ctxLabels[0] === "Pôr na prévia" && ctxLabels[ctxLabels.length - 1] === "Enviar ao ar" && ctxLabels[ctxLabels.length - 2] === "|" && ctxUntouched && ctxClosed && ctxAfterEsc);

        // Excluir… in the menu asks first (ConfirmDialog.jsx): Esc keeps the
        // song, Excluir deletes it.
        const doomed = (await js('window.keryxDesktop.db.call("Song", "create", [{ title: "Apagar smoke", lyrics: "um" }])')).data;
        await waitFor(() => js("[...document.querySelectorAll('.console .kx-row')].some((n) => n.textContent.includes('Apagar smoke'))"), 5000);
        const rightClick = async (text) => {
            const at = await js(`(() => { const row = [...document.querySelectorAll(".console .kx-row")].find((n) => n.textContent.includes(${JSON.stringify(text)})); if (!row) return null; row.scrollIntoView({ block: "nearest" }); const r = row.getBoundingClientRect(); return { x: Math.round(r.left + 24), y: Math.round(r.top + r.height / 2) }; })()`);
            if (!at) return false;
            webContents.sendInputEvent({ type: "mouseMove", x: at.x, y: at.y });
            webContents.sendInputEvent({ type: "mouseDown", x: at.x, y: at.y, button: "right", clickCount: 1 });
            webContents.sendInputEvent({ type: "mouseUp", x: at.x, y: at.y, button: "right", clickCount: 1 });
            return waitFor(() => js("Boolean(document.querySelector('.console .ctx-menu[role=menu]'))"), 3000);
        };
        const songLeft = async () => Boolean((await js(`window.keryxDesktop.db.call("Song", "get", [${JSON.stringify(doomed.id)}])`)).data);
        await rightClick("Apagar smoke");
        await click(".console .ctx-menu button", "Excluir…");
        result.deleteAsks = await waitFor(() => js("Boolean(document.querySelector('.console .confirm-dialog'))"), 3000);
        // It opens on Cancelar (audit C-10): a reflex Enter never deletes;
        // the action is a click (below) or Tab away.
        result.deleteSafeFocus = await waitFor(() => js("(document.activeElement || {}).textContent === 'Cancelar' && Boolean(document.activeElement.closest('.confirm-dialog'))"), 3000);
        await press("Escape");
        result.deleteKept = await waitFor(() => js("!document.querySelector('.console .confirm-dialog')"), 3000) && await songLeft();
        await rightClick("Apagar smoke");
        await click(".console .ctx-menu button", "Excluir…");
        await waitFor(() => js("Boolean(document.querySelector('.console .confirm-dialog'))"), 3000);
        await click(".console .confirm-dialog button", "Excluir");
        result.deleteDone = await waitFor(async () => !(await songLeft()), 4000);

        // Configurações, a window over the console: from the KERYX menu, every
        // section renders, Tela ociosa and Igreja save, Esc closes it, the X too.
        await click(".topbar .markbtn", "");
        await click(".kx-pop button", "Configurações");
        result.cfgOpen = await waitFor(() => js("Boolean(document.querySelector('.console .cfg'))"));
        // Over the console, which stays mounted behind it.
        result.cfgDialog = await js("Boolean(document.querySelector('.console .win-dialog[role=dialog] .cfg') && document.querySelector('.console .main .dock') && document.querySelector('.console .win-scrim'))");
        result.cfgSections = {};
        for (const name of ["Igreja", "Telas e saídas", "Telas na rede", "Temas e fundos", "Bíblia e músicas", "Culto", "Console", "Backup e atualizações"]) {
            await click(".console .win-dialog .kx-row", name);
            result.cfgSections[name] = await waitFor(() => js(`(() => { const h = document.querySelector(".console .cfg .kx-panel-h .kx-section"); const b = document.querySelector(".console .cfg .kx-panel-b"); return Boolean(h && h.textContent.trim().toUpperCase() === ${JSON.stringify(name.toUpperCase())} && b && b.innerText.trim().length > 0); })()`), 6000);
        }
        result.cfgAll = Object.values(result.cfgSections).every(Boolean);
        result.shotCfg = await shot("configuracoes");
        // The search beside the title: "/" goes there, words without accents
        // find a setting, Enter opens its section with the row lit, Esc clears.
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("/");
        result.cfgSearchFocus = await waitFor(() => js("document.activeElement === document.querySelector('.console .win-bar .cfg-search input')"), 3000);
        await type("fundo de espera");
        result.cfgSearchHits = await waitFor(() => js("[...document.querySelectorAll('.console .cfg-results .kx-row-title')].some((n) => n.textContent === 'Qualquer outro culto')"), 3000);
        await press("Escape");
        result.cfgSearchClear = await waitFor(() => js("Boolean(document.querySelector('.console .win-dialog')) && document.querySelector('.console .cfg-search input').value === '' && !document.querySelector('.console .cfg-results')"), 3000);
        await type("pin");
        await waitFor(() => js("Boolean(document.querySelector('.console .cfg-results .kx-row'))"), 3000);
        await press("Enter");
        result.cfgSearchJump = await waitFor(() => js("(document.querySelector('.console .cfg .kx-panel-h .kx-section') || {}).textContent === 'Telas na rede' && Boolean(document.querySelector('.console .cfg [data-cfg-k=\"PIN\"].is-flash'))"), 5000);
        // Grupos que abrem e fecham (Rodada H0): Transições starts closed in
        // Telas e saídas; a jump to a row inside it opens the group (and its
        // Por tipo de conteúdo disc), the row lit; what the operator opened
        // stays open on this computer after Configurações closes and reopens.
        await waitFor(() => js("Boolean(document.querySelector('.console .cfg .kx-panel-h .kx-section'))"), 3000);
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("/");
        await type("cronometro");
        await waitFor(() => js("Boolean(document.querySelector('.console .cfg-results .kx-row'))"), 3000);
        await press("Enter");
        result.cfgGroupJump = await waitFor(() => js("Boolean(document.querySelector('.console .cfg .cfg-group.is-open [data-cfg-k=\"Por tipo de conteúdo\"].is-flash'))"), 5000);
        const groupOpen = () => js("(() => { const b = document.querySelector('.console .cfg button.cfg-group-t[data-cfg-k=\"Transições\"]'); return b ? b.getAttribute('aria-expanded') : null; })()");
        result.cfgGroupOpened = (await groupOpen()) === "true";
        await press("Escape");
        await waitFor(() => js("!document.querySelector('.console .win-dialog')"), 4000);
        await click(".topbar .markbtn", "");
        await click(".kx-pop button", "Configurações");
        await waitFor(() => js("Boolean(document.querySelector('.console .cfg'))"), 4000);
        await click(".console .win-dialog .kx-row", "Telas e saídas");
        result.cfgGroupKeeps = await waitFor(async () => (await groupOpen()) === "true", 5000);
        // Back to its default (closed), by its header: the next checks see
        // Telas e saídas as a fresh computer does.
        await js("document.querySelector('.console .cfg button.cfg-group-t[data-cfg-k=\"Transições\"]').click(); true");
        result.cfgGroupCloses = await waitFor(async () => (await groupOpen()) === "false", 3000);
        if (!(result.cfgGroupJump && result.cfgGroupOpened && result.cfgGroupKeeps && result.cfgGroupCloses)) result.cfgGroupDiag = await js("JSON.stringify({ groups: localStorage.getItem('keryx.cfg.groups'), text: (document.querySelector('.console .win-dialog') || {}).innerText?.slice(0, 200) })");
        // Backup automático turns off and back on (settings.json, merged).
        await click(".console .win-dialog .kx-row", "Backup e atualizações");
        const autoBackup = async () => ((await js('window.keryxDesktop.system.call("info")')).data || {}).backup?.enabled;
        await waitFor(() => js("Boolean(document.querySelector('.console .cfg button[aria-label=\"Backup automático\"]'))"), 6000);
        await js("document.querySelector('.console .cfg button[aria-label=\"Backup automático\"]').click(); true");
        result.backupOff = await waitFor(async () => (await autoBackup()) === false, 5000);
        await js("document.querySelector('.console .cfg button[aria-label=\"Backup automático\"]').click(); true");
        result.backupOn = await waitFor(async () => (await autoBackup()) === true, 5000);
        if (!(result.cfgSearchFocus && result.cfgSearchHits && result.cfgSearchClear && result.cfgSearchJump)) result.cfgSearchDiag = await js("document.querySelector('.console .win-dialog').innerText.slice(0, 300)");
        await click(".console .win-dialog .kx-row", "Telas e saídas");
        result.cfgOutputs = await waitText(webContents, "Projeção");
        // Telas e saídas as thumbnails (2026-10-13): one card per output
        // with a real still of what that screen shows; the thumbs follow a
        // pref change at once (the Palco's chords, the Pastor's next list),
        // and a db write restores them.
        const cardOf = (label) => `[...document.querySelectorAll(".console .cfg .cfg-card")].find((n) => { const t = n.querySelector(".cfg-card-t"); return t && t.textContent === ${JSON.stringify(label)}; })`;
        result.cfgOutGrid = await waitFor(() => js(`document.querySelectorAll('.console .cfg .cfg-card').length >= 6 && Boolean(${cardOf("Projeção")})`), 5000);
        // Rodada H1: the Saídas group (open by default) lays its cards out
        // 3–4 across at the default window, never one per row.
        result.cfgSaidasGrid = await waitFor(() => js(`(() => { const cs = [...document.querySelectorAll('.console .cfg [aria-label="Saídas"] .cfg-card')]; if (cs.length < 2) return false; const top = cs[0].getBoundingClientRect().top; return cs.filter((n) => Math.abs(n.getBoundingClientRect().top - top) < 4).length >= 2; })()`), 5000);
        // Rodada H2: the card is lean (thumbnail, name, state, Abrir/Fechar);
        // the monitor select and Abrir ao iniciar live in the Editor's Destino.
        result.cardTrimmed = await js(`(() => { const c = ${cardOf("Projeção")}; return Boolean(c) && !c.querySelector("select") && !c.querySelector('[role="switch"]') && [...c.querySelectorAll("button")].some((b) => ["Abrir", "Fechar"].includes(b.textContent.trim())); })()`);
        // A group closed by default opens by its header (openGroup) before
        // anything inside it is clicked; Arquivo de ajustes is one of them.
        const openGroup = (title) => js(`(() => { const b = [...document.querySelectorAll('.console .cfg button.cfg-group-t')].find((x) => x.getAttribute('data-cfg-k') === ${JSON.stringify(title)}); if (b && b.getAttribute('aria-expanded') === 'false') b.click(); return Boolean(b); })()`);
        await openGroup("Arquivo de ajustes");
        result.cfgFileGroup = await waitFor(() => js(`(() => { const g = document.querySelector('.console .cfg .cfg-group.is-open[data-cfg-group="telas.arquivo"]'); return Boolean(g && [...g.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Exportar ajustes…')); })()`), 4000);
        await js("document.querySelector('.console .cfg button.cfg-group-t[data-cfg-k=\"Arquivo de ajustes\"]').click(); true"); // closed again: the default
        const stagePrefRow = async () => ((await js('window.keryxDesktop.db.call("OutputPref", "filter", [{ screen_path: "/StageView" }])')).data || [])[0] || null;
        result.palcoPrev = await waitFor(() => js(`(() => { const c = ${cardOf("Palco")}; return Boolean(c && c.querySelector(".net-stage .ns-chords")); })()`), 8000);
        const stageRow0 = await stagePrefRow();
        await js(stageRow0
            ? `window.keryxDesktop.db.call("OutputPref", "update", [${JSON.stringify(stageRow0.id)}, { options: { chords: false } }])`
            : 'window.keryxDesktop.db.call("OutputPref", "create", [{ screen_path: "/StageView", options: { chords: false } }])');
        result.palcoCifraOff = await waitFor(() => js(`(() => { const c = ${cardOf("Palco")}; return Boolean(c && c.querySelector(".net-stage") && !c.querySelector(".ns-chords")); })()`), 8000);
        { const r = await stagePrefRow(); if (r) await js(`window.keryxDesktop.db.call("OutputPref", "update", [${JSON.stringify(r.id)}, { options: {} }])`); }
        result.palcoRestored = await waitFor(() => js(`(() => { const c = ${cardOf("Palco")}; return Boolean(c && c.querySelector(".ns-chords")); })()`), 8000);
        // Every screen is landscape: the Pastor's still is a 16:9 card like
        // the others (the real /PastorView still turns with a tablet).
        result.pastorPrev = await waitFor(() => js(`(() => {
            const c = ${cardOf("Pastor")};
            const p = c && c.querySelector(".cfg-prev .np-list") && c.querySelector(".np-list").closest(".cfg-prev");
            if (!p) return false;
            const r = p.getBoundingClientRect();
            return r.height > 0 && Math.abs(r.width / r.height - 16 / 9) < 0.05;
        })()`), 8000);

        // Temas: Configurações keeps only the list; "Novo tema…" opens the
        // Editor de temas e telas as a floating dialog over Configurações
        // (.win-dialog.is-editor, owner 2026-10-14 "janelas flutuantes"; "Destacar em
        // janela" opens it in a /Janela window — the shutdown check keeps
        // covering that path), where the theme gets a name and a font with a
        // live sample, Salvar writes the row, and Esc closes back to
        // Configurações. Element clicks (not coordinates): the dialog
        // relayouts while it opens.
        const section = (title) => js(`(() => { const row = [...document.querySelectorAll(".console .win-dialog .kx-row")].find((n) => { const t = n.querySelector(".kx-row-title"); return t && t.textContent === ${JSON.stringify(title)}; }); if (row) row.click(); return Boolean(row); })()`);
        const press2 = (label) => js(`(() => { const b = [...document.querySelectorAll(".console .cfg button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return Boolean(b); })()`);
        await waitFor(() => section("Temas e fundos"), 4000); // renamed in Rodada B (2026-10-14)
        await waitFor(() => press2("Novo tema…"), 4000);
        result.themeWindow = await waitFor(() => js("Boolean(document.querySelector('.console .win-dialog.is-editor .nv-frm input.pl-input'))"), 8000);
        await js(`(() => {
            const name = document.querySelector(".win-dialog.is-editor .nv-frm input.pl-input");
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(name, "Tema Smoke");
            name.dispatchEvent(new Event("input", { bubbles: true }));
            const font = document.querySelector(".win-dialog.is-editor .nv-frm select");
            font.value = "serif"; font.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        })()`);
        result.themeSample = await waitFor(() => js("(getComputedStyle(document.querySelector('.win-dialog.is-editor .le-screen .ks-text') || document.body).fontFamily || '').includes('serif')"), 4000);
        // Unsaved: Esc asks first (Rodada C: the one guard, a "Descartar as
        // mudanças?" question in the ConfirmDialog, routed through the
        // console's ESC_ORDER "window") and keeps the page, changes and
        // all; Esc on the question answers "continuar".
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Escape");
        await sleep(400);
        result.editorLeaveAsks = await js("Boolean(document.querySelector('.console .win-dialog.is-editor')) && Boolean(document.querySelector('.confirm-dialog')) && (document.querySelector('.win-dialog.is-editor .nv-frm input.pl-input') || {}).value === 'Tema Smoke'");
        await press("Escape");
        await sleep(300);
        // A theme is saved with a background from the library (owner
        // 2026-10-14): Salvar waits for one; the Fundo's Escolher… opens the
        // console's library over the Editor dialog and a colour (Cor) is enough.
        const saveBtn = "[...document.querySelectorAll('.win-dialog.is-editor button')].find((x) => x.textContent.trim() === 'Salvar tema')";
        result.themeNeedsBg = await js(`(() => { const b = ${saveBtn}; return Boolean(b && b.disabled) && Boolean(document.querySelector('.win-dialog.is-editor .bgchip.is-missing')); })()`).catch(() => false);
        await js("(() => { const b = document.querySelector('.win-dialog.is-editor .bgchip button'); if (b) b.click(); return Boolean(b); })()");
        await waitFor(() => js("(() => { const t = [...document.querySelectorAll('.lib-tabs [role=tab]')].find((x) => x.textContent.trim() === 'Cor'); if (t) t.click(); return Boolean(t); })()"), 5000);
        await waitFor(() => js("(() => { const s = document.querySelector('.lib-swatch'); if (s) s.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return Boolean(s); })()"), 4000);
        result.themeBgPicked = await waitFor(() => js(`(() => { const b = ${saveBtn}; return !document.querySelector('.lib-dialog') && Boolean(b && !b.disabled); })()`), 4000);
        await js(`(() => { const b = ${saveBtn}; if (b) b.click(); return Boolean(b); })()`);
        result.themeSaved = await waitFor(async () => {
            const rows = (await js('window.keryxDesktop.db.call("ProjectionTheme", "filter", [{ name: "Tema Smoke" }])')).data || [];
            return rows.length === 1 && rows[0].font_family === "serif" && (rows[0].background || {}).kind === "color";
        }, 6000);
        if (!result.themeSaved) result.themeDiag = await js("(document.querySelector('.toast') || {}).textContent || document.querySelector('.win-dialog.is-editor').innerText.slice(0, 300)");
        // Saved: Esc pops clean (the dirty guard has nothing to ask) — one
        // level back, "← Temas": Configurações is the window again.
        await press("Escape");
        result.themeWindowClosed = await waitFor(() => js("!document.querySelector('.console .win-dialog.is-editor') && Boolean(document.querySelector('.console .win-dialog .cfg'))"), 5000);
        // Each screen owns its design (owner 2026-10-13): "Editar a tela…"
        // opens the Editor on that screen straight into editing (the canvas
        // seeded with the ready design, nothing "não salvo" yet), Salvar
        // writes OutputPref.design and the vertical menu lists the screens.
        await section("Telas e saídas");
        await waitFor(() => js(`(() => { const c = ${cardOf("Palco")}; const b = c && c.querySelector(".cfg-card-thumb"); if (b) b.click(); return Boolean(b); })()`), 5000);
        result.screenEditor = await waitFor(() => js("Boolean(document.querySelector('.console .win-dialog.is-editor'))"), 8000);
        const sjs = (code) => js(code);
        result.screenStraight = await waitFor(() => sjs("Boolean(document.querySelector('.win-dialog.is-editor .le-screen .le-hit')) && !/Desenhar esta tela|não salvo/.test(document.querySelector('.win-dialog.is-editor').innerText)").catch(() => false), 8000);
        // The middle column splits into Desenho | Ajustes (Rodada C, fase
        // d2): the Ajustes card only exists on its half.
        await sjs("(() => { const b = [...document.querySelectorAll('.win-dialog.is-editor [role=radio]')].find((x) => x.textContent.trim() === 'Ajustes'); if (b) b.click(); return Boolean(b); })()");
        // The Ajustes card is styled in the Editor too (.cfg): labels in a
        // column beside the controls, not stacked over them.
        result.screenCardStyled = await waitFor(() => sjs("(() => { const f = document.querySelector('.win-dialog.is-editor .nv-scroll.cfg .cfg-outprefs .frm'); return Boolean(f) && getComputedStyle(f).display === 'grid'; })()").catch(() => false), 4000);
        // Rodada H2: the Ajustes are five blocks (Destino first, with the
        // monitor select and Nome as the first input), each a .cfg-group.
        result.screenBlocks = await sjs("(() => { const g = [...document.querySelectorAll('.win-dialog.is-editor .cfg-outprefs .cfg-group')]; const t = g[0] && g[0].querySelector('.cfg-group-t'); return g.length >= 4 && Boolean(t) && t.textContent.trim() === 'Destino' && Boolean(g[0].querySelector('select[aria-label^=\"Tela de\"]')); })()").catch(() => false);
        result.screenMenu = await sjs("[...document.querySelectorAll('.win-dialog.is-editor .kx-row-title')].filter((n) => ['Projeção', 'Palco', 'Pastor', 'Transmissão'].includes(n.textContent)).length >= 4").catch(() => false);
        await sjs("(() => { const b = [...document.querySelectorAll('.win-dialog.is-editor button')].find((x) => x.textContent.trim() === 'Salvar a tela'); if (b) b.click(); return Boolean(b); })()");
        result.screenSaved = await waitFor(async () => {
            const rows = (await js('window.keryxDesktop.db.call("OutputPref", "filter", [{ screen_path: "/StageView" }])')).data || [];
            return Boolean(rows[0] && rows[0].design && Array.isArray(rows[0].design.elements) && rows[0].design.elements.length > 0 && !rows[0].layout_id);
        }, 6000);
        // Nome por saída, in the editor's Ajustes: renaming Palco reaches
        // the console's grid; clearing restores the default.
        await sjs(`(() => {
            const el = document.querySelector(".win-dialog.is-editor .cfg-outprefs input.fg-input");
            if (!el) return false;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "Telão");
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
            return true;
        })()`);
        result.outName = await waitFor(() => js(`Boolean(${cardOf("Telão")})`), 6000);
        await sjs(`(() => {
            const el = document.querySelector(".win-dialog.is-editor .cfg-outprefs input.fg-input");
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "");
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
            return true;
        })()`);
        result.outNameBack = await waitFor(() => js(`Boolean(${cardOf("Palco")})`), 6000);
        if (!result.screenSaved) result.screenDiag = await sjs("(document.querySelector('.toast') || {}).textContent || document.querySelector('.win-dialog.is-editor').innerText.slice(0, 300)").catch(() => "");
        await js('(async () => { for (const path of ["/StageView", "/Projection"]) { const rows = (await window.keryxDesktop.db.call("OutputPref", "filter", [{ screen_path: path }])).data || []; for (const r of rows) await window.keryxDesktop.db.call("OutputPref", "update", [r.id, { design: null }]); } return true; })()');
        // The design reset above may re-dirty the open editor (its saved
        // baseline moved under it): Esc until the editor page is gone,
        // answering the "Descartar as mudanças?" question when it asks
        // (Esc on the question would keep editing).
        for (let i = 0; i < 6 && await js("Boolean(document.querySelector('.console .win-dialog.is-editor'))"); i += 1) {
            const asked = await js("(() => { const b = [...document.querySelectorAll('.confirm-dialog button')].find((x) => x.textContent.trim() === 'Descartar'); if (b) b.click(); return Boolean(b); })()");
            if (!asked) await press("Escape");
            await sleep(300);
        }
        await waitFor(() => js("!document.querySelector('.console .win-dialog.is-editor')"), 5000);
        // Aparência dissolved (Rodada B 2026-10-14): the Fundos row lives in
        // Temas e fundos and opens the library to manage the backgrounds
        // (Fechar, no Usar), over Configurações.
        await section("Temas e fundos");
        result.fundosMoved = await waitFor(() => js("!document.querySelector('.console .cfg .cfg-tabs') && [...document.querySelectorAll('.console .cfg .kx-section')].some((n) => n.textContent.startsWith('Fundos'))"), 4000);
        await waitFor(() => press2("Abrir a biblioteca de fundos"), 4000);
        result.fundosInTemas = await waitFor(() => js("Boolean(document.querySelector('.console .lib-dialog')) && [...document.querySelectorAll('.lib-foot button')].some((b) => b.textContent === 'Fechar')"), 4000);
        await js("(() => { const b = [...document.querySelectorAll('.lib-foot button')].find((x) => x.textContent === 'Fechar'); if (b) b.click(); return Boolean(b); })()");
        await waitFor(() => js("!document.querySelector('.console .lib-dialog')"), 3000);
        // The Tela ociosa is a screen of the Editor de telas (owner
        // 2026-10-19, #275): its card, in Temas e fundos since Rodada H1,
        // opens it in the window, and Esc comes back to Configurações.
        await section("Temas e fundos");
        await waitFor(() => js("Boolean(document.querySelector('.console .cfg [aria-label=\"Tela ociosa\"] .cfg-card-thumb'))"), 4000);
        await click('.console .cfg [aria-label="Tela ociosa"] .cfg-card-thumb', "");
        await waitText(webContents, "Todas as telas mostram isto");
        await click(".console .cfg .kx-seg button", "Preto");
        result.cfgIdle = await waitFor(() => live.get().idle === "black");
        await click(".console .cfg .kx-seg button", "Logo da igreja");
        await waitFor(() => live.get().idle === "logo");
        await press("Escape");
        await waitFor(() => js("[...document.querySelectorAll('.console .win-dialog .kx-row .kx-row-title')].some((t) => t.textContent === 'Igreja')"), 4000);
        await click(".console .win-dialog .kx-row", "Igreja");
        await waitFor(() => js("Boolean(document.querySelector('.console .cfg input[placeholder=\"Nome da igreja\"]'))"));
        await click(".console .cfg .kx-field", "");
        await type("Igreja do Teste");
        await press("Tab");
        result.cfgChurch = await waitFor(async () => ((await js(`window.keryxDesktop.db.call("User", "get", ["local"])`)).data || {}).church_name === "Igreja do Teste", 6000);
        // The church's name shows beyond Configurações: the console's title.
        result.churchTitle = await waitFor(() => js("document.title === 'Igreja do Teste · KERYX'"), 4000);
        await js(`window.keryxDesktop.db.call("User", "update", ["local", { church_name: "" }])`);
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Escape");
        result.cfgEsc = await waitFor(() => js("!document.querySelector('.console .cfg') && Boolean(document.querySelector('.console .main .dock'))"));
        // The X closes it as well.
        await click(".topbar .markbtn", "");
        await click(".kx-pop button", "Configurações");
        await waitFor(() => js("Boolean(document.querySelector('.console .win-dialog'))"));
        // The X by its name: the bar also has "Destacar em janela" (Rodada F5),
        // first, and the first button would detach the page instead.
        await click(".console .win-bar button", "Fechar");
        result.cfgX = await waitFor(() => js("!document.querySelector('.console .win-dialog')"));

        // Camadas › Fundo: a clip from Mídia plays as the background layer;
        // the theme select applies a preset to what is on air, at once.
        const vidFile = require("node:path").join(process.env.KERYX_DATA_DIR || "", "media", "smoke-fundo.mp4");
        require("node:fs").writeFileSync(vidFile, Buffer.from("smoke-video"));
        const vidRow = (await js('window.keryxDesktop.db.call("Media", "create", [{ title: "Clipe de fundo", type: "video", file_url: "keryx-media://smoke-fundo.mp4", category: "background", duration: 0 }])')).data;
        // A background clip is the background library's, not the Biblioteca's
        // Vídeos (the libraries are separate, owner's decision 2026-10-13).
        await click(".kx-tabs button", "Vídeos");
        await sleep(600);
        result.bgNotInMedia = await js("Boolean(document.querySelector('.console .kx-tabs button.is-on')) && ![...document.querySelectorAll('.console .kx-row')].some((n) => n.textContent.includes('Clipe de fundo'))");
        await click(".kx-tabs button", "Letras");
        await waitText(webContents, "Canto do console");
        // The clip comes from the background library through the papel de
        // parede's one live door (Rodada B 2026-10-14): Camadas › Fundo's
        // pencil opens a menu whose "Trocar o papel de parede…" opens the
        // library (the Programa's header button is gone). A double click
        // takes it; with nothing on air it goes on the Fundo at once.
        const openWallpaper = async () => {
            const pencil = await js("(() => { const row = [...document.querySelectorAll('.console .kx-layer')].find((n) => n.getAttribute('aria-label') === 'Fundo'); const b = row && row.querySelector('.layer-edit'); if (b) b.click(); return Boolean(b); })()");
            if (!pencil) return false;
            await waitFor(() => js("Boolean(document.querySelector('.console .ctx-menu[role=menu]'))"), 3000);
            await click(".console .ctx-menu button", "Trocar o papel de parede");
            return waitFor(() => js("Boolean(document.querySelector('.console .lib-dialog'))"), 4000);
        };
        live.call("clear", {});
        await waitFor(() => !live.get().content);
        result.libOpen = await openWallpaper();
        await click(".lib-tabs button", "Vídeos");
        await waitFor(() => js("Boolean(document.querySelector('.lib-dialog [aria-label=\"Clipe de fundo\"]'))"), 8000);
        await dblclick(".lib-dialog .fg-tile", "Clipe de fundo");
        result.libClosed = await waitFor(() => js("!document.querySelector('.console .lib-dialog')"), 4000);
        result.bgVideoSet = await waitFor(() => { const b = live.get().background; return Boolean(b && b.kind === "video" && String(b.value).endsWith("smoke-fundo.mp4")); }, 5000);
        result.bgVideoDrawn = Boolean(main) && await waitFor(() => main.webContents.executeJavaScript("Boolean(document.querySelector('video.ks-bg-video'))").catch(() => false), 4000);
        // The clip stays on the Fundo; the culto goes back to no background of its own.
        await js('(async () => { const rows = (await window.keryxDesktop.db.call("Service", "list", [])).data || []; for (const r of rows) if (String((r.background || {}).value || "").endsWith("smoke-fundo.mp4")) await window.keryxDesktop.db.call("Service", "update", [r.id, { background: null, standby_background: "" }]); return true; })()');
        await waitFor(() => !String((live.get().defaultBackground || {}).value || "").endsWith("smoke-fundo.mp4"), 4000);
        await dblclick(".kx-row", "Canto do console");
        await waitFor(() => Boolean(live.get().content));
        const styleBefore = JSON.stringify(live.get().content.style || {});
        // Camadas › Temas (presets, ThemeStrip): a pinned theme shows as a
        // tile; a click dresses what is on air; "Salvar tema para a música"
        // ties the song on air to it and "Tirar tema da música" lets it go.
        await js('(async () => { const rows = (await window.keryxDesktop.db.call("ProjectionTheme", "filter", [{ name: "Tema Smoke" }])).data || []; for (const r of rows) await window.keryxDesktop.db.call("ProjectionTheme", "update", [r.id, { pinned: true }]); return rows.length; })()');
        await waitFor(() => js("Boolean(document.querySelector('.tm-tile[aria-label=\"Tema Smoke\"]'))"), 5000);
        // The theme has a background now (the rule above): applying it puts
        // it on the Fundo too — the owner's bug was a new theme dressing the
        // text only. The Fundo there was comes back for the padlock checks.
        const fundoBefore = live.get().background;
        await click(".tm-tile", "Tema Smoke");
        result.themeApplied = await waitFor(() => { const st = live.get().content && live.get().content.style; return Boolean(st && st.font_family === "serif"); }, 5000);
        result.themeFundo = await waitFor(() => (live.get().background || {}).kind === "color", 4000);
        // The clicked theme is the one in use — the next send keeps it,
        // without writing the culto's theme (Service.theme_id).
        await dblclick(".kx-row", "Canto do console");
        result.themeSticky = await waitFor(() => { const st = live.get().content && live.get().content.style; return Boolean(st && st.font_family === "serif"); }, 5000)
            && !((await js(`window.keryxDesktop.db.call("Service", "get", [${JSON.stringify(svc.id)}])`)).data || {}).theme_id;
        const songThemeId = async () => ((await js(`window.keryxDesktop.db.call("Song", "get", [${JSON.stringify(song.id)}])`)).data || {}).theme_id || "";
        // Temas' header + (owner 2026-10-14): the song's theme is saved and
        // cleared from its menu; the panel's body is only the 9 slots.
        const temasMenu = async (label) => {
            await js("(() => { const b = document.querySelector('[data-dock-mods~=\"temas\"] .kx-panel-h button[title^=\"Temas:\"], .layer-temas .listhead button[title^=\"Temas:\"]'); if (b) b.click(); return Boolean(b); })()");
            return waitFor(() => js(`(() => { const b = [...document.querySelectorAll(".kx-menu-item")].find((x) => x.textContent.startsWith(${JSON.stringify(label)})); if (b) b.click(); return Boolean(b); })()`), 4000);
        };
        await temasMenu("Salvar tema para a música");
        result.songThemeSaved = await waitFor(async () => Boolean(await songThemeId()), 4000);
        await temasMenu("Tirar tema da música");
        result.songThemeCleared = await waitFor(async () => !(await songThemeId()), 4000);
        result.temasSlots = await js("(() => { const g = document.querySelector('.tm-grid'); return Boolean(g) && g.children.length === 9 && !document.querySelector('.tm-song, .tm-acts'); })()").catch(() => false);
        // From here on Tema Smoke (still the theme in use) dresses the text
        // only, as before the rule, so the checks below see the Fundo they
        // set themselves: its background off (as a theme from before the
        // rule has none), the Fundo there was back on air.
        await js('(async () => { const rows = (await window.keryxDesktop.db.call("ProjectionTheme", "filter", [{ name: "Tema Smoke" }])).data || []; for (const r of rows) await window.keryxDesktop.db.call("ProjectionTheme", "update", [r.id, { background: null, background_image: "", background_generator: null }]); return true; })()');
        if (fundoBefore) live.call("background.set", fundoBefore);
        // Camadas › Texto principal › Título: Sem hides the song's name on
        // this item (the Programa, and every output), whatever Aparência says.
        // Its settings open from its pencil (owner 2026-10-14: folded until then).
        await js("(() => { const r = [...document.querySelectorAll('.kx-layer')].find((n) => n.textContent.includes('Texto principal')); const e = r && r.querySelector('.layer-edit'); if (e && e.getAttribute('aria-expanded') !== 'true') e.click(); return Boolean(e); })()");
        await waitFor(() => js("Boolean(document.querySelector('.layerprops'))"), 4000);
        await js("(() => { const k = [...document.querySelectorAll('.layerprops .k')].find((n) => n.textContent === 'Título'); const b = k && [...k.nextElementSibling.querySelectorAll('button')].find((x) => x.textContent === 'Sem'); if (b) b.click(); return Boolean(b); })()");
        result.itemTitleHidden = await waitFor(() => { const st = live.get().content && live.get().content.style; return Boolean(st && st.title === "hide"); }, 4000)
            && await waitFor(() => js("Boolean(document.querySelector('.kx-mon .ks-text')) && !document.querySelector('.kx-mon .ks-title')"), 4000);
        live.call("content.update", { style: JSON.parse(styleBefore) });
        // Camadas' padlock on the Fundo: a song sent with its own picture
        // leaves the Fundo as it is (and the projector does not paint the
        // song's picture); Destravar frees it again.
        await js(`window.keryxDesktop.db.call("Song", "update", [${JSON.stringify(song.id)}, { background_image: "keryx-media://bundled/backgrounds/1557672172-298e090bd0f1.webp" }])`);
        await sleep(600);
        await js("(() => { const row = [...document.querySelectorAll('.kx-layer')].find((n) => n.textContent.includes('Fundo')); const b = row && row.querySelector('button[aria-label^=\"Travar\"]'); if (b) b.click(); return Boolean(b); })()");
        result.fundoLocked = await waitFor(() => (live.get().lockedLayers || []).includes("background"), 4000);
        await dblclick(".kx-row", "Canto do console");
        await sleep(800);
        result.fundoHeld = result.fundoLocked && String((live.get().background || {}).value || "").endsWith("smoke-fundo.mp4");
        live.call("layers.lock", { layer: "background", locked: false });
        await waitFor(() => !(live.get().lockedLayers || []).length);
        await js(`window.keryxDesktop.db.call("Song", "update", [${JSON.stringify(song.id)}, { background_image: "" }])`);
        live.call("background.clear", {});

        // Gerados in the library (the papel de parede's door): the
        // background big and moving; Esc closes it without choosing.
        await openWallpaper();
        await click(".lib-tabs button", "Gerados");
        await js("(() => { const b = [...document.querySelectorAll('.lib-dialog .lyr-gen')].find((n) => n.textContent.includes('Aurora')); if (b) b.click(); return Boolean(b); })()");
        result.libBig = await waitFor(() => js("Boolean(document.querySelector('.lib-dialog .lib-big-screen .ks'))"), 4000);
        await press("Escape");
        result.libEscClosed = await waitFor(() => js("!document.querySelector('.console .lib-dialog')"), 2000);
        live.call("background.clear", {});

        // Papel de parede (Configurações › Culto › "Qualquer outro culto";
        // the service's wins): the console keeps it in the live state, and
        // Esc puts it on the Fundo after a song with a background of its own.
        await js('window.keryxDesktop.db.call("User", "update", ["local", { default_background: { kind: "color", value: "#203040" } }])');
        result.padraoKept = await waitFor(() => (live.get().defaultBackground || {}).value === "#203040", 5000);
        await js(`window.keryxDesktop.db.call("Song", "update", [${JSON.stringify(song.id)}, { background: { kind: "generator", value: "aurora" } }])`);
        await sleep(600);
        await dblclick(".kx-row", "Canto do console");
        await waitFor(() => (live.get().background || {}).value === "aurora", 4000);
        await press("Escape");
        result.padraoAfterEsc = await waitFor(() => !live.get().content && (live.get().background || {}).value === "#203040", 4000);
        await js(`window.keryxDesktop.db.call("Service", "update", [${JSON.stringify(svc.id)}, { background: { kind: "color", value: "#405060" } }])`);
        result.padraoService = await waitFor(() => { const d = live.get().defaultBackground || {}; return d.value === "#405060" && d.title === "Papel de parede do culto"; }, 5000)
            && await waitFor(() => (live.get().background || {}).value === "#405060", 4000);
        // Today's papel de parede through Camadas › Fundo's pencil (the one
        // live door, Rodada B 2026-10-14): the menu opens the library, the
        // choice is saved on the service and the screens follow at once.
        await openWallpaper();
        await click(".lib-tabs button", "Cor");
        await js("(() => { const b = document.querySelector('.lib-dialog .lib-colors button'); if (b) b.click(); return Boolean(b); })()");
        await click(".lib-foot button", "Usar");
        result.serviceFundoButton = await waitFor(async () => {
            const d = live.get().defaultBackground || {};
            const row = (await js(`window.keryxDesktop.db.call("Service", "get", [${JSON.stringify(svc.id)}])`)).data || {};
            return d.kind === "color" && d.title === "Papel de parede do culto" && (row.background || {}).kind === "color";
        }, 6000);
        await js(`window.keryxDesktop.db.call("Service", "update", [${JSON.stringify(svc.id)}, { background: null }])`);
        await js('window.keryxDesktop.db.call("User", "update", ["local", { default_background: null }])');
        await js(`window.keryxDesktop.db.call("Song", "update", [${JSON.stringify(song.id)}, { background: null }])`);
        await waitFor(() => !live.get().defaultBackground, 5000);
        // The culto's theme (Service.theme_id, serviceLook.js; owner's review
        // 2026-10-14): it becomes the theme in use, so the songs go with it.
        const svcTheme = (await js('window.keryxDesktop.db.call("ProjectionTheme", "create", [{ name: "Tema do culto smoke", font_family: "mono", text_color: "#abcdef" }])')).data;
        await js(`window.keryxDesktop.db.call("Service", "update", [${JSON.stringify(svc.id)}, { theme_id: ${JSON.stringify(svcTheme.id)} }])`);
        await sleep(1200);
        await dblclick(".kx-row", "Canto do console");
        result.serviceThemeSent = await waitFor(() => { const st = live.get().content && live.get().content.style; return Boolean(st && st.font_family === "mono" && st.text_color === "#abcdef"); }, 5000);
        if (!result.serviceThemeSent) result.serviceThemeDiag = JSON.stringify((live.get().content || {}).style || null);
        live.call("clear", {});
        await js(`window.keryxDesktop.db.call("Service", "update", [${JSON.stringify(svc.id)}, { theme_id: "" }])`);
        await js(`window.keryxDesktop.db.call("ProjectionTheme", "delete", [${JSON.stringify(svcTheme.id)}])`);
        live.call("background.clear", {});
        await js(`window.keryxDesktop.db.call("Media", "delete", [${JSON.stringify(vidRow.id)}])`);
        await js('(async () => { const rows = (await window.keryxDesktop.db.call("ProjectionTheme", "filter", [{ name: "Tema Smoke" }])).data || []; for (const r of rows) await window.keryxDesktop.db.call("ProjectionTheme", "delete", [r.id]); return true; })()');
        live.call("clear", {});
        await waitFor(() => !live.get().content);

        // The planner inside the console: from the Culto menu; the culto's name
        // saves on blur, a section is added and dragged to the top, the team
        // gets a member, the setlist becomes a template that keeps contentId,
        // Esc goes back and the Setlist shows the section as a header.
        await contentMenuItem("Planejar o culto");
        result.plOpen = await waitFor(() => js("Boolean(document.querySelector('.console .pl-frm'))"));
        const setVal = (selector, v) => js(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return false;
            const p = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            el.focus();
            Object.getOwnPropertyDescriptor(p, "value").set.call(el, ${JSON.stringify(v)});
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        })()`);
        await setVal(".pl-frm .kx-field input", "Culto do planejador");
        await js("document.activeElement && document.activeElement.blur(); true");
        result.plRenamed = await waitFor(async () => ((await js(`window.keryxDesktop.db.call("Service", "get", ["${svc.id}"])`)).data || {}).title === "Culto do planejador", 6000);
        result.plEnds = await waitText(webContents, "termina às");
        await click(".pl-add button", "Seção");
        await waitFor(() => js("Boolean(document.querySelector('.pl-adder input'))"));
        await setVal(".pl-adder input", "Pré-culto");
        await press("Enter");
        const itemsOf = async () => ((await js(`window.keryxDesktop.db.call("ServiceItem", "filter", [{ serviceId: "${svc.id}" }, "order"])`)).data || []);
        result.plSection = await waitFor(async () => (await itemsOf()).some((i) => i.type === "SECTION" && i.title === "Pré-culto"), 6000);
        await waitFor(() => js("Boolean(document.querySelector('.pl-sec'))"));
        result.plDrag = await js(`(() => {
            const src = document.querySelector(".pl-sec");
            const dst = document.querySelector(".pl-list .kx-row");
            if (!src || !dst || src === dst) return "sem linhas";
            const dt = new DataTransfer();
            src.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
            return true;
        })()`);
        await sleep(150);
        await js(`(() => {
            const dst = document.querySelector(".pl-list .kx-row");
            if (!dst) return false;
            const dt = new DataTransfer();
            dst.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
            dst.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
            return true;
        })()`);
        result.plMoved = await waitFor(async () => { const its = (await itemsOf()).sort((a, b) => a.order - b.order); return its[0]?.type === "SECTION"; }, 6000);
        await setVal(".pl-pad .kx-field input[list=pl-team]", "Ana Souza · Ministra");
        await press("Enter");
        result.plTeam = await waitFor(async () => { const t = ((await js(`window.keryxDesktop.db.call("Service", "get", ["${svc.id}"])`)).data || {}).worship_team || []; return t.some((m) => m.member_name === "Ana Souza" && m.role === "Ministra"); }, 6000);
        // The template actions live in the bar's Modelos menu (Rodada C, fase b).
        await click(".win-bar button", "Modelos");
        await click(".pl-pop .kx-row", "Salvar como modelo…");
        await setVal(".pl-pop .kx-field input", "Modelo do smoke");
        await click(".pl-pop button", "Salvar modelo");
        result.plTemplate = await waitFor(async () => {
            const rows = (await js(`window.keryxDesktop.db.call("ServiceTemplate", "filter", [{ name: "Modelo do smoke" }])`)).data || [];
            plTpl = rows[0] || null;
            return Boolean(plTpl) && plTpl.items[0]?.type === "SECTION" && plTpl.items.every((i) => "contentId" in i);
        }, 6000);
        result.shotPlanner = await shot("planejador");
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Escape");
        result.plClosed = await waitFor(() => js("!document.querySelector('.console .pl-frm') && Boolean(document.querySelector('.console .main .dock'))"));
        result.plRundownSection = await waitFor(() => js("[...document.querySelectorAll('.rund-sec')].some((n) => n.textContent.includes('Pré-culto'))"));

        // The media library inside the console: a lost file says so, a
        // YouTube link is added and named, the kind tabs filter, two pictures
        // play in sequence on the projector, Delete (twice) takes a row out.
        const mk = async (row) => (await js(`window.keryxDesktop.db.call("Media", "create", [${JSON.stringify(row)}])`)).data;
        mvRows.push(await mk({ title: "Arquivo sumido", type: "video", file_url: "keryx-media://nao-existe-smoke.mp4" }));
        mvRows.push(await mk({ title: "Foto um", type: "image", file_url: "keryx-media://bundled/backgrounds/1557672172-298e090bd0f1.webp", duration: 5 }));
        mvRows.push(await mk({ title: "Foto dois", type: "image", file_url: "keryx-media://bundled/backgrounds/1506905925346-21bda4d32df4.webp", duration: 5 }));
        await contentMenuItem("Mídia");
        result.mvOpen = await waitFor(() => js("Boolean(document.querySelector('.console .mv .mv-grid'))"));
        result.mvMissing = await waitFor(() => js("[...document.querySelectorAll('.mv-cell')].some((n) => n.textContent.includes('Arquivo sumido') && n.textContent.includes('Arquivo não encontrado') && n.textContent.includes('Localizar'))"), 6000);
        const thumb = async (name, modifiers = []) => {
            const at = await js(`(() => { const cell = [...document.querySelectorAll(".mv-cell")].find((n) => n.textContent.includes(${JSON.stringify(name)})); const b = cell && cell.querySelector(".mv-th"); if (!b) return null; b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
            if (!at) return false;
            webContents.sendInputEvent({ type: "mouseMove", x: at.x, y: at.y });
            webContents.sendInputEvent({ type: "mouseDown", x: at.x, y: at.y, button: "left", clickCount: 1, modifiers });
            webContents.sendInputEvent({ type: "mouseUp", x: at.x, y: at.y, button: "left", clickCount: 1, modifiers });
            await sleep(200);
            return true;
        };
        // The YouTube link comes from the bar's Adicionar menu + one question
        // (PromptDialog), not a field always on screen (Rodada C, fase b).
        await click(".win-bar button", "Adicionar");
        await click(".pl-pop .kx-row", "Link do YouTube…");
        await waitFor(() => js("Boolean(document.querySelector('.confirm-dialog .kx-field input'))"), 4000);
        await setVal(".confirm-dialog .kx-field input", "https://youtu.be/dQw4w9WgXcQ");
        await click(".confirm-dialog button", "Adicionar");
        await waitFor(() => js("Boolean(document.querySelector('.mv-rename'))"));
        await setVal(".mv-rename", "Vídeo do smoke");
        await press("Enter");
        result.mvYouTube = await waitFor(async () => {
            const rows = (await js(`window.keryxDesktop.db.call("Media", "filter", [{ title: "Vídeo do smoke" }])`)).data || [];
            if (rows[0]) mvRows.push(rows[0]);
            return Boolean(rows[0]) && /youtu/.test(rows[0].file_url);
        }, 6000);
        await click(".mv-cats button", "Imagens");
        result.mvTabs = await waitFor(() => js("(() => { const t = [...document.querySelectorAll('.mv-cell')].map((n) => n.textContent); return t.length >= 2 && t.every((x) => !x.includes('Arquivo sumido') && !x.includes('Vídeo do smoke')); })()"));
        await thumb("Foto um");
        await thumb("Foto dois", ["control"]);
        result.mvSelected = await waitFor(() => js("document.querySelectorAll('.mv-th.is-sel').length === 2"));
        await click(".mv-bar button", "Tocar todos");
        result.mvSequence = await waitFor(() => (live.get().media?.playlist || []).length === 2);
        live.call("clear");
        await click(".mv-cats button", "Todas");
        await thumb("Arquivo sumido");
        // Delete asks first (ConfirmDialog, as every Excluir does).
        await press("Delete");
        await click(".console .confirm-dialog button", "Excluir");
        result.mvDeleted = await waitFor(async () => !((await js(`window.keryxDesktop.db.call("Media", "filter", [{ title: "Arquivo sumido" }])`)).data || []).length, 6000);
        result.shotMedia = await shot("midia");
        await press("Escape");
        await press("Escape");
        result.mvClosed = await waitFor(() => js("!document.querySelector('.console .mv') && Boolean(document.querySelector('.console .main .dock'))"));

        // Apresentações (Rodada F3, "Só PDF"): a 2-page PDF made here (jspdf)
        // goes through the real Mídia file input and importMediaFiles path;
        // that registers it as made here so the five-minute cross-device
        // backfill grace period does not delay this local import;
        // the console makes its pages with pdf.js (usePagesBackfill: 2
        // pictures in the media folder, the first one the thumbnail); a double
        // click in Biblioteca › Imagens sends it as a presentation, page 1 on
        // air, drawn full screen; PageDown (what a clicker sends) turns to page 2.
        await click(".console .lib-panel [aria-label], .console [aria-label]", "Abrir a Biblioteca de mídia");
        const pdfLibraryOpened = await waitFor(() => js("Boolean(document.querySelector('.console .mv .mv-grid'))"));
        const { jsPDF } = require("jspdf");
        const pdfDoc = new jsPDF({ orientation: "landscape", unit: "pt", format: [960, 540] });
        pdfDoc.setFontSize(64);
        pdfDoc.text("Página um", 80, 280);
        pdfDoc.addPage([960, 540], "landscape");
        pdfDoc.text("Página dois", 80, 280);
        const pdfB64 = Buffer.from(pdfDoc.output("arraybuffer")).toString("base64");
        const pdfImported = pdfLibraryOpened && await js(`(() => {
            const bytes = Uint8Array.from(atob(${JSON.stringify(pdfB64)}), (ch) => ch.charCodeAt(0));
            const input = document.querySelector('.mv input[type="file"][accept*=".pdf"]');
            if (!input) return false;
            const transfer = new DataTransfer();
            transfer.items.add(new File([bytes], "PDF do smoke.pdf", { type: "application/pdf" }));
            input.files = transfer.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        })()`);
        const pdfRowReady = pdfImported ? await waitFor(async () => {
            const rows = (await js(`window.keryxDesktop.db.call("Media", "filter", [{ title: "PDF do smoke" }])`)).data || [];
            return Boolean(rows[0]);
        }, 6000) : false;
        const pdfRow = pdfRowReady ? (await js(`window.keryxDesktop.db.call("Media", "filter", [{ title: "PDF do smoke" }])`)).data?.[0] || null : null;
        mvRows.push(pdfRow);
        await press("Escape");
        await press("Escape");
        result.pdfLibraryClosed = await waitFor(() => js("!document.querySelector('.console .mv') && Boolean(document.querySelector('.console .main .dock'))"));
        result.pdfPages = Boolean(pdfRow) && await waitFor(async () => {
            const row = (await js(`window.keryxDesktop.db.call("Media", "get", [${JSON.stringify(pdfRow.id)}])`)).data;
            return row?.pages?.length === 2 && row.pages.every((p) => /^keryx-media:\/\/.+\.jpg$/.test(p.url) && p.w >= 1900) && row.thumbnail_url === row.pages[0].url;
        }, 20000);
        await click(".kx-tabs button", "Imagens");
        await waitFor(() => js("[...document.querySelectorAll('.console .kx-row')].some((n) => n.textContent.includes('PDF do smoke') && n.textContent.includes('2 páginas'))"), 6000);
        await dblclick(".kx-row", "PDF do smoke");
        result.pdfSent = await waitFor(() => {
            const c = live.get().content;
            return c?.kind === "presentation" && c.slides.length === 2 && c.index === 0 && c.slides[0].label === "Página 1" && c.ref?.mediaId === pdfRow?.id && !live.get().media;
        }, 6000);
        result.pdfDrawn = await waitFor(() => js("Boolean(document.querySelector('.prog .ks-pres img')) && !document.querySelector('.prog .ks-text')"), 4000);
        await press("PageDown");
        result.pdfNext = await waitFor(() => live.get().content?.kind === "presentation" && live.get().content.index === 1, 4000);
        live.call("clear");

        // The aviso editor: "Novo aviso", the kind "Chamar atenção" shows its
        // flag in the live preview, Ctrl+S saves; "Tocar todos" in
        // Biblioteca › Avisos goes on air and the projector moves it on.
        await contentMenuItem("Novo aviso");
        result.nvOpen = await waitFor(() => js("Boolean(document.querySelector('.console .nv-l')) && Boolean(document.querySelector('.nv-screen .ks-comm-big'))"));
        await click(".nv-l .kx-row", "Chamar atenção");
        result.nvFlag = await waitFor(() => js("Boolean(document.querySelector('.nv-screen .ks-comm-flag'))"));
        await setVal(".nv-frm .kx-field input", "Atenção do smoke");
        result.nvPreviewText = await waitFor(() => js("(document.querySelector('.nv-screen .ks-comm-t') || {}).textContent === 'Atenção do smoke'"));
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("s", ["control"]);
        result.nvSaved = await waitFor(async () => {
            const rows = (await js(`window.keryxDesktop.db.call("CommunicationVideo", "filter", [{ title: "Atenção do smoke" }])`)).data || [];
            if (rows[0] && !nvRows.some((r) => r.id === rows[0].id)) nvRows.push(rows[0]);
            return rows[0]?.type === "attention" && rows[0].sound_alert === true;
        }, 6000);
        result.shotNotice = await shot("aviso");
        await press("Escape");
        result.nvClosed = await waitFor(() => js("!document.querySelector('.console .nv-l')"));
        for (const n of [1, 2]) nvRows.push((await js(`window.keryxDesktop.db.call("CommunicationVideo", "create", [{ title: "AAA aviso ${n}", type: "announcement", text: "AAA aviso ${n}", duration: 1 }])`)).data);
        await click(".envtabs button", "KERYX");
        await click(".kx-tabs button", "Avisos");
        await waitText(webContents, "AAA aviso 2");
        await click(".kx-panel .listhead button", "Tocar todos");
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Enter");
        result.nvPlaylist = await waitFor(() => (live.get().communication?.playlist || []).length >= 3);
        result.nvAdvanced = await waitFor(() => (live.get().communication?.playlistIndex || 0) >= 1, 6000);
        live.call("clear");

        // Mensagens prontas do Aviso rápido (AlertPreset): Salvar keeps the
        // field's text as a row (and refuses it twice); a click puts it back
        // in the field without touching the screens; a double click shows it
        // at once; the cross deletes it. Wide, the Aviso rápido is a tab of
        // the panel beside the Prévia (and leaves Biblioteca › Avisos).
        const quickTab = (label) => js(`(() => { const t = [...document.querySelectorAll(".tabs-panel [role=tab]")].find((x) => x.textContent === ${JSON.stringify(label)}); if (t) t.click(); return Boolean(t); })()`);
        await quickTab("Aviso rápido");
        result.quickAlertOnce = await waitFor(() => js(`document.querySelectorAll('.console input[placeholder="Aviso para as telas"]').length === 1 && Boolean(document.querySelector('.tabs-panel input[placeholder="Aviso para as telas"]'))`), 3000);
        const presetRows = async () => ((await js(`window.keryxDesktop.db.call("AlertPreset", "list", [])`)).data || []);
        const presetChips = () => js(`[...document.querySelectorAll(".kx-preset-t")].map((b) => b.textContent)`);
        await js(`(() => { const el = document.querySelector('.console input[placeholder="Aviso para as telas"]'); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "Kids: chamar os pais da sala 2"); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
        await click("button[title*='Salvar esta mensagem']");
        result.presetKept = await waitFor(async () => (await presetRows()).some((r) => r.message === "Kids: chamar os pais da sala 2"));
        result.presetListed = await waitFor(async () => (await presetChips()).includes("Kids: chamar os pais da sala 2"));
        // Saved twice (other case and spacing): refused, still one row.
        await js(`(() => { const el = document.querySelector('.console input[placeholder="Aviso para as telas"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "  kids:  CHAMAR os pais da sala 2 "); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
        result.presetNoDup = await js(`(() => { const b = document.querySelector("button[title*='já está salva']"); return Boolean(b) && b.classList.contains("is-on"); })()`);
        // A click puts it in the field; the screens do not change.
        await js(`(() => { const el = document.querySelector('.console input[placeholder="Aviso para as telas"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
        await click(".kx-preset-t", "Kids: chamar os pais");
        result.presetFills = await waitFor(() => js(`document.querySelector('.console input[placeholder="Aviso para as telas"]').value === "Kids: chamar os pais da sala 2"`)) && !live.get().alert;
        await dblclick(".kx-preset-t", "Kids: chamar os pais");
        result.presetShown = await waitFor(() => live.get().alert && live.get().alert.message === "Kids: chamar os pais da sala 2" && live.get().alert.type === "message");
        live.call("alert.clear");
        await click(".kx-preset-x", "");
        result.presetDeleted = await waitFor(async () => !(await presetRows()).some((r) => r.message === "Kids: chamar os pais da sala 2"));
        for (const r of await presetRows()) await js(`window.keryxDesktop.db.call("AlertPreset", "delete", [${JSON.stringify(r.id)}])`).catch(() => {});

        // Timers prontos (TimerPreset): the star keeps the minutes (the five
        // built-in ones are not rows); a click prepares the timer, a double
        // click sends it, +5 min moves its end, the cross deletes the time.
        // Wide, they are the panel's Timers tab, beside the Prévia.
        const timerRows = async () => ((await js(`window.keryxDesktop.db.call("TimerPreset", "list", [])`)).data || []);
        await quickTab("Timers");
        if (!(await js(`Boolean(document.querySelector(".kx-timer-chip"))`))) await click(".kx-tool", "Timer");
        result.timerChips = await waitFor(() => js(`[...document.querySelectorAll(".kx-timer-chip .kx-preset-t")].map((b) => b.textContent).join(",") === "5 min,10 min,15 min,30 min,1 h"`));
        await js(`(() => { const el = document.querySelector('input[aria-label="Minutos"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "7"); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
        await click(".kx-tool-pick button.kx-btn-icon");
        result.timerKept = await waitFor(async () => (await timerRows()).some((r) => r.minutes === 7));
        result.timerListed = await waitFor(() => js(`[...document.querySelectorAll(".kx-timer-chip .kx-preset-t")].map((b) => b.textContent).join(",") === "5 min,7 min,10 min,15 min,30 min,1 h"`));
        await click(".kx-timer-chip .kx-preset-t", "7 min");
        result.timerPrepared = await waitCap(PREV, "Timer 7 min") && !live.get().tool;
        await dblclick(".tabs-panel .kx-timer-chip .kx-preset-t", "7 min");
        result.timerOn = await waitFor(() => live.get().tool && live.get().tool.mode === "timer" && Math.abs(live.get().tool.endsAt - live.get().tool.startedAt - 7 * 60000) < 1500);
        // A ready timer from the panel beside the Prévia went on air.
        result.quickTools = result.timerOn && await js(`Boolean(document.querySelector(".tabs-panel .kx-timer-air"))`);
        const endBefore = live.get().tool && live.get().tool.endsAt;
        await click(".kx-timer-air button", "+5 min");
        result.timerAdjusted = await waitFor(() => live.get().tool && live.get().tool.endsAt - endBefore === 300000);
        live.call("tool.clear");
        await waitFor(() => !live.get().tool);
        // The "No ar" row leaves and the chips move up: click after they settle.
        await waitFor(() => js(`!document.querySelector(".kx-timer-air")`));
        await sleep(400);
        await click(".kx-timer-chip:has(.kx-preset-x) .kx-preset-x");
        result.timerDeleted = await waitFor(async () => !(await timerRows()).some((r) => r.minutes === 7));
        for (const r of await timerRows()) await js(`window.keryxDesktop.db.call("TimerPreset", "delete", [${JSON.stringify(r.id)}])`).catch(() => {});

        // The Bíblia, the rest: word search ignoring accents and case, ↑/↓
        // through the results and Enter projecting from one (its chapter);
        // a quoted phrase; Comparar side by side; a note and a favourite as
        // BibleNote rows; the palette's "Buscar … na Bíblia".
        await click(".envtabs button", "Bíblia");
        // The Bíblia has no search field of its own (owner 2026-10-16): the
        // console's search (the palette) searches it by word — in the Bíblia
        // its first row is "Buscar … na Bíblia".
        const PALETTE = ".palette input";
        const searchBible = async (text) => {
            await js("document.activeElement && document.activeElement.blur(); true");
            await press("/");
            await waitFor(() => js(`Boolean(document.querySelector(${JSON.stringify(PALETTE)}))`));
            await setVal(PALETTE, text);
            await waitFor(() => js("[...document.querySelectorAll('.palette .kx-row')].some((n) => n.textContent.includes('na Bíblia'))"));
            await js(`document.querySelector(${JSON.stringify(PALETTE)}).focus(); true`);
            await press("Enter");
        };
        await searchBible("versiculo TESTE");
        result.bsOpen = await waitFor(() => js("Boolean(document.querySelector('.bs-bar')) && !document.querySelector('.palette')"));
        result.bsFound = await waitFor(() => js("document.querySelectorAll('.bs-hit').length === 5 && [...document.querySelectorAll('.bs-hit mark')].some((m) => m.textContent === 'versículo')"), 6000);
        await js("document.activeElement && document.activeElement.blur(); true");
        // A click on the first result selects it; ↓ walks to the next one.
        await js("document.querySelector('.bs-hit').click(); true");
        await waitFor(() => js("(document.querySelector('.bs-hit.is-prev .bs-ref') || {}).textContent === 'João 3:14'"));
        await press("ArrowDown");
        result.bsWalked = await waitFor(() => js("(document.querySelector('.bs-hit.is-prev .bs-ref') || {}).textContent === 'João 3:15'"));
        await press("Enter");
        result.bsSent = await waitFor(() => { const ct = live.get().content; return Boolean(ct && ct.ref?.wholeChapter && ct.ref.book === "João" && ct.index === 1); });
        await searchBible('"versículo 17"');
        result.bsPhrase = await waitFor(() => js("document.querySelectorAll('.bs-hit').length === 1 && document.querySelector('.bs-hit .bs-ref').textContent === 'João 3:17'"), 6000);
        result.shotSearch = await shot("biblia-busca");
        await js("document.activeElement && document.activeElement.blur(); true");
        await click(".console .main .kx-seg button", "Comparar");
        result.bcShown = await waitFor(() => js("document.querySelectorAll('.bc-head').length >= 2 && [...document.querySelectorAll('.bc-cell')].some((n) => n.textContent.includes('Texto do versículo'))"), 8000);
        result.shotCompare = await shot("biblia-comparar");
        await click(".console .main .kx-seg button", "Ler");
        await waitFor(() => js("Boolean(document.querySelector('.reading [data-verse=\"16\"]'))"));
        await js("document.querySelector('.reading [data-verse=\"16\"]').click(); true");
        result.noteBox = await waitFor(() => js("Boolean(document.querySelector('.be-note textarea')) && document.querySelector('.be-note').textContent.includes('João 3:16')"));
        await setVal(".be-note textarea", "Nota do smoke");
        await js("document.activeElement && document.activeElement.blur(); true");
        const notesOf = async (type) => ((await js(`window.keryxDesktop.db.call("BibleNote", "filter", [{ note_type: "${type}" }])`)).data || []);
        result.noteSaved = await waitFor(async () => (await notesOf("note")).some((n) => n.book === "João" && n.chapter === 3 && n.verse === 16 && n.note_text === "Nota do smoke"), 6000);
        // Marked in the reading, and listed (with its text) under Anotações.
        const verseMarked = await waitFor(() => js("Boolean(document.querySelector('.reading .kx-verse.has-note[data-verse=\"16\"]'))"));
        await click(".bband-lists .bchip", "Anotações");
        result.noteMarked = verseMarked && await waitFor(() => js("[...document.querySelectorAll('.blist-pop [data-mi]')].some((n) => n.textContent.includes('Nota do smoke'))"));
        await click(".bband-lists .bchip", "Anotações");
        await js("(() => { const b = [...document.querySelectorAll('.console .main button')].find((x) => x.getAttribute('title') === 'Favoritar'); if (b) b.click(); return Boolean(b); })()");
        result.favSaved = await waitFor(async () => (await notesOf("favorite")).some((n) => n.reference === "João 3:16"), 6000);
        await click(".bband-lists .bchip", "Favoritos");
        result.favListed = await waitFor(() => js("[...document.querySelectorAll('.blist-pop [data-mi]')].some((n) => n.textContent.includes('João 3:16'))"));
        await click(".bband-lists .bchip", "Favoritos");
        await press("/");
        await waitFor(() => js("Boolean(document.querySelector('.palette input'))"));
        await type("verso teste");
        result.paletteBible = await waitText(webContents, "na Bíblia");
        await setVal(".palette input", "versiculo teste");
        await waitFor(() => js("[...document.querySelectorAll('.palette .kx-row')].some((n) => n.textContent.includes('Buscar'))"));
        await js("(() => { const r = [...document.querySelectorAll('.palette .kx-row')].find((n) => n.textContent.includes('Buscar')); if (r) r.click(); return Boolean(r); })()");
        result.paletteSearch = await waitFor(() => js("document.querySelectorAll('.bs-hit').length === 5"), 6000);
        for (const n of [...(await notesOf("note")), ...(await notesOf("favorite"))]) if (/^João 3:16/.test(n.reference)) await js(`window.keryxDesktop.db.call("BibleNote", "delete", ["${n.id}"])`);
        live.call("clear");
        await js("document.activeElement && document.activeElement.blur(); true");
        await click(".envtabs button", "KERYX");

        // An unexpected Scripture from the KERYX environment: "/ jo 3 16",
        // Enter puts it in the Prévia without leaving the console (nothing
        // goes on air) and the palette opens centred; Shift+Enter
        // adds "jo 3 15-16" to the Setlist as a passage.
        const airBefore = JSON.stringify(live.get().content || null);
        await press("/");
        await waitFor(() => js("Boolean(document.querySelector('.palette input'))"));
        await type("jo 3 16");
        await waitFor(() => js("[...document.querySelectorAll('.palette .kx-row')].some((n) => n.textContent.includes('Abrir na Bíblia'))"));
        result.paletteClear = await js(`(() => {
            const p = document.querySelector(".palette").getBoundingClientRect();
            return Math.abs((p.left + p.right) / 2 - innerWidth / 2) <= 1 && p.left >= 0 && p.right <= innerWidth;
        })()`);
        await press("Enter");
        result.paletteRefHere = await waitFor(() => js("!document.querySelector('.palette') && [...document.querySelectorAll('.envtabs button')].some((b) => b.classList.contains('is-on') && b.textContent === 'KERYX') && [...document.querySelectorAll('.prev-panel .kx-prog-cap, .prev-panel .kx-mon')].some((n) => n.textContent.includes('João 3:16'))"), 6000)
            && JSON.stringify(live.get().content || null) === airBefore;
        await press("/");
        await waitFor(() => js("Boolean(document.querySelector('.palette input'))"));
        await type("jo 3 15-16");
        await waitFor(() => js("[...document.querySelectorAll('.palette .kx-row')].some((n) => n.textContent.includes('João 3:15'))"));
        await press("Enter", ["shift"]);
        result.paletteRefAdded = await waitFor(async () => {
            const rows = (await js(`window.keryxDesktop.db.call("ServiceItem", "filter", [{ serviceId: "${svc?.id}" }])`)).data || [];
            return rows.some((r) => r.type === "BIBLE" && r.title === "João 3:15-16");
        }, 6000);

        // Escola bíblica in the console: a student's presence for today, a
        // quiz prepared with its teacher's notes (console only), Enter sends
        // the question (one slide, its options as cards), → reveals the answer
        // on the same slide and the Revelar button hides it; a new material saved with
        // Ctrl+S; "Setlist" adds it as a MATERIAL item; Esc goes back.
        const db = async (entity, op, args) => (await js(`window.keryxDesktop.db.call(${JSON.stringify(entity)}, ${JSON.stringify(op)}, ${JSON.stringify(args)})`)).data;
        svClass = await db("BibleSchoolClass", "create", [{ name: "Turma do smoke", age_group: "adults", students: [{ name: "Ana Smoke", attendance: [] }, { name: "Bia Smoke", attendance: [] }] }]);
        svRows.push(await db("BibleMaterial", "create", [{ title: "Quiz do smoke", type: "quiz", subject: "Lição do smoke", description: "Nota do professor smoke", quiz_questions: [{ question: "Quem construiu a arca?", options: ["Moisés", "Noé"], correct: 1 }] }]));
        await contentMenuItem("Escola bíblica");
        result.svOpen = await waitFor(() => js("Boolean(document.querySelector('.console .sv-mons'))"));
        await click(".console .win-dialog .kx-row", "Turma do smoke");
        await waitText(webContents, "Ana Smoke");
        await click(".console .sv-student", "Ana Smoke");
        const today = await js("(() => { const d = new Date(); const t = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + t(d.getMonth() + 1) + '-' + t(d.getDate()); })()");
        result.svPresence = await waitFor(async () => ((await db("BibleSchoolClass", "get", [svClass.id])).students || [])[0]?.attendance?.includes(today), 6000);
        await click(".console .win-dialog .kx-row", "Quiz do smoke");
        result.svPrepared = await waitFor(() => js("[...document.querySelectorAll('.sv-mons .kx-mon')].some((n) => n.textContent.includes('Prévia · Quiz do smoke'))"));
        result.svNotes = await waitText(webContents, "Nota do professor smoke");
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Enter");
        result.svSent = await waitFor(() => { const ct = live.get().content; return Boolean(ct && ct.ref?.materialId === svRows[0].id && ct.slides.length === 1 && ct.index === 0 && ct.slides[0].label === "Pergunta" && ct.slides[0].activity?.kind === "choice"); });
        result.svNotesOffAir = live.get().content?.stage?.notes === "Nota do professor smoke"
            && !(await (main && !main.isDestroyed() ? main.webContents.executeJavaScript("document.body.innerText").catch(() => "") : "")).includes("Nota do professor smoke");
        await press("ArrowRight");
        result.svReveal = await waitFor(() => { const ct = live.get().content; return ct?.index === 0 && ct.revealed?.[0]?.step === 1 && ct.slides[0].activity.correct === 1; });
        await js("(() => { const b = document.querySelector('.console .sv-reveal-btn'); if (b) b.click(); return Boolean(b); })()");
        result.svHide = await waitFor(() => { const ct = live.get().content; return ct?.index === 0 && !ct.revealed?.[0]; });
        // The Escola floats (.win-dialog): its buttons are not under .main.
        await js("(() => { const b = [...document.querySelectorAll('.console .win-dialog button')].find((x) => x.getAttribute('title') === 'Novo material'); if (b) b.click(); return Boolean(b); })()");
        await waitFor(() => js("Boolean(document.querySelector('.sv-ed'))"));
        await setVal(".sv-ed .kx-field input", "Slides do smoke");
        await setVal(".sv-slides", "Um\n\nDois");
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("s", ["control"]);
        result.svEdited = await waitFor(async () => {
            const rows = (await db("BibleMaterial", "filter", [{ title: "Slides do smoke" }])) || [];
            if (rows[0] && !svRows.some((r) => r.id === rows[0].id)) svRows.push(rows[0]);
            return rows[0]?.slides?.length === 2 && rows[0].slides[1].text === "Dois";
        }, 6000);
        await waitFor(() => js("!document.querySelector('.sv-ed')"));
        // The Escola floats now (.win-dialog), so its rows are not under .main.
        await js("(() => { const row = [...document.querySelectorAll('.console .win-dialog .kx-row')].find((n) => n.textContent.includes('Slides do smoke')); const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent === 'Setlist'); if (b) b.click(); return Boolean(b); })()");
        result.svSetlist = await waitFor(async () => ((await db("ServiceItem", "filter", [{ type: "MATERIAL", title: "Slides do smoke" }])) || []).length === 1, 6000);
        result.shotSchool = await shot("escola");
        live.call("clear");
        await js("document.activeElement && document.activeElement.blur(); true");
        await press("Escape");
        result.svClosed = await waitFor(() => js("!document.querySelector('.console .sv-mons') && Boolean(document.querySelector('.console .main .dock'))"));

        // Relatórios: the song sent live in this run is the top song, its CCLI
        // number is in the report and Copiar puts it on the clipboard.
        if (song) await db("Song", "update", [song.id, { ccli_number: "7654321" }]);
        await contentMenuItem("Relatórios");
        result.rpOpen = await waitFor(() => js("Boolean(document.querySelector('.console .rp-grid'))"));
        result.rpTop = await waitFor(() => js("[...document.querySelectorAll('.rp-bar-l')].some((n) => n.textContent.includes('Canto do console'))"), 6000);
        result.rpCcli = await waitFor(() => js("[...document.querySelectorAll('.rp-table td')].some((n) => n.textContent === '7654321')"), 6000);
        await click(".rp button", "Copiar");
        result.rpCopied = await waitFor(async () => String((await js("navigator.clipboard.readText().catch(() => '')")) || "").includes("7654321\t"));
        result.shotReports = await shot("relatorios");
        await press("Escape");
        result.rpClosed = await waitFor(() => js("!document.querySelector('.console .rp-grid')"));

        // The operator clicks the projector (a tool window, out of Alt+Tab):
        // it takes the keyboard and its keys work there. → moves the slide,
        // B and L toggle Tela preta and the logo, Esc ends, Ctrl+W closes it.
        // Keys go to the projector's page; focus is the real one.
        let proj = windowFor("/Projection");
        if (!proj) { outputs.open("/Projection"); proj = await waitWindow("/Projection", 10000); }
        live.call("content.show", { kind: "lyrics", title: "Teclas no projetor", slides: [{ text: "Slide um das teclas" }, { text: "Slide dois das teclas" }] });
        const outKeys = {};
        if (proj) {
            const pressOn = async (k, modifiers = []) => {
                const keyCode = KEYCODE[k] || k;
                proj.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
                if (k.length === 1 && !modifiers.includes("control")) proj.webContents.sendInputEvent({ type: "char", keyCode: k, modifiers });
                proj.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
                await sleep(120);
            };
            const screenIs = async (mode) => { const ok = await waitFor(() => live.get().screen === mode, 3000); await sleep(300); return ok; };
            outKeys.shown = await waitText(proj, "Slide um das teclas");
            proj.focus();
            await waitFor(() => proj.isFocused(), 3000);
            outKeys.focus = verdict("outputKeys.focus", focusVerdict(BrowserWindow.getFocusedWindow(), proj));
            if (outKeys.focus === false) outKeys.focusedInstead = BrowserWindow.getFocusedWindow().webContents.getURL();
            await pressOn("ArrowRight");
            outKeys.next = await waitFor(() => live.get().content && live.get().content.index === 1, 3000);
            await pressOn("b");
            outKeys.black = await screenIs("black");
            await pressOn("b");
            outKeys.unblack = await screenIs("show");
            await pressOn("l");
            outKeys.logo = await screenIs("logo");
            await pressOn("l");
            outKeys.unlogo = await screenIs("show");
            await pressOn("Escape");
            outKeys.esc = await waitFor(() => !live.get().content, 3000);
            await pressOn("w", ["control"]);
            outKeys.ctrlW = await waitFor(() => !windowFor("/Projection"), 3000);
        }
        result.outputKeys = outKeys;
        result.outputKeysOk = Boolean(proj && outKeys.shown && outKeys.focus && outKeys.next && outKeys.black && outKeys.unblack
            && outKeys.logo && outKeys.unlogo && outKeys.esc && outKeys.ctrlW);
        if (operatorWin) { operatorWin.show(); operatorWin.focus(); }
    } finally {
        if (operatorWin && size) operatorWin.setContentSize(size[0], size[1]);
        live.call("clear");
        try { live.call("audio.clear"); } catch { /* nothing playing */ }
        await js(`window.keryxDesktop.db.call("Song", "delete", ["${song && song.id}"])`);
        if (tone) await js(`window.keryxDesktop.db.call("Media", "delete", ["${tone.id}"])`);
        if (edSong) await js(`window.keryxDesktop.db.call("Song", "delete", ["${edSong.id}"])`).catch(() => {});
        for (const v of [14, 15, 16, 17, 18]) await js(`window.keryxDesktop.db.call("BibleVerse", "delete", ["smoke-jo3-${v}"])`).catch(() => {});
        for (const r of svRows) if (r) await js(`window.keryxDesktop.db.call("BibleMaterial", "delete", ["${r.id}"])`).catch(() => {});
        if (svClass) await js(`window.keryxDesktop.db.call("BibleSchoolClass", "delete", ["${svClass.id}"])`).catch(() => {});
        // Keep the UI-imported PDF through the later network remote assertion.
        for (const r of mvRows) if (r && r.title !== "PDF do smoke") await js(`window.keryxDesktop.db.call("Media", "delete", ["${r.id}"])`).catch(() => {});
        for (const r of nvRows) if (r) await js(`window.keryxDesktop.db.call("CommunicationVideo", "delete", ["${r.id}"])`).catch(() => {});
        if (plTpl) await js(`window.keryxDesktop.db.call("ServiceTemplate", "delete", ["${plTpl.id}"])`).catch(() => {});
        if (svc) {
            const its = (await js(`window.keryxDesktop.db.call("ServiceItem", "filter", [{ serviceId: "${svc.id}" }])`)).data || [];
            for (const it of its) await js(`window.keryxDesktop.db.call("ServiceItem", "delete", ["${it.id}"])`);
            await js(`window.keryxDesktop.db.call("Service", "delete", ["${svc.id}"])`);
        }
        await js(`history.pushState({}, "", "/"); window.dispatchEvent(new PopStateEvent("popstate")); true`);
        if (main && !main.isDestroyed()) main.close();
        if (emulatingFocus) try { webContents.debugger.detach(); } catch { /* already gone */ }
    }
    result.inconclusive = inconclusive;
    result.ok = Boolean(result.focusKept && result.opened && result.listed && result.fullConsole
        && result.prepared && result.airUntouched && result.clickLeftNoFocus && result.tabFocused && result.focusedEnterKeptAir
        && result.sent && result.projected && result.projectorFont && result.localFontsApi && result.churchFont && result.churchFontOutput && result.prevTitle12 && result.progTitle13 && result.progOneTitle && result.progPill && result.advanced && result.barFits && result.telasChip && result.splitterKeys && result.slidesMinW && result.targets24 && result.escEnded && result.escToast && result.escUndo
        && result.dblSent && result.autoOpened && result.autoFocusKept && result.projected2
        && result.closedBanner && result.closedCleared && result.onScreens
        && result.outsPopover && result.outsAnchored && result.verify && result.verifyProjector && result.verifyClosed && result.idleSet && result.idleBlack && result.idleWall && result.idleWallLoads && result.idleWallOff && result.slideAnimates && result.slideSettles && result.lookDefault && result.pillNoSince && result.titleHidden && result.bgPrefStamped && result.bgPrefDrawn && result.idlePrefStamped && result.idlePrefDrawn && result.idlePrefFollows && result.noticePrefStamped && result.noticePrefDrawn && result.chordStripped && result.chordProjector && result.chordStage && result.chordTranspose
        && result.bgSongStays && result.libOpen && result.libClosed && result.fundoLocked && result.fundoHeld
        && result.bibleThemeSent && result.songThemeSaved && result.songThemeCleared && result.itemTitleHidden
        && result.deleteAsks && result.deleteSafeFocus && result.deleteKept && result.deleteDone && result.bgNotInMedia && result.temasCard && result.serviceThemeSent && result.bgPrefFollows
        && result.libBig && result.libEscClosed && result.padraoKept && result.padraoAfterEsc && result.padraoService && result.serviceFundoButton
        && result.resent && result.locked && result.lockKeptAir && result.lockRefusedMain && result.lockBlackWorks
        && result.unlocked && result.unlockedSends && /^Culto \d|^Sem culto|^Sem horário|^\d\d:\d\d · |^\d\d\/\d\d · \d\d:\d\d$/.test(result.serviceClock) && result.quickOpened && result.selectLeavesJump && result.quickRead === "João|3|16" && result.quickSpace && result.quickPicked && result.quickEsc
        && result.endAsked && result.endWaited && result.ended
        && result.audioListed && result.ytSaved && result.ytListed && result.audioPrepared && result.audioOn && result.audioUnderSong && result.playerShows && result.duration && result.programaMotion
        && result.audioPaused && result.audioMuted && Boolean(result.metersFollowVolume) && Boolean(result.meters) && result.projectorMuted && result.seekDragFollows && result.seekDragOnce === true && result.pauseFades === true && result.projectorPausedAfterFade && result.audioTakenByEnd === true && result.pillTitleInPlayer && result.audioStopped && result.pillNada && result.playerAlwaysThere && result.playerIdleQuiet
        && result.tlGone && result.forecastOff && result.forecastOn
        && result.dragPrev === true && result.dragPrepared && result.dragDidNotSend && result.dragSetlist === true && result.dragAdded && result.setlistRight === true && result.notesPanel && result.tabsMenu && result.quickTools && result.quickAlertOnce
        && result.colsFit && result.editBanner && result.editMove === true && result.editEsc && result.editRestore
        && (result.bibleSplit === true || typeof result.bibleSplit === "string")
        && result.noGoldRing === true && result.bibleOneMonitor && (result.bibleVerseRow === true || result.bibleVerseRow === "dobrada") && result.bibleNames && result.bibleNamesBack && result.bibleBandFits && result.bibleShort &&result.chapterSent && result.chapterRef === "João 3:16 · NVI"
        && result.arrowNextVerse && result.selMoved && result.selSent && result.slideSelMoved && result.slideSelSent
        && result.autoSetlist && result.cultoDefaults && result.autoSetlistShown && result.layerDrag === true && result.layersMoved
        && result.outputKeysOk
        && result.prevShows && result.rowActsClear
        && result.cfgOpen && result.cfgAll && result.cfgSearchFocus && result.cfgSearchHits && result.cfgSearchClear && result.cfgSearchJump && result.cfgGroupJump && result.cfgGroupOpened && result.cfgGroupKeeps && result.cfgGroupCloses && result.backupOff && result.backupOn && result.cfgOutputs && result.cfgOutGrid && result.cfgSaidasGrid && result.cfgFileGroup && result.cardTrimmed && result.screenBlocks && result.outName && result.outNameBack && result.palcoPrev && result.palcoCifraOff && result.palcoRestored && result.pastorPrev && result.themeWindow && result.themeSample && result.editorLeaveAsks && result.themeNeedsBg && result.themeBgPicked && result.themeSaved && result.themeWindowClosed && result.screenEditor && result.screenStraight && result.screenCardStyled && result.screenMenu && result.screenSaved && result.fundosInTemas && result.fundosMoved && result.bgVideoSet && result.bgVideoDrawn && result.themeApplied && result.themeFundo && result.themeSticky && result.themeDefaultApplied && result.themeDefaultNoReskin && result.cfgIdle && result.cfgChurch && result.churchTitle && result.cfgEsc && result.cfgDialog && result.cfgX && result.ctxMenuOk
        && result.edMenuOnScreen === true && result.edOpen && result.edThumbs && result.edSaved && result.edClosed && result.edListed && result.edReopen && result.edFit && result.edSplitSaved && result.edSlideMenuOk && result.edSplitLive && result.edNoOverflowOk
        && result.plOpen && result.plRenamed && result.plEnds && result.plSection && result.plDrag === true && result.plMoved && result.plTeam && result.plTemplate && result.plClosed && result.plRundownSection
        && result.mvOpen && result.mvMissing && result.mvYouTube && result.mvTabs && result.mvSelected && result.mvSequence && result.mvDeleted && result.mvClosed
        && result.pdfPages && result.pdfSent && result.pdfDrawn && result.pdfNext
        && result.nvOpen && result.nvFlag && result.nvPreviewText && result.nvSaved && result.nvClosed && result.nvPlaylist && result.nvAdvanced && result.presetKept && result.presetListed && result.presetNoDup && result.presetFills && result.presetShown && result.presetDeleted && result.timerChips && result.timerKept && result.timerListed && result.timerPrepared && result.timerOn && result.timerAdjusted && result.timerDeleted && result.mvOn && result.mvShows && result.mvPicked && result.mvOff
        && result.bsOpen && result.bsFound && result.bsWalked && result.bsSent && result.bsPhrase && result.bcShown
        && result.noteBox && result.noteSaved && result.noteMarked && result.favSaved && result.favListed && result.paletteBible && result.paletteSearch && result.paletteClear && result.paletteRefHere && result.paletteRefAdded
        && result.svOpen && result.svPresence && result.svPrepared && result.svNotes && result.svSent && result.svNotesOffAir && result.svReveal && result.svHide && result.svEdited && result.svSetlist && result.svClosed
        && result.rpOpen && result.rpTop && result.rpCcli && result.rpCopied && result.rpClosed);
    return result;
}

// A tablet on the network: a plain browser window (no preload, no desktop
// bridge) opening screen pages from the LAN server, fed by store changes.
async function checkNetwork({ network, live, videoFile, webContents }) {
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
        // A screen on the network gets the same Geist from the KERYX computer
        // (dist/assets), so its lines break as on the projector.
        result.lanFont = await lyrics.webContents.executeJavaScript(`(async () => {
            const faces = await document.fonts.load("40px Geist");
            const remote = performance.getEntriesByType("resource").some((e) => /googleapis|gstatic/.test(e.name));
            const local = performance.getEntriesByType("resource").some((e) => /\\/assets\\/Geist-Variable[^/]*\\.woff2$/.test(new URL(e.name).pathname));
            return faces.length > 0 && local && !remote;
        })()`).catch(() => false);
        live.call("content.goTo", { index: 1 });
        result.stage = await waitFor(stage, "Segunda linha da letra");
        result.stageChords = (await textOf(stage)).includes("Sol maior");
        result.lyricsAdvanced = await waitFor(lyrics, "Segunda linha da letra");
        const projectorTablet = tablet();
        await projectorTablet.loadURL(`${base}/Projection`);
        result.projectorScreen = await waitFor(projectorTablet, "Segunda linha da letra");
        await projectorTablet.loadURL(`${base}/PastorView`);
        result.pastorScreen = await waitFor(projectorTablet, "Segunda linha da letra");
        // Transmissão (an OBS Browser Source): the slide as a lower third on
        // a transparent page; Tela preta clears it.
        await projectorTablet.loadURL(`${base}/StreamView`);
        result.streamScreen = await waitFor(projectorTablet, "Segunda linha da letra")
            && await projectorTablet.webContents.executeJavaScript(`getComputedStyle(document.body).backgroundColor === "rgba(0, 0, 0, 0)" && getComputedStyle(document.documentElement).colorScheme === "normal"`).catch(() => false);
        live.call("screen.set", { mode: "black" });
        await sleep(500);
        result.streamBlack = !(await textOf(projectorTablet)).includes("Segunda linha da letra");
        live.call("screen.set", { mode: "show" });
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

        await lyrics.loadURL(`${base}/Console`);
        result.operatorPageBlocked = (await textOf(lyrics)).includes("computador do operador");

        await network.ops.setPin(null, "2468");
        const locked = tablet();
        await locked.loadURL(`${base}/StageView`);
        result.pinForm = (await textOf(locked)).includes("PIN") && locked.webContents.getURL().includes("/lan/pin");
        locked.close();
        await network.ops.setPin(null, "");

        // Controle remoto, end to end: off it is not there; on, its code signs
        // a phone in; a command runs on the console (Tela preta reaches the
        // live state); locked screens refuse a new slide; off again, gone.
        if (webContents) {
            const remoteOff = (await fetch(`${base}/Remote`, { redirect: "manual" })).status;
            await network.ops.setRemote(null, true);
            const { code } = await network.ops.revealRemoteCode();
            const signIn = await fetch(`${base}/lan/remote-code`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `code=${code}` });
            const cookie = (signIn.headers.get("set-cookie") || "").split(";")[0];
            const cmd = (action, args) => fetch(`${base}/api/remote`, { method: "POST", headers: { "content-type": "application/json", "x-keryx": "1", cookie }, body: JSON.stringify({ action, args }) });
            live.call("screen.set", { mode: "show" });
            const black = await cmd("black");
            result.remote = { off: remoteOff, signedIn: signIn.status, black: black.status, screen: live.get().screen };
            await cmd("black");
            const st = await (await cmd("state")).json().catch(() => ({}));
            result.remote.state = Boolean(st.data && st.data.result && Array.isArray(st.data.result.items));
            // A Setlist item sent from the phone goes on air through the console:
            // a text item added to the service the phone sees, then sent.
            let sid = st.data && st.data.result && st.data.result.serviceId;
            let reopened = false;
            if (!sid) {
                // No service chosen (a check before reloaded the console):
                // open the console on one, as ?planner= does.
                const day = new Date();
                const svc = (await webContents.executeJavaScript(`window.keryxDesktop.db.call("Service", "create", [{ title: "Culto do celular", date: "${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}", status: "DRAFT" }])`)).data;
                const back = webContents.getURL();
                const u = new URL(back);
                u.search = `?planner=${svc.id}`;
                await webContents.loadURL(u.toString());
                reopened = back;
                const until = Date.now() + 10000;
                while (Date.now() < until && !sid) {
                    await sleep(500);
                    const again = await (await cmd("state")).json().catch(() => ({}));
                    sid = again.data && again.data.result && again.data.result.serviceId;
                }
            }
            if (sid) {
                const row = (await webContents.executeJavaScript(`window.keryxDesktop.db.call("ServiceItem", "create", [{ serviceId: ${JSON.stringify(sid)}, type: "TEXT", title: "Item do celular", notes: "Item do celular", order: 99, duration: 60 }])`)).data;
                let sent = { status: 0 };
                const until = Date.now() + 6000;
                while (Date.now() < until) { sent = await cmd("sendItem", { itemId: row.id }); if (sent.status === 200) break; await sleep(400); }
                result.remote.sendItem = sent.status === 200 && ((live.get().content || {}).title || "") === "Item do celular";
                // Version 2 (Rodada G6 PR2b): state in its v2 shape, a library
                // page, a song sent from it, the operator's Prévia kept while
                // the phone sends something else, and Desfazer after Encerrar.
                const cmd2 = (action, args) => fetch(`${base}/api/remote`, { method: "POST", headers: { "content-type": "application/json", "x-keryx": "1", cookie }, body: JSON.stringify({ v: 2, action, args }) });
                const body = async (res) => (await res.json().catch(() => ({})))?.data?.result;
                const st2 = await body(await cmd2("state"));
                result.remote.v2 = st2?.v === 2 && Array.isArray(st2.caps) && st2.caps.includes("library") && st2.service?.id === sid;
                const prevBadge = `(document.querySelector(".prev-panel .kx-mon-badge") || {}).textContent || ""`;
                const clicked = await webContents.executeJavaScript(`(() => { const r = [...document.querySelectorAll("[data-sort-row]")].find((n) => n.textContent.includes("Item do celular")); if (!r) return false; r.click(); return true; })()`).catch(() => false);
                let prepared = false;
                const prepUntil = Date.now() + 4000;
                while (clicked && Date.now() < prepUntil && !prepared) { prepared = (await webContents.executeJavaScript(prevBadge).catch(() => "")).includes("Item do celular"); if (!prepared) await sleep(100); }
                const song = (await webContents.executeJavaScript(`window.keryxDesktop.db.call("Song", "create", [{ title: "Música do celular", lyrics: "Linha do celular" }])`)).data;
                let page = null;
                const libUntil = Date.now() + 6000;
                while (Date.now() < libUntil && !(page?.rows?.length === 1)) { page = await body(await cmd2("library", { tab: "songs", q: "musica do celular" })); if (!(page?.rows?.length === 1)) await sleep(300); }
                result.remote.library = page?.rows?.length === 1 && page.rows[0].id === song.id && page.total === 1 && page.ready === true;
                const viaMedia = await cmd2("sendMedia", { kind: "song", id: song.id });
                result.remote.sendMedia = viaMedia.status === 200 && ((live.get().content || {}).title || "") === "Música do celular";
                result.remote.prevKept = prepared && (await webContents.executeJavaScript(prevBadge).catch(() => "")).includes("Item do celular");
                const ended = await body(await cmd2("end"));
                const undone = ended?.undo === true ? await cmd2("undo") : { status: 0 };
                let back = false;
                const undoUntil = Date.now() + 4000;
                while (undone.status === 200 && Date.now() < undoUntil && !back) { back = ((live.get().content || {}).title || "") === "Música do celular"; if (!back) await sleep(100); }
                result.remote.undo = back;
                await webContents.executeJavaScript(`window.keryxDesktop.db.call("Song", "delete", [${JSON.stringify(song.id)}])`).catch(() => {});
                await webContents.executeJavaScript(`window.keryxDesktop.db.call("ServiceItem", "delete", [${JSON.stringify(row.id)}])`).catch(() => {});
            } else result.remote.sendItem = false;
            // The same PDF imported through the Mídia file picker earlier is
            // a presentation to the remote too: its `next` command changes
            // page 1 to page 2, not merely a text slide.
            const importedPdf = (await webContents.executeJavaScript(`window.keryxDesktop.db.call("Media", "filter", [{ title: "PDF do smoke" }])`)).data?.[0];
            if (importedPdf?.pages?.length === 2) {
                const slides = importedPdf.pages.map((page, index) => ({ text: "", image_url: page.url, label: `Página ${index + 1}` }));
                live.call("content.show", { kind: "presentation", ref: { mediaId: importedPdf.id }, title: importedPdf.title, slides, index: 0 });
                // The Electron live store notifies the renderer asynchronously;
                // wait until Console's remote handler sees this presentation.
                let remoteSeesPdf = false;
                const visibleUntil = Date.now() + 4000;
                while (Date.now() < visibleUntil && !remoteSeesPdf) {
                    const state = await cmd("state");
                    const body = await state.json().catch(() => ({}));
                    remoteSeesPdf = body?.data?.result?.onAir?.title === importedPdf.title;
                    if (!remoteSeesPdf) await sleep(100);
                }
                const moved = remoteSeesPdf ? await cmd("next") : { status: 0 };
                let pdfAdvanced = false;
                const advancedUntil = Date.now() + 4000;
                while (moved.status === 200 && Date.now() < advancedUntil && !pdfAdvanced) {
                    pdfAdvanced = live.get().content?.kind === "presentation" && live.get().content?.index === 1;
                    if (!pdfAdvanced) await sleep(100);
                }
                result.remote.pdfNext = Boolean(pdfAdvanced);
            } else result.remote.pdfNext = false;
            if (importedPdf?.id) await webContents.executeJavaScript(`window.keryxDesktop.db.call("Media", "delete", [${JSON.stringify(importedPdf.id)}])`).catch(() => {});
            if (reopened) { const u = new URL(reopened); u.search = ""; await webContents.loadURL(u.toString()); await sleep(2000); }
            live.call("clear", {});
            live.call("screens.lock", { locked: true });
            result.remote.locked = (await cmd("next")).status;
            live.call("screens.lock", { locked: false });
            // The phone's page itself, signed in with that cookie.
            const phone = tablet();
            const [name, value] = cookie.split("=");
            await phone.webContents.session.cookies.set({ url: base, name, value });
            await phone.loadURL(`${base}/Remote`);
            result.remote.page = await waitFor(phone, "Segure para encerrar tudo", 8000);
            // The page itself (Rodada G6 PR3): its tab bar, and its Tela preta
            // reaching the live state through the console.
            const pageJs = (code) => phone.webContents.executeJavaScript(code).catch(() => null);
            const tabs = (await pageJs(`[...document.querySelectorAll(".rm-tab")].map((b) => b.textContent.trim()).join("|")`)) || "";
            result.remote.tabs = tabs.startsWith("Ao vivo") && tabs.includes("Setlist") && tabs.includes("Mais");
            live.call("screen.set", { mode: "show" });
            await pageJs(`[...document.querySelectorAll(".rm-trio .rm-b")].find((b) => b.textContent.includes("Tela preta"))?.click()`);
            const blackUntil = Date.now() + 5000;
            while (Date.now() < blackUntil && live.get().screen !== "black") await sleep(150);
            result.remote.pageBlack = live.get().screen === "black";
            live.call("screen.set", { mode: "show" });
            phone.close();
            await network.ops.setRemote(null, false);
            result.remote.offAgain = (await cmd("black")).status;
        }

        // The stage tablet drops mid-service: the console says which one and when,
        // instead of the screen silently leaving the list (outputs.js).
        if (webContents) {
            const consoleText = () => bodyText(webContents);
            await sleep(5500); // one outputs poll with the stage tablet connected
            stage.close();
            const end = Date.now() + 14000;
            while (Date.now() < end && !(await consoleText()).includes("Palco desconectada")) await sleep(300);
            const text = await consoleText();
            result.dropBanner = text.includes("Palco desconectada");
            // The status button shows the compact "1 com problema" (Rodada E1);
            // its title carries the whole label, so read the title too.
            result.dropLabel = await webContents.executeJavaScript("(() => { const b = document.querySelector('.kx-status'); const t = document.querySelector('.topbar'); return { title: b ? b.title : null, shown: b ? b.innerText : null, bar: t ? Math.round(t.getBoundingClientRect().width) : null, hidden: document.hidden }; })()").catch(() => null);
            result.dropStatus = /Saídas · \d+ com problema/.test(text) || /Saídas · \d+ com problema/.test((result.dropLabel && result.dropLabel.title) || "");
        }
    } finally {
        if (!lyrics.isDestroyed()) lyrics.close();
        if (!stage.isDestroyed()) stage.close();
        await network.ops.setEnabled(null, false);
    }
    const l = result.live;
    result.ok = result.started && result.isNetworkScreen && result.lyrics && result.lanFont && result.stage && result.lyricsAdvanced
        && result.stageChords && result.lyricsBlack && result.stageDuringBlack
        && result.videoSrc === `${base}/media/${videoFile}`
        && result.projectorScreen && result.pastorScreen && result.streamScreen && result.streamBlack
        && Boolean(l && l.events.includes("Texto ao vivo") && l.read === "Texto ao vivo" && l.media === "keryx-media://fundo.png" && l.writeStatus === 405)
        && result.operatorPageBlocked && result.pinForm && result.tabletErrors.length === 0
        && (!webContents || (result.dropBanner && result.dropStatus))
        && (!webContents || Boolean(result.remote && result.remote.off === 404 && result.remote.signedIn === 303 && result.remote.black === 200 && result.remote.screen === "black" && result.remote.state && result.remote.sendItem === true && result.remote.v2 === true && result.remote.library === true && result.remote.sendMedia === true && result.remote.prevKept === true && result.remote.undo === true && result.remote.pdfNext === true && result.remote.locked === 423 && result.remote.page && result.remote.tabs && result.remote.pageBlack && result.remote.offAgain === 404));
    return result;
}

// Backups, logs and the Settings bridge, as the packaged app runs them.
async function checkSystem(webContents, { dataDir, system, settings }) {
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
    // Media goes into the backup only in a folder the church chose (here a
    // stand-in for a USB stick): the default folder, on the same disk, does
    // not get a second copy of the videos.
    // Restaurar lists the daily backups of the folder (restoring itself asks in a
    // native dialog and restarts; archive.stageRestore is unit tested).
    const listed = (await webContents.executeJavaScript(`window.keryxDesktop.system.call("backupList")`)).data;
    result.restoreListed = Boolean(listed && listed.backups.length >= 1 && /^keryx-\d{4}-\d{2}-\d{2}\.db$/.test(listed.backups[0].name));
    result.mediaOffByDefault = made.backup.media && made.backup.media.enabled === false;
    const usb = path.join(dataDir, "smoke-usb");
    const sample = path.join(dataDir, "media", "smoke-backup-media.txt");
    try {
        fs.mkdirSync(path.dirname(sample), { recursive: true });
        fs.writeFileSync(sample, "mídia do smoke");
        settings.set("backup", { dir: usb });
        await webContents.executeJavaScript(`window.keryxDesktop.system.call("backupNow")`);
        let media = null;
        for (let i = 0; i < 50; i += 1) {
            media = (await webContents.executeJavaScript(`window.keryxDesktop.system.call("info")`)).data.backup.media;
            if (media && media.enabled && !media.running && media.last) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        result.media = media;
        result.mediaCopied = Boolean(media && media.enabled && media.files >= 1 && !media.error)
            && fs.readFileSync(path.join(usb, "media", "smoke-backup-media.txt"), "utf8") === "mídia do smoke";
    } catch (err) {
        result.mediaCopied = false;
        result.mediaError = err.message;
    } finally {
        settings.set("backup", {});
        fs.rmSync(sample, { force: true });
    }
    result.ok = info.dataDir === dataDir && result.backupsAfterLaunch >= 1 && result.backupsAfterManual >= 1
        && result.backupOpens && logs >= 1 && Boolean(system.info) && result.mediaOffByDefault && result.mediaCopied && result.restoreListed;
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
        && a.bible.passage === "16,17" && a.bible.source === "local" && a.bible.preferred === "NVI|ACF"
        && a.bible.search === "ACF 17" && a.bible.parsed === "João" && a.bible.missing === 404;
}

const VERBOSE = process.env.KERYX_SMOKE_VERBOSE === "1";
const step = (name) => { if (VERBOSE) console.log(`smoke: ${name}`); };

// Updates and the bell, without a real update: the smoke pushes updater
// states over the same channel the main process uses (keryx:update) and adds
// a notification through the main process. The menu offers "Atualizar agora",
// the popup shows the progress, a downloaded update with something on air
// waits for a click, with nothing on air it counts down (cancelled here; the
// updater is off in an unpackaged app anyway). The bell's dot goes when read.
async function checkUpdates(webContents, { system, live, settings }) {
    const result = { ok: false };
    const js = (code) => webContents.executeJavaScript(code);
    const waitFor = async (test, ms = 5000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) { if (await test()) return true; await sleep(150); }
        return false;
    };
    const has = (sel, text = "") => js(`[...document.querySelectorAll(${JSON.stringify(sel)})].some((n) => n.textContent.includes(${JSON.stringify(text)}))`);
    const clickText = (sel, text) => js(`(() => { const n = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (n) n.click(); return Boolean(n); })()`);
    const push = (state) => webContents.send("keryx:update", { status: "none", version: null, percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, message: "", auto: false, ...state });
    const shot = async (suffix) => {
        if (!process.env.KERYX_CONSOLE_SHOT) return;
        await sleep(500);
        fs.writeFileSync(process.env.KERYX_CONSOLE_SHOT.replace(/\.png$/i, `-${suffix}.png`), (await webContents.capturePage()).toPNG());
    };
    try {
        // The bell: a red dot for an unread notification; opening it reads it.
        system.notifications.add({ key: "smoke", kind: "warn", title: "Aviso do smoke", body: "Só um teste.", action: "settings:dados" });
        result.bellDot = await waitFor(() => js("Boolean(document.querySelector('.tb-bell-dot'))"));
        await js("document.querySelector('.tb-bell button').click(); true");
        result.bellList = await waitFor(() => has(".notifs .note-t", "Aviso do smoke"));
        result.bellAnchored = await js("(() => { const p = document.querySelector('.notifs'); const b = document.querySelector('.topbar .tb-bell button'); if (!p || !b) return false; const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect(); return pr.left >= 0 && pr.right <= innerWidth + 1 && Math.abs(pr.right - br.right) <= 2; })()");
        await shot("sino");
        result.bellRead = await waitFor(() => system.notifications.unread() === 0, 4000) && await waitFor(() => js("!document.querySelector('.tb-bell-dot')"));
        await js("document.querySelector('.scrim') && document.querySelector('.scrim').click(); true");

        // The menu offers the update while it comes down; the popup follows it.
        push({ status: "downloading", version: "9.9.9", percent: 40, transferred: 56e6, total: 140e6, bytesPerSecond: 2e6, notes: "• Nota da versão do smoke" });
        await js("document.querySelector('.markbtn').click(); true");
        result.menuItem = await waitFor(() => has(".kx-pop", "Atualizando…")) && await has(".kx-pop", "40%");
        await clickText(".kx-pop button, .kx-pop [role=menuitem]", "Atualizando…");
        result.popup = await waitFor(() => has(".dialog.upd", "Baixando a versão 9.9.9")) && await has(".dialog.upd", "56 de 140 MB");
        result.notes = await has(".dialog.upd .upd-notes", "Nota da versão do smoke");
        result.bar = await js("(() => { const b = document.querySelector('.upd-bar > b'); return b ? b.style.transform : null; })()");
        await shot("atualizacao");

        // Downloaded with something on air: no countdown, an explicit button.
        live.call("content.show", { kind: "lyrics", title: "No ar", slides: [{ text: "Algo no ar" }] });
        push({ status: "downloaded", version: "9.9.9", percent: 100 });
        result.waitsOnAir = await waitFor(() => has(".dialog.upd", "Instalar mesmo assim")) && !(await has(".dialog.upd", "Reiniciando em"));
        // Nothing on air: it counts down by itself; Cancelar stops it.
        live.call("clear");
        result.countdown = await waitFor(() => has(".dialog.upd", "Reiniciando em"));
        await clickText(".dialog.upd button", "Cancelar");
        result.cancelled = await waitFor(() => has(".dialog.upd", "Instalar e reiniciar")) && !(await has(".dialog.upd", "Reiniciando em"));
        await clickText(".dialog.upd button", "Depois");
        result.closed = await waitFor(() => js("!document.querySelector('.dialog.upd')"));
    } catch (err) {
        result.error = String(err && err.message);
    } finally {
        push({ status: "none" });
        try { system.notifications.clear(); } catch { /* not there */ }
    }
    // Novidades: from the Ajuda menu (every version's notes; the bar's menu,
    // or the Menu button's popover where the bar folds away, Rodada M0), and
    // once by itself after an update (whatsNew in settings.json), cleared
    // when closed.
    try {
        await js("document.querySelector('.scrim') && document.querySelector('.scrim').click(); true");
        await js("(() => { const bar = document.querySelector('.topbar .tb-menus [data-menu=\"ajuda\"]'); (bar && bar.offsetParent ? bar : document.querySelector('.topbar .tb-menubtn')).click(); return true; })()");
        await waitFor(() => clickText(".kx-pop *", "Novidades"), 3000);
        result.whatsNewMenu = await waitFor(() => has(".dialog.wn .wn-h", "O que mudou"), 4000);
        await clickText(".dialog.wn button", "Entendi");
        const { version } = await system.ops.whatsNew();
        settings.set("whatsNew", { from: "0.2.12", to: version });
        webContents.reload();
        result.whatsNewAuto = await waitFor(() => has(".dialog.wn .kx-section", `atualizado para a versão ${version}`), 15000);
        await clickText(".dialog.wn button", "Entendi");
        result.whatsNewSeen = await waitFor(() => settings.get("whatsNew", null) === null, 4000);
    } catch (err) { result.whatsNewError = err.message; }
    result.ok = Boolean(result.bellDot && result.bellList && result.bellAnchored && result.bellRead && result.menuItem && result.popup && result.notes && result.bar === "scaleX(0.4)"
        && result.waitsOnAir && result.countdown && result.cancelled && result.closed && result.whatsNewMenu && result.whatsNewAuto && result.whatsNewSeen);
    return result;
}

function runSmokeTest(win, { dev, outputs, screen, system, settings, network, live, dataDir, importOutcome }) {
    const errors = [];
    const { webContents } = win;
    // Last check, then the report: closing the console must quit KERYX even
    // with an output open (outputs are not in the taskbar, so nothing else
    // would show it is still running). The result is printed only when the
    // app really quits; if it doesn't within a few seconds, that is a failure.
    const finish = (ok, details) => {
        let reported = false;
        const report = (quit) => {
            if (reported) return;
            reported = true;
            const passed = ok && quit.quits && quit.outputOpen && quit.guardAsked && quit.guardKept && quit.editorAsked && quit.editorKept;
            console.log(`SMOKE ${passed ? "OK" : "FAIL"} ${JSON.stringify({ ...details, quit, errors })}`);
            app.exit(passed ? 0 : 1);
        };
        try {
            outputs.open("/Projection");
        } catch { /* reported as outputOpen: false */ }
        setTimeout(async () => {
            const outputOpen = outputs.trackedWindows().some((w) => !w.destroyed);
            // The X always asks first (closeGuard.cjs):
            // answering no keeps the KERYX open; then it closes.
            const guard = require("./closeGuard.cjs");
            let guardAsked = false;
            let guardKept = false;
            try {
                live.call("screens.lock", { locked: false });
            } catch { /* not locked */ }
            try {
                live.call("content.show", { kind: "text", title: "Guarda", slides: [{ text: "Guarda" }] });
                guard.setAsk(async () => { guardAsked = true; return false; });
                if (!win.isDestroyed()) win.close();
                await new Promise((r) => setTimeout(r, 800));
                guardKept = !win.isDestroyed();
            } catch { /* reported as guardKept: false */ }
            guard.setAsk(async () => true);
            // Unsaved changes in the Editor: closing KERYX asks about them
            // first, with the console still up (the Editor closes before the
            // quit); "Continuar editando" keeps everything open, and then
            // "Descartar as mudanças" lets it quit.
            let editorAsked = false;
            let editorKept = false;
            try {
                // A detached page (Destacar em janela, Rodada F5): /Janela, the
                // Editor de temas by its URL (never just the first /Janela).
                const editor = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes("/Janela?page=theme"));
                await webContents.executeJavaScript('window.open(location.origin + "/Janela?page=theme&theme=new", "keryx-janela-theme"); true');
                for (let i = 0; i < 40 && !editor(); i += 1) await sleep(200);
                // userGesture: the typing comes as an operator's would.
                const ejs = (code) => editor().webContents.executeJavaScript(code, true);
                for (let i = 0; i < 40 && !(await ejs("Boolean(document.querySelector('.nv-frm input.pl-input'))").catch(() => false)); i += 1) await sleep(200);
                await ejs(`(() => { const n = document.querySelector(".nv-frm input.pl-input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(n, "Não salvo"); n.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
                await sleep(400);
                guard.setAskLeave(() => { editorAsked = true; return false; });
                if (!win.isDestroyed()) win.close();
                await sleep(1500);
                editorKept = !win.isDestroyed() && Boolean(editor());
            } catch { /* reported as editorAsked/editorKept: false */ }
            guard.setAskLeave(() => true);
            app.once("will-quit", (event) => {
                event.preventDefault();
                report({ quits: true, outputOpen, guardAsked, guardKept, editorAsked, editorKept });
            });
            setTimeout(() => report({ quits: false, outputOpen, guardAsked, guardKept, editorAsked, editorKept, note: "o KERYX continuou aberto depois de fechar o console" }), 10000);
            if (!win.isDestroyed()) win.close();
        }, 1500);
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
            const systemResult = await checkSystem(webContents, { dataDir, system, settings });
            const liveResult = await checkLive(webContents, { live });
            const videoResult = await checkVideo(webContents, { live });
            const layersResult = await checkLayers(webContents, { live, outputs });
            const consoleResult = await checkConsole(webContents, { live, outputs });
            const updatesResult = await checkUpdates(webContents, { system, live, settings });
            // The LAN server serves the built app (dist/), so this runs in built mode only.
            const networkResult = dev ? "skipped (built mode only)" : await checkNetwork({ network, live, videoFile: videoResult.fileName, webContents });
            finish(bridgeOk && adapterOk && outputsResult.ok && systemResult.ok && liveResult.ok && videoResult.ok && layersResult.ok && consoleResult.ok && updatesResult.ok && !importOutcome && (dev || networkResult.ok),
                { rendered, bridge, adapter, outputs: outputsResult, system: systemResult, live: liveResult, video: videoResult, layers: layersResult, console: consoleResult, updates: updatesResult, network: networkResult });
        } catch (err) {
            finish(false, { rendered, exception: String(err && (err.stack || err.message)).slice(0, 800) });
        }
    };
    webContents.once("did-finish-load", poll);
}

module.exports = { runSmokeTest };
