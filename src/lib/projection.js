// The projection service: the one way operator pages change what is on
// screen. Each call is one operation on the live state (shared/live-state.mjs,
// held by electron/live.cjs on desktop) and resolves with the new document;
// every output and network screen gets it too. Errors are ClientError with a
// pt-BR message, ready for a toast.
//
// Outputs read the document with useLiveState(); they do not call this,
// except to report that a playlist item ended (media.advance).

import { keryx } from "@/api/keryxClient";

const op = (name) => (args) => keryx.live.call(name, args);

export const projection = {
    // Lyrics, a Bible passage or free text on the slide layer.
    // { title, artist, slides: [{ text, duration?, is_chorus? }], index?,
    //   style: { font_size, font_family, text_effect, text_color, text_color_2, background_image },
    //   stage: { song_key, bpm, chords, musician_notes }, ref: { songId, serviceItemId, reference } }
    showLyrics: (args) => keryx.live.call("content.show", { ...args, kind: "lyrics" }),
    showBible: (args) => keryx.live.call("content.show", { ...args, kind: "bible" }),
    showText: (args) => keryx.live.call("content.show", { ...args, kind: "text" }),
    updateContent: op("content.update"),
    goTo: (index) => keryx.live.call("content.goTo", { index }),
    next: () => keryx.live.call("content.next"),
    prev: () => keryx.live.call("content.prev"),
    clearContent: op("content.clear"),

    // The main projector's media layer: { kind, url, title }, or a list.
    showMedia: op("media.show"),
    showPlaylist: (items, index = 0) => keryx.live.call("media.playlist", { items, index }),
    advanceMedia: (fromIndex) => keryx.live.call("media.advance", { fromIndex }),
    clearMedia: op("media.clear"),

    // The audio channel: music or a playback track on the KERYX computer,
    // under whatever the screens show ({ url, title, kind: "audio" | "video" }).
    showAudio: op("audio.show"),
    showAudioPlaylist: (items, index = 0) => keryx.live.call("audio.playlist", { items, index }),
    advanceAudio: (fromIndex) => keryx.live.call("audio.advance", { fromIndex }),
    clearAudio: op("audio.clear"),
    // Anterior / Próximo in a media or audio list.
    playlistGoTo: (layer, index) => keryx.live.call("playlist.goTo", { layer, index }),

    // The video channel (video screens, tablets): { kind, url, title }.
    showVideo: op("video.show"),
    clearVideo: op("video.clear"),
    // layer: "video" | "media" | "audio"
    transport: {
        play: (layer = "video") => keryx.live.call("transport", { layer, action: "play" }),
        pause: (layer = "video") => keryx.live.call("transport", { layer, action: "pause" }),
        seek: (time, layer = "video") => keryx.live.call("transport", { layer, action: "seek", time }),
        volume: (volume, layer = "video") => keryx.live.call("transport", { layer, action: "volume", volume }),
        // Screens try to go fullscreen; a tablet shows a "tap" button instead.
        fullscreen: (layer = "video") => keryx.live.call("transport", { layer, action: "fullscreen" }),
    },

    // Clock, stopwatch, timer ({ durationMs }) or free text, over the content.
    showTool: (mode, args = {}) => keryx.live.call("tool.show", { ...args, mode }),
    clearTool: op("tool.clear"),

    showCommunication: (item) => keryx.live.call("communication.show", { item }),
    showCommunicationPlaylist: (playlist, index = 0) => keryx.live.call("communication.show", { playlist, index }),
    advanceCommunication: (fromIndex) => keryx.live.call("communication.advance", { fromIndex }),
    clearCommunication: op("communication.clear"),


    // Under everything: { kind: "image" | "video" | "color", value }.
    setBackground: op("background.set"),
    clearBackground: op("background.clear"),
    setOverlays: (overlays) => keryx.live.call("overlays.set", { overlays }),
    alert: (message, type = "alert") => keryx.live.call("alert.show", { message, type }),
    clearAlert: op("alert.clear"),

    // The church logo as a corner mark over the content:
    // { visible, corner: "top-left" | "top-right" | "bottom-left" | "bottom-right", size: "small" | "medium" | "large" }
    setLogo: op("logo.set"),

    // "show" | "black" | "logo"; `fade` (ms): it comes and goes with the exit fade.
    setScreen: (mode, { fade } = {}) => keryx.live.call("screen.set", { mode, fade }),
    // Encerrar: takes down content, media, video, tools and communication
    // ({ fade }: fading out, src/lib/console/transitions.js).
    clear: op("clear"),

    startSession: (serviceId = null) => keryx.live.call("session.start", { serviceId }),
    endSession: op("session.end"),
    // Where the service is in its rundown (a ServiceItem id and its position).
    setItem: (itemId, index = null) => keryx.live.call("session.item", { itemId, index }),
};

// "Voltar ao anterior": src/lib/console/restore.js (pure, tested).
export { restoreArgs } from "@/lib/console/restore";

export default projection;
