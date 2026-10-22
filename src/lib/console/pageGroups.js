// One-line summaries of the groups in the window's pages (Rodada H4): what
// is chosen while a CfgGroup is closed. Pure, tested (pageGroups.test.mjs).

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Song editor › Tema desta música: `look` is the editor's own reading
// ({ theme, missing }), `following` true when the song follows the default.
// `step`: the size relative to the theme (Rodada P, P8-2, songSize.js).
export function songThemeSummary({ theme, themeName = "", missing = false, following = true, step = 0 } = {}) {
    const what = theme ? themeName || "tema sem nome" : missing ? "tema excluído" : following ? "sem tema próprio" : "só desta música";
    return step ? `${what} · tamanho ${step > 0 ? "+" : "−"}${Math.abs(step)}` : what;
}

// Song editor › Tema por parte: how many parts carry a theme.
export function partThemesSummary(partThemes, parts = []) {
    const keys = new Set(parts.map((p) => p.key));
    const n = Object.entries(partThemes || {}).filter(([k, v]) => v && keys.has(k)).length;
    if (!parts.length) return "sem partes marcadas";
    return n ? plural(n, "parte com tema", "partes com tema") : "nenhuma parte com tema";
}

// Song editor › Notas para os músicos.
export function notesSummary(text) {
    const t = String(text || "").trim();
    if (!t) return "vazio";
    return t.length > 40 ? `${t.slice(0, 40).trimEnd()}…` : t;
}

// Notice editor › Texto na tela: size · font · effect as the editor names them.
// `sizes`/`effects` are the editor's [value, label] option lists.
export function noticeTextSummary(draft, sizes = [], effects = []) {
    const label = (list, v) => (list.find(([k]) => k === v) || [])[1];
    return [label(sizes, draft.font_size || "large"), label(effects, draft.text_effect || "shadow")].filter(Boolean).join(" · ");
}

// Notice editor › Fundo: what the notice has behind its text.
export function noticeBackgroundSummary(draft) {
    const bits = [];
    if (draft.background_video) bits.push("vídeo");
    else if (draft.background_image) bits.push("imagem");
    else if (draft.background_color) bits.push("cor");
    if (draft.background_audio) bits.push("áudio");
    if ((draft.files || []).length) bits.push(`sequência de ${draft.files.length}`);
    return bits.join(" · ") || "sem fundo";
}
