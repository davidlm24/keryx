// The kinds of content the screens show, one list for every setting that
// is decided per kind (Rodada G5, agreed with the Codex plan 2026-10-18):
// Transições › Por tipo de conteúdo reads it now, and Mostrar (SHOW_KINDS,
// src/lib/outputPrefs.js) is built from it; the per-output content rule of
// G10 replaces Mostrar on top of this same list. Pure (tested): the outputs
// read it, so it imports nothing of the console.
//   - id: the kind's key in a saved setting (never rename one);
//   - label: its name in a list of every kind (Transições);
//   - short: its name where the screens are listed (Mostrar);
//   - layer: the live-state layer it is drawn on (shared/live-state.mjs),
//     and for the content and media layers the item kinds that are it;
//   - transition: whether it has a row in Transições › Por tipo de conteúdo.
export const CONTENT_TYPES = [
    { id: "lyrics", label: "Músicas", short: "Letras", layer: "content", kinds: ["lyrics"], transition: true },
    { id: "bible", label: "Bíblia", short: "Bíblia", layer: "content", kinds: ["bible"], transition: true },
    { id: "text", label: "Textos e Escola bíblica", short: "Texto", layer: "content", kinds: ["text"], transition: true },
    { id: "presentation", label: "Apresentações (PDF)", short: "Apresentações", layer: "content", kinds: ["presentation"], transition: true },
    { id: "image", label: "Imagens e GIFs", short: "Imagens", layer: "media", kinds: ["image", "gif"], transition: true },
    { id: "video", label: "Vídeos e YouTube", short: "Vídeos", layer: "media", kinds: ["video", "youtube", "audio"], transition: true },
    { id: "notice", label: "Avisos", short: "Avisos", layer: "communication", transition: true },
    { id: "tool", label: "Timer, relógio, cronômetro", short: "Relógio e timer", layer: "tool", transition: true },
    // The Aviso rápido has each screen's own entrance (Ajustes › Aviso rápido).
    { id: "alert", label: "Aviso rápido", short: "Aviso rápido", layer: "alert", transition: false },
];

export const contentType = (id) => CONTENT_TYPES.find((t) => t.id === id) || null;
// The kinds Transições › Por tipo de conteúdo lists, in order.
export const TRANSITION_TYPES = CONTENT_TYPES.filter((t) => t.transition);
export const TRANSITION_TYPE_IDS = TRANSITION_TYPES.map((t) => t.id);

// The kind of a media item (live.media, a Mídia row's kind): image or video;
// an old PDF or PowerPoint row is a presentation. null: not a media kind.
export function mediaType(kind) {
    if (kind === "pdf" || kind === "powerpoint") return "presentation";
    const t = CONTENT_TYPES.find((x) => x.layer === "media" && x.kinds.includes(kind));
    return t ? t.id : null;
}

// The kind of what a layer of the live state holds now, else null.
export function typeOf(layer, item) {
    if (!item) return null;
    if (layer === "content") return CONTENT_TYPES.find((t) => t.layer === "content" && t.kinds.includes(item.kind ?? "lyrics"))?.id || null;
    if (layer === "media" || layer === "video") return mediaType(item.kind);
    return CONTENT_TYPES.find((t) => t.layer === layer)?.id || null;
}
