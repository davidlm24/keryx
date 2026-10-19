// The controle remoto's page (/Remote, a phone on the church Wi-Fi): what it
// shows, worked out from the live state (over SSE) and the console's `state`
// (shared/remoteProtocol.json). Pure, so node --test checks it; the page
// (src/pages/RemoteView.jsx) only draws it.
import PROTOCOL from "../../../shared/remoteProtocol.json" with { type: "json" };
import { activitySteps, revealStep, livePosition, toolTime } from "../../../shared/live-state.mjs";
import { captionParts, airFor } from "../console/caption.js";
import { playerLayer, videoSwap, followLabel, followAction, clock } from "../console/player.js";
import { typeLabel, typeIcon } from "../console/setlist.js";

const { messages } = PROTOCOL;

// Nothing from the computer for this long (live frames and the hb every
// 10 s): the link is dead, whatever the socket says.
export const STALE_MS = 25000;
// How often the phone asks for `state` while it is on screen.
export const STATE_EVERY_MS = 20000;
// The Desfazer after Encerrar tudo, as on the console.
export const UNDO_MS = 8000;

// The sections this console runs. A version 1 console sends no caps: it
// runs only what the old page did (slides, Tela preta/Logo, the Setlist, a
// verse; tocar/pausar is its `play`, see isV1).
const V1_CAPS = ["live", "setlist", "bible"];
export const isV1 = (state) => Boolean(state) && !Array.isArray(state.caps);
export function capsOf(state) {
    if (!state) return new Set();
    return new Set(Array.isArray(state.caps) ? state.caps : V1_CAPS);
}
// An action the console runs (its cap there; `state` always).
export const canRun = (caps, action) => {
    const cap = PROTOCOL.actions[action]?.cap;
    return Boolean(PROTOCOL.actions[action]) && (!cap || caps.has(cap));
};

// R reads, S puts on air, T takes off (per value of one arg where the
// contract says so).
export function kindOf(action, args = {}) {
    const a = PROTOCOL.actions[action];
    if (!a) return null;
    return (a.kindBy && a.kindBy.cases[String(args?.[a.kindBy.arg])]) || a.kind;
}
// Whether a control may be pressed now. Locked screens refuse whatever puts
// something on air; a dead link too (the tap would go nowhere, or land late),
// while Tela preta, Logo, Limpar and Encerrar stay: an emergency is tried.
export function allowed(action, args, { stale = false, locked = false } = {}) {
    const kind = kindOf(action, args);
    if (kind !== "S") return true;
    return !stale && !locked;
}

// The sticky header: what the screens show, its colour, and one chip per
// layer on air with its Tirar.
//   tone: "air" (red) | "amber" (Tela preta, Logo, locked) | "grey" (nothing, or no link)
const CONTENT_LABEL = { lyrics: "Letra", bible: "Bíblia", text: "Texto", presentation: "Apresentação" };
const MEDIA_LABEL = { video: "Vídeo", image: "Imagem", gif: "Imagem", pdf: "PDF", powerpoint: "Apresentação", youtube: "YouTube", audio: "Áudio" };
const TOOL_LABEL = { clock: "Relógio", stopwatch: "Cronômetro", timer: "Timer", freetext: "Texto livre" };
export function airHeader(live, { stale = false, now = Date.now() } = {}) {
    const { title, pos } = captionParts(live);
    const screen = live?.screen || "show";
    const covered = screen === "black" || screen === "logo";
    const onAir = Boolean(title) && title !== "nada" && !covered;
    const locked = Boolean(live?.locked);
    const tone = stale ? "grey" : covered || locked ? "amber" : onAir ? "air" : "grey";
    const chips = [];
    const chip = (key, label, action, args = {}, amber = false) => chips.push({ key, label, action, args, amber });
    if (live) {
        if (screen === "black") chip("black", "Tela preta", "black", { on: false }, true);
        if (screen === "logo") chip("logo", "Logo", "logo", { on: false }, true);
        if (live.content) chip("content", CONTENT_LABEL[live.content.kind] || "Texto", "off", { layer: "content" });
        if (live.media) chip("media", MEDIA_LABEL[live.media.kind] || "Mídia", "off", { layer: "media" });
        if (live.video) chip("video", "Telas de vídeo", "off", { layer: "video" });
        if (live.audio) chip("audio", "Áudio", "off", { layer: "audio" });
        if (live.tool) chip("tool", TOOL_LABEL[live.tool.mode] || "Timer", "off", { layer: "tool" });
        if (live.communication) chip("communication", "Aviso", "off", { layer: "communication" });
        if (live.alert) chip("alert", "Aviso rápido", "alertClear");
    }
    return {
        tone,
        title: screen === "black" ? "Tela preta" : screen === "logo" ? "Logo na tela" : onAir ? title : "Nada no ar",
        pos: onAir ? pos : "",
        since: onAir && !stale ? airFor(live, now) : "",
        chips,
        locked,
    };
}

// The banner under the header, at most one: no link, an outcome unknown,
// the screens locked.
export function bannerOf({ stale = false, unknown = false, locked = false, canUnlock = true } = {}) {
    if (stale) return { tone: "grey", text: "Sem sinal do computador. Os envios ficam desligados até voltar; Tela preta, Logo e Limpar continuam.", refresh: true };
    if (unknown) return { tone: "amber", text: messages.unknownOutcome, refresh: true };
    if (locked) return { tone: "amber", text: `Telas travadas: nada novo vai ao ar. Tela preta, Logo e Limpar continuam. ${canUnlock ? "Destrave em Mais (segure)." : "Destrave em Saídas, no computador."}`, refresh: false };
    return null;
}

// What a slide says on the phone: its text, else its label (a PDF's
// "Página 3"), else that it is a picture.
export const slideText = (slide) => String(slide?.text || "").trim() || slide?.label || (slide?.image_url ? "Imagem" : "");

// Ao vivo's cards and arrows from the content on air.
//   -> { has, index, count, now, next, reveal }
export function slideInfo(content) {
    const slides = content?.slides || [];
    if (!slides.length) return { has: false, index: 0, count: 0, now: "", next: "", reveal: false };
    const index = content.index || 0;
    const cur = slides[index];
    // An activity not fully revealed: → reveals it before changing slide.
    const reveal = activitySteps(cur) > revealStep(content, index);
    return { has: true, index, count: slides.length, now: slideText(cur), next: slides[index + 1] ? slideText(slides[index + 1]) : "", reveal };
}
// The slides sheet: one row per slide, the first line as its title.
export function slideRows(content) {
    return (content?.slides || []).map((s, i) => {
        const lines = slideText(s).split("\n").map((l) => l.trim()).filter(Boolean);
        return { i, title: lines[0] || `Slide ${i + 1}`, sub: lines.slice(1).join(" · "), air: i === (content.index || 0) };
    });
}

// The player card: the layer the console's player shows, where it is, its
// volume, and the eye (a video on the projector can leave it and keep its
// sound). null when nothing plays.
export function playerInfo(live, now = Date.now()) {
    const layer = playerLayer(live);
    const item = layer ? live[layer] : null;
    if (!item) return null;
    const pb = item.playback || {};
    const list = item.playlist;
    const swap = videoSwap(live, layer);
    return {
        layer,
        kind: item.kind,
        title: item.title || MEDIA_LABEL[item.kind] || "Mídia",
        at: clock(livePosition(pb, now)),
        length: item.duration ? clock(item.duration) : "",
        pct: item.duration ? Math.min(100, Math.max(0, (livePosition(pb, now) / item.duration) * 100)) : 0,
        paused: Boolean(pb.paused),
        volume: Math.round((pb.volume ?? 1) * 100),
        list: list && list.length > 1 ? `${(item.playlistIndex ?? 0) + 1}/${list.length}` : "",
        swap: swap ? { disabled: Boolean(swap.disabled), title: swap.title, sound: swap.action === "showVideo" } : null,
    };
}
// Volume in steps of 10 % (owner's pick: no slider on the phone).
export function volumeStep(volume, delta) {
    const v = Math.round((Number(volume) || 0) / 10) * 10 + delta;
    return Math.max(0, Math.min(100, v));
}

// Letra automática, when the song on air has one.
export function followInfo(content) {
    const f = content?.follow;
    if (!f) return null;
    return { label: followLabel(f), action: followAction(f), paused: Boolean(f.paused) };
}

// A timer on air (the one − / + adjust); a stopwatch shows its time only.
export function timerInfo(live, now = Date.now()) {
    const t = live?.tool;
    if (!t || (t.mode !== "timer" && t.mode !== "stopwatch")) return null;
    return { mode: t.mode, text: clock(toolTime(t, now) / 1000), adjust: t.mode === "timer" };
}

// The Setlist as the phone lists it: sections as headers, each item with
// its kind, time and length, and which one is on air, next, or was the last
// sent (on air no more: after Esc, or something else went on).
export const STATUS_TEXT = { missing: "Arquivo não encontrado", syncing: "Baixando…", blocked: "Preparando páginas" };
const two = (n) => String(n).padStart(2, "0");
const clockAt = (seconds) => {
    const s = Math.round(seconds) % 86400;
    return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}`;
};
export function setlistRows(state, live = null) {
    const air = state?.airItemId || null;
    const next = state?.nextItemId || null;
    const sent = live?.session?.itemId || null;
    return (state?.items || []).map((it) => {
        if (it.section || String(it.type).toUpperCase() === "SECTION") return { id: it.id, section: true, title: it.title || "Seção" };
        const sub = [typeLabel(it.type), Number.isFinite(it.at) ? clockAt(it.at) : "", it.dur ? clock(it.dur) : ""].filter(Boolean).join(" · ");
        const st = it.st && it.st !== "ok" ? it.st : null;
        return {
            id: it.id,
            section: false,
            title: it.title || "Sem título",
            icon: typeIcon(it.type),
            sub,
            tag: it.id === air ? "air" : it.id === next ? "next" : !air && it.id === sent ? "last" : null,
            st,
            stText: st ? STATUS_TEXT[st] || "" : "",
        };
    });
}
export const TAG_TEXT = { air: "no ar", next: "próximo", last: "último" };

// What a command's answer says on the phone ("Celular: Tela preta" without
// its "Celular: ", which the console's log needs).
export function sayOf(r) {
    if (!r) return "";
    if (!r.ok) return r.message || "Não foi possível.";
    const text = String(r.message || "").replace(/^Celular: /, "").replace(/\.$/, "");
    return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : "Feito.";
}
