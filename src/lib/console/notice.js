// Avisos (CommunicationVideo rows): the five kinds, their starting texts,
// and the arithmetic every screen shares — what a countdown shows, which
// background file plays now, when a piece in a sequence is over. Plain JS,
// no imports, so node --test can check it.

export const NOTICE_TYPES = [
    ["countdown", "clock", "Contagem regressiva"],
    ["timer", "history", "Cronômetro"],
    ["attention", "warn", "Chamar atenção"],
    ["announcement", "megaphone", "Anúncio"],
    ["image_text", "image", "Imagem + texto"],
];
export const noticeLabel = (type) => NOTICE_TYPES.find(([t]) => t === type)?.[2] || "Aviso";
export const noticeIcon = (type) => NOTICE_TYPES.find(([t]) => t === type)?.[1] || "megaphone";

// What a new piece of each kind starts with (the operator rewrites it).
export const NOTICE_PRESETS = {
    countdown: { text: "O culto começa em", subtext: "", duration: 300 },
    timer: { text: "Cronômetro", subtext: "", duration: 0 },
    attention: { text: "Atenção", subtext: "Carro placa ABC-1234 com o farol aceso", duration: 30 },
    announcement: { text: "Bem-vindos", subtext: "Que bom ter você aqui", duration: 20 },
    image_text: { text: "Retiro de jovens", subtext: "Inscrições até 12/10 na recepção", duration: 20 },
};

export function newNotice(type = "countdown") {
    const p = NOTICE_PRESETS[type] || NOTICE_PRESETS.countdown;
    return {
        type, title: p.text, text: p.text, subtext: p.subtext, duration: p.duration,
        text_color: "#ffffff", font_size: "large", font_family: "sans", text_effect: "shadow",
        text_position_h: "center", text_position_v: "middle", show_logo: true, logo_position: "top-left",
        sound_alert: type === "attention", background_image: "", background_color: "", background_video: "", background_audio: "", files: [],
    };
}

const two = (n) => String(n).padStart(2, "0");
export const clockOf = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    return `${h ? two(h) + ":" : ""}${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
};

// The big number: a countdown counts down from duration (and stops at 0), a
// cronômetro counts up (and stops at duration when it has one). -> ms | null
export function noticeTime(item, elapsedMs) {
    const d = Math.max(0, Number(item?.duration) || 0) * 1000;
    if (item?.type === "countdown") return Math.max(0, d - elapsedMs);
    if (item?.type === "timer") return d ? Math.min(elapsedMs, d) : elapsedMs;
    return null;
}

// In a sequence ("Tocar todos") a piece is over after its duration; a
// cronômetro without one, never. -> ms left, or null when it never ends.
export function noticeLeft(item, elapsedMs) {
    const d = Math.max(0, Number(item?.duration) || 0) * 1000;
    return d ? Math.max(0, d - elapsedMs) : null;
}

// The background files (images and videos shown one after the other, on a
// loop): which one is on at elapsedMs, and how far into it. Images last
// their own duration (5 s by default), videos theirs (15 s when unknown), so
// every screen computes the same file at the same moment.
export function fileAt(files, elapsedMs) {
    const list = (files || []).filter((f) => f && f.url && f.type !== "audio");
    if (!list.length) return null;
    const lens = list.map((f) => 1000 * (Number(f.duration) > 0 ? Number(f.duration) : f.type === "video" ? 15 : 5));
    const total = lens.reduce((a, b) => a + b, 0);
    let t = Math.max(0, elapsedMs) % total;
    for (const [index, len] of lens.entries()) {
        if (t < len) return { index, file: list[index], offsetMs: t };
        t -= len;
    }
    return { index: 0, file: list[0], offsetMs: 0 };
}
