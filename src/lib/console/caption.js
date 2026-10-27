import { mainLayer } from "../../../shared/live-state.mjs";
import { playerLayers } from "./player.js";

// What a screen shows, as a title and its position ("2/6" or ""): the parts
// of a monitor's caption.
export const captionParts = (doc) => {
    if (!doc) return { title: "", pos: "" };
    const layer = mainLayer(doc);
    // A video-channel clip covers the screens over every layer.
    if (doc.video && layer !== "black" && layer !== "logo") return { title: doc.video.title || "Vídeo", pos: "" };
    if (layer === "black") return { title: "Tela preta", pos: "" };
    if (layer === "logo") return { title: "Logo", pos: "" };
    if (layer === "content") return { title: doc.content.title || "Texto", pos: doc.content.slides.length > 1 ? `${doc.content.index + 1}/${doc.content.slides.length}` : "" };
    if (layer === "media") return { title: doc.media.title || "Mídia", pos: "" };
    if (layer === "communication") return { title: doc.communication.item?.title || "Aviso", pos: "" };
    if (layer === "tool") return { title: { clock: "Relógio", stopwatch: "Cronômetro", timer: "Timer", freetext: "Texto livre" }[doc.tool.mode], pos: "" };
    return { title: "nada", pos: "" };
};

// The Programa's pill right after an output took a refused YouTube link off
// (live.refused, owner 2026-10-27, mockup board 5): amber "YouTube recusou o
// vídeo" while nothing is on the screens and nothing has changed since.
export function refusedNow(doc) {
    if (!doc?.refused || doc.refused.at !== doc.updatedAt) return null;
    return mainLayer(doc) === "none" && !doc.video ? "YouTube recusou o vídeo" : null;
}

// Whether what is on air is what the player plays (owner's pick A, Rodada
// F1): a video-channel clip, a video, YouTube link or audio file on the
// projector, or a sound with nothing on the screens. The player names it,
// so the Programa's pill leaves the title out. Lyrics, a passage, text, a
// picture, a presentation, a tool, an aviso, Tela preta and Logo keep it —
// a playback or music under them included.
export function airInPlayer(doc) {
    if (!doc) return false;
    const layer = mainLayer(doc);
    if (layer === "black" || layer === "logo") return false;
    const playing = playerLayers(doc);
    if (doc.video) return playing.includes("video");
    if (layer === "media") return playing.includes("media");
    return layer === "none" && playing.includes("audio");
}

// When the item on air went on air (the live clock, ms), or null when there is
// no item to count: Tela preta, Logo, nothing, or a tool (a clock or timer
// already shows its own time). The video channel covers the rest.
export const airSince = (doc) => {
    if (!doc) return null;
    const layer = mainLayer(doc);
    if (layer === "black" || layer === "logo" || layer === "none" || layer === "tool") return doc.video ? doc.video.shownAt ?? null : null;
    if (doc.video) return doc.video.shownAt ?? null;
    if (layer === "content") return doc.content.startedAt ?? null;
    if (layer === "media") return doc.media.shownAt ?? null;
    if (layer === "communication") return doc.communication.startedAt ?? null;
    return null;
};

// "No ar há 3:42" (h:mm:ss from an hour on): how long the item has been on
// air, or "" when it cannot be said. Never negative (clocks differ a little).
export function airFor(doc, nowMs) {
    const since = airSince(doc);
    if (since == null || !Number.isFinite(nowMs)) return "";
    const s = Math.max(0, Math.floor((nowMs - since) / 1000));
    const two = (n) => String(n).padStart(2, "0");
    return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}

// A title cut in two for a narrow caption (C-17): the head gives way with
// its "…" and the tail — the part after the last " · " / " - ", else the last
// word — stays whole, so "Canção de exemplo · Manhã" and "· Graça" still
// differ when the start is clipped. Short titles, or a tail too long to be
// worth keeping, stay one piece ({ head: title, tail: "" }).
export function titleParts(title, { min = 16, maxTail = 16 } = {}) {
    const t = String(title || "").trim();
    if (t.length < min) return { head: t, tail: "" };
    const sep = Math.max(t.lastIndexOf(" · "), t.lastIndexOf(" - "), t.lastIndexOf(" — "));
    const at = sep > 0 ? sep + 3 : t.lastIndexOf(" ") + 1;
    const tail = at > 0 ? t.slice(at).trim() : "";
    if (!tail || tail.length > maxTail || at >= t.length) return { head: t, tail: "" };
    return { head: t.slice(0, at).trimEnd(), tail };
}

// What a screen reader hears when what is on air changes (C-25): "No ar:
// Hino · 1/3", "No ar: Tela preta", "Nada no ar". The words stay the same
// while the same thing stays on air (no clock in them), so the console
// speaks once per real change, never per tick.
export function airAnnouncement(doc) {
    const { title, pos } = captionParts(doc);
    if (title === "nada") return airInPlayer(doc) && doc.audio?.title ? `No ar: ${doc.audio.title}` : "Nada no ar";
    if (!title) return "Nada no ar";
    return `No ar: ${title}${pos ? ` · ${pos}` : ""}`;
}
