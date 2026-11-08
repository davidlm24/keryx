// Saída de som (owner 2026-11-08, mockup S1 = A): the device every sound of
// KERYX comes out of. The sound engine (soundEngine.cjs) plays everything,
// so one choice covers videos, audios, avisos and the bell: its media
// elements and its chime take this device (src/lib/soundSink.js). A YouTube
// link that is not downloaded plays in YouTube's own frame, which no page can
// send elsewhere: it stays on Windows' default device, and the row says so.
//
// Kept per computer (settings.json "soundOut", a device belongs to a PC):
// { id, label } — id is the browser's device id for the app's pages, "" for
// Windows' default; label is what the console showed, so the row can name a
// device that is unplugged now.
const KEY = "soundOut";
const DEFAULT = Object.freeze({ id: "", label: "" });

function normalizeSoundOut(value) {
    if (!value || typeof value !== "object") return { ...DEFAULT };
    const id = typeof value.id === "string" ? value.id.slice(0, 256) : "";
    // Chromium's own aliases of the default: the default.
    if (!id || id === "default" || id === "communications") return { ...DEFAULT };
    const label = typeof value.label === "string" ? value.label.trim().slice(0, 200) : "";
    return { id, label };
}

// IPC: keryx:sound get | set | test. `engine()` is the sound engine's window
// (the test bell rings there, on the device chosen); `broadcast` tells every
// window (the engine follows at once).
function registerSoundOut({ ipcMain, settings, isTrusted, broadcast, engine }) {
    const get = () => normalizeSoundOut(settings.get(KEY, null));
    ipcMain.handle("keryx:sound", (event, payload) => {
        if (!isTrusted(event)) return { error: { message: "Origem não autorizada.", status: 403 } };
        const op = payload && payload.op;
        if (op === "get") return { data: get() };
        if (op === "set") {
            const next = normalizeSoundOut(payload.choice);
            settings.set(KEY, next);
            broadcast("keryx:sound", next);
            return { data: next };
        }
        if (op === "test") {
            const w = engine();
            if (!w) return { error: { message: "O som do KERYX ainda está abrindo. Tente de novo.", status: 503 } };
            w.webContents.send("keryx:sound-test");
            return { data: true };
        }
        return { error: { message: "Operação desconhecida.", status: 400 } };
    });
    return { get };
}

module.exports = { KEY, normalizeSoundOut, registerSoundOut };
