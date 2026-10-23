// What the Slides column keeps after Esc (owner 2026-10-23, Rodada Q7, pick
// S4 = A): Esc takes the song off the screens, not out of the operator's
// hands. The item whose slides were on air stays in the column as "Saiu do
// ar", the slide where it stopped marked; a click prepares a slide in the
// Prévia (which stays empty until then), a double click sends it. Limpar
// texto (C) keeps it the same way when it took text slides off. Pure (the
// live state's helpers by a relative path), so node --test can check it.
import { restoreArgs } from "./restore.js";

// Which items are on air now, by when each started: a new one (or Desfazer
// putting the old one back) changes it, and the kept item goes. Volume,
// seeks, Tela preta and the Fundo leave it as it is.
export function airKey(live) {
    if (!live) return "";
    return [live.content?.startedAt, live.media?.shownAt, live.video?.shownAt, live.tool?.startedAt, live.communication?.startedAt].map((v) => v ?? "").join("|");
}

// The id the console's lists know the item by (liveStageId in stage.js), so
// the Setlist and the Biblioteca still find it.
function idOf(content, at) {
    const r = content.ref || {};
    if (r.songId) return `song:${r.songId}`;
    if (r.materialId) return `material:${r.materialId}`;
    if (r.passageId) return `passage:${r.passageId}`;
    if (r.mediaId) return `media:${r.mediaId}`;
    return `last:${at}`;
}

// `before`: the live state just before Esc / Limpar; `after`: the state they
// made. Null when no slides were on air (a video or a picture alone does not
// count) or the text is still there. -> a stage (as stageFromHistory builds
// one: sending it puts the item back at that slide) plus `stopped`, the slide
// it left on, and `key`, airKey(after).
export function lastFromEnd(before, after) {
    const content = before?.content;
    if (!content?.slides?.length || after?.content) return null;
    const at = after?.updatedAt ?? content.startedAt ?? 0;
    const [op, args] = restoreArgs({ layer: "content", data: content });
    const stopped = Math.max(0, Math.min(content.slides.length - 1, content.index || 0));
    return { kind: content.kind, id: idOf(content, at), title: content.title || "", meta: "Saiu do ar", slides: content.slides, index: stopped, op, args, stopped, key: airKey(after) };
}

// Whether the kept item still stands: not once something new is on air (the
// key moved on) or the Prévia holds an item (`hand`).
export const lastStays = (last, live, hand) => Boolean(last && !hand && airKey(live) === last.key);

// What the Slides column shows: the Prévia's item, else what is on air, else
// the item kept after Esc. -> "prev" | "air" | "last" | null.
export function columnSource({ hand, air, last }) {
    if (hand) return "prev";
    if (air?.slides?.length) return "air";
    if (last?.slides?.length) return "last";
    return null;
}
