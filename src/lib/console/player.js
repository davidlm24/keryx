// The player on top of the Programa: which live layer it controls and what
// its buttons do (levels live in src/components/console/meterStore.js). Plain JS,
// no imports, so node --test can check it.
//
// Three layers play sound: "video" (the video screens), "media" (a video or
// YouTube link on the main projector) and "audio" (music or a playback track
// on the KERYX computer, under whatever the screens show).

export const PLAYER_LAYERS = ["video", "media", "audio"];
export const LAYER_LABEL = { video: "Telas de vídeo", media: "Projetor", audio: "Áudio" };
const PLAYABLE_MEDIA = ["video", "youtube", "audio"];
const SKIP_SECONDS = 10;

// The layers of a live document that are playing something with sound.
export function playerLayers(doc) {
    if (!doc) return [];
    return PLAYER_LAYERS.filter((l) => {
        const item = doc[l];
        if (!item || !item.playback) return false;
        return l !== "media" || PLAYABLE_MEDIA.includes(item.kind);
    });
}

// The layer the player shows: the one the operator picked while it still
// plays, else the one that started last.
export function playerLayer(doc, picked = null) {
    const layers = playerLayers(doc);
    if (picked && layers.includes(picked)) return picked;
    return layers.sort((a, b) => (doc[b].shownAt || 0) - (doc[a].shownAt || 0))[0] || null;
}

// The operation (and args) behind each player button, or null when the button
// does nothing for this item. pos: the live position in seconds.
export function playerOp(doc, layer, action, { pos = 0, duration = null, volume = null } = {}) {
    const item = layer ? doc?.[layer] : null;
    if (!item) return null;
    const pb = item.playback;
    const list = item.playlist;
    const at = item.playlistIndex ?? 0;
    const clampTime = (t) => Math.max(0, duration ? Math.min(duration, t) : t);
    switch (action) {
        case "toggle": return ["transport", { layer, action: pb.paused ? "play" : "pause" }];
        case "back": return ["transport", { layer, action: "seek", time: clampTime(pos - SKIP_SECONDS) }];
        case "forward": return ["transport", { layer, action: "seek", time: clampTime(pos + SKIP_SECONDS) }];
        case "seek": return ["transport", { layer, action: "seek", time: clampTime(pos) }];
        // Anterior: the previous item of a list, else back to the start.
        case "prev":
            if (list && at > 0) return ["playlist.goTo", { layer, index: at - 1 }];
            return ["transport", { layer, action: "seek", time: 0 }];
        case "next": return list && at < list.length - 1 ? ["playlist.goTo", { layer, index: at + 1 }] : null;
        case "volume": return ["transport", { layer, action: "volume", volume: Math.max(0, Math.min(1, volume ?? 1)) }];
        case "stop": return [`${layer}.clear`, {}];
        case "audioOnly":
        case "showVideo": {
            const swap = videoSwap(doc, layer);
            if (!swap || swap.disabled || swap.action !== action) return null;
            return action === "audioOnly" ? ["media.toAudio", {}] : ["audio.toMedia", {}];
        }
        default: return null;
    }
}

// The player's video/sound button (as in Holyrics): a video on the projector
// can leave the screen and keep its sound (the audio channel), and come back.
// null: no button for this layer. disabled: shown, with why not in title.
export function videoSwap(doc, layer) {
    const item = layer ? doc?.[layer] : null;
    if (!item) return null;
    if (layer === "media" && item.kind === "youtube") return { action: "audioOnly", disabled: true, title: "Um vídeo do YouTube não toca só o som" };
    if (layer === "media" && item.kind === "video") return { action: "audioOnly", title: "Tirar o vídeo · o som continua" };
    if (layer === "audio" && item.kind === "video") return { action: "showVideo", title: "Mostrar o vídeo · agora só o som" };
    return null;
}

// The progress bar can be dragged (owner 2026-10-16, Rodada F1): where a
// pointer at clientX falls on the bar's box, in seconds of `duration`
// (clamped to the bar; 0 when the length is unknown).
export function seekAt(clientX, box, duration) {
    if (!(duration > 0) || !box || !(box.width > 0)) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * duration;
}

// ← / → on the bar focused with Tab: seconds per press.
export const SEEK_KEY_SECONDS = 5;

const two = (n) => String(n).padStart(2, "0");
export function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}

// ---------- Letra automática (owner 2026-10-15, Rodada D4) ----------
// A song on air whose slides have marks follows its video, its playback (on
// the audio channel) or the live clock (content.follow, live-state.mjs).

// Whether the player's item is what the lyrics follow.
export const followsItem = (follow, item) => Boolean(follow && item && follow.source !== "clock" && item.url === follow.url);

// The chip's words: what the lyrics follow, or that following is paused.
export function followLabel(follow) {
    if (!follow) return "";
    if (follow.source === "clock" && !follow.clock) return "Letra automática · esperando Iniciar";
    if (follow.paused) return "Letra parada · clique para retomar";
    return follow.source === "clock" ? "Relógio ao vivo" : follow.source === "video" ? "Letra segue o vídeo" : "Letra segue o playback";
}

// The chip's click (or the clock's Iniciar): the content.follow action.
export function followAction(follow) {
    if (!follow) return null;
    if (follow.source === "clock" && !follow.clock) return "start";
    return follow.paused ? "resume" : "pause";
}

// One tick per marked slide on a time bar of `duration` seconds, where the
// slide comes in on that bar (its mark less the follow's offset). -> [{ i, pct, label }]
export function followTicks(slides, follow, duration) {
    if (!follow || !(duration > 0)) return [];
    const off = follow.offset || 0;
    return (slides || []).flatMap((it, i) => {
        if (!Number.isFinite(it?.start)) return [];
        const t = it.start - off;
        if (t < 0 || t > duration) return [];
        return [{ i, pct: Math.round((t / duration) * 10000) / 100, label: `${i + 1}${it.label ? ` · ${it.label}` : ""} · ${clock(t)}` }];
    });
}

// The live clock's length: the song's duration, else a little past the last mark.
export function clockLength(slides, follow) {
    if (follow?.length > 0) return follow.length;
    const last = Math.max(0, ...(slides || []).map((it) => (Number.isFinite(it?.start) ? it.start : 0)));
    return last > 0 ? Math.ceil(last + 15) : null;
}
