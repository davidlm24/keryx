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
        default: return null;
    }
}

const two = (n) => String(n).padStart(2, "0");
export function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}
