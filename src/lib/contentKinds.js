// The kinds of content the screens show, one list for every setting that
// is decided per kind (Rodada G5, agreed with the Codex plan 2026-10-18):
// Transições › Por tipo de conteúdo reads it, and the per-output content rule
// "O que esta tela recebe" (Rodada H2 / G10, RULE_KINDS below, src/lib/outputPrefs.js)
// is built on the same layers (the old Mostrar is migrated into it). Pure (tested): the outputs
// read it, so it imports nothing of the console.
//   - id: the kind's key in a saved setting (never rename one);
//   - label: its name in a list of every kind (Transições);
//   - short: its short name;
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

// "O que esta tela recebe" (Rodada H2 / G10, owner 2026-10-19): the kinds an
// OUTPUT's content rule lists, the same list on every output. It is finer than
// CONTENT_TYPES where an operator thinks in files — a video of the computer
// and a YouTube link are two kinds here (one row in Transições) — and its ids
// are the saved ones (OutputPref.content_rule.kinds): never rename one.
//   - group: the list's heading in Ajustes › Conteúdo.
export const RULE_KINDS = [
    { id: "lyrics", label: "Letras", group: "Textos" },
    { id: "bible", label: "Bíblia", group: "Textos" },
    { id: "text", label: "Texto livre", group: "Textos" },
    { id: "image", label: "Imagens", group: "Mídia" },
    { id: "video", label: "Vídeos do computador", group: "Mídia" },
    { id: "youtube", label: "YouTube", group: "Mídia" },
    { id: "presentation", label: "Apresentações (PDF)", group: "Mídia" },
    { id: "tool", label: "Relógio e timer", group: "Ferramentas e avisos" },
    { id: "notice", label: "Avisos", group: "Ferramentas e avisos" },
];
export const RULE_KIND_IDS = RULE_KINDS.map((k) => k.id);
export const RULE_GROUPS = [...new Set(RULE_KINDS.map((k) => k.group))];
export const ruleKind = (id) => RULE_KINDS.find((k) => k.id === id) || null;
export const TEXT_KINDS = ["lyrics", "bible", "text"];

// The rule kind of what a layer of the live state holds (content, media,
// video, communication, tool), else null. A YouTube link is its own kind;
// a sound file counts with the videos, as in Transições.
export function ruleKindOf(layer, item) {
    if (!item) return null;
    if (layer === "communication") return "notice";
    if (layer === "tool") return "tool";
    if (layer === "media" || layer === "video") {
        if (item.kind === "youtube") return "youtube";
        const t = mediaType(item.kind);
        return t === "image" || t === "presentation" || t === "video" ? t : null;
    }
    const t = typeOf(layer, item);
    return RULE_KIND_IDS.includes(t) ? t : null;
}

// What a prepared stage (src/lib/console/stage.js) is for the rule; null when
// the rule never leaves it out (audio, the sound channel).
const STAGE_RULE_KIND = { lyrics: "lyrics", bible: "bible", text: "text", presentation: "presentation", tool: "tool", piece: "notice" };
export function stageRuleKind(stage) {
    if (!stage) return null;
    if (stage.kind === "media" || stage.kind === "video") return ruleKindOf("media", stage.args?.items?.[0] || stage.args);
    return STAGE_RULE_KIND[stage.kind] || null;
}
