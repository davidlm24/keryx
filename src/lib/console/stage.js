// A "stage" is what the console prepares in the Prévia: one item (a song, a
// passage, a media file, a communication piece, a tool) as the live-state
// operation that would put it on air, plus what the console needs to show it
// (title, slides, a start index). Pure: no I/O, no React.
import { songContent, passageContent, isVideoUrl } from "@/lib/console/content";
import { noticeLabel } from "@/lib/console/notice";
import { materialSlides, materialMeta } from "@/lib/console/school";
import { passageOf, chapterOf, chapterOnAir } from "@/lib/console/bibleVerses";

const KIND_LABEL = { lyrics: "Música", bible: "Bíblia", text: "Texto", media: "Mídia", piece: "Aviso", tool: "Ferramenta", video: "Vídeo", audio: "Áudio" };

export function stageFromSong(song, ref = {}, themes = []) {
    const content = songContent(song, ref, themes);
    return { kind: "lyrics", id: `song:${song.id}`, title: song.title || "", meta: [song.artist, song.song_key, song.bpm && `${song.bpm} bpm`].filter(Boolean).join(" · "), slides: content.slides, index: 0, op: "content.show", args: { ...content, kind: "lyrics" }, video: isVideoUrl(song.audio_url) ? song.audio_url : null,
        playback: song.audio_url && !isVideoUrl(song.audio_url) ? song.audio_url : null };
}

export function stageFromPassage(passage, ref = {}) {
    const content = passageContent(passage, ref);
    return { kind: "bible", id: `passage:${passage.id || passage.reference}`, title: passage.reference || "", meta: passage.version || "", slides: content.slides, index: 0, op: "content.show", args: { ...content, kind: "bible" } };
}

// Verses of one chapter (bibleVerses.js): one verse is its whole chapter
// from there (only a move when that chapter is on air: `onAir` is the
// content on air); several are that passage. Null when nothing fits.
export function stageFromVerses({ verses, nums, how = "auto", version, book, chapter, onAir = null }) {
    if (nums.length > 1) {
        const p = passageOf({ verses, nums, how, version, book, chapter });
        return p ? stageFromPassage({ reference: p.reference, text: p.text, slides: p.slides, version }) : null;
    }
    if (!nums.length) return null;
    const ch = chapterOf({ verses, n: nums[0], version, book, chapter });
    if (!ch) return null;
    if (chapterOnAir(onAir, { book, chapter, version })) return { ...stageAirSlide(onAir, ch.index, ch.id), title: ch.title };
    return { ...stageFromPassage(ch.passage, ch.ref), id: ch.id, title: ch.title, index: ch.index };
}

export function stageFromText(title, text) {
    // With no look of its own: the Texto theme dresses it when sent (themes.js).
    return { kind: "text", id: `text:${title}`, title, meta: "Texto", slides: [{ text }], index: 0, op: "content.show", args: { kind: "text", title, slides: [{ text }], inherit: { look: true, background: true } } };
}

// A Media row: videos, images, PDFs and the like go to the main projector's
// media layer; a video can be sent to the video screens instead (toVideo).
// An audio file goes to the audio channel: it plays under whatever the
// screens show.
export function stageFromMedia(media, { toVideo = false } = {}) {
    const kind = media.type === "video" && media.file_url?.includes("youtu") ? "youtube" : media.type;
    const item = { kind, url: media.file_url, title: media.title || "", duration: media.duration || undefined, id: media.id, poster: media.thumbnail_url || undefined };
    if (kind === "audio") return { kind: "audio", id: `media:${media.id}`, title: media.title || "", meta: "Áudio", slides: [], index: 0, op: "audio.show", args: item, missing: Boolean(media.missing) };
    return { kind: toVideo ? "video" : "media", id: `media:${media.id}`, title: media.title || "", meta: KIND_LABEL[kind] || media.type, slides: [], index: 0, op: toVideo ? "video.show" : "media.show", args: item, missing: Boolean(media.missing) };
}

// Several audio files played one after the other (music before the service,
// during the offering): the player's Anterior / Próximo move through them.
export function stageFromAudioList(list) {
    const items = list.map((m) => ({ kind: "audio", url: m.file_url, title: m.title || "", id: m.id, duration: m.duration || undefined }));
    return { kind: "audio", id: `audios:${list.map((m) => m.id).join(",")}`, title: `${list.length} áudios em sequência`, meta: "Áudio", slides: [], index: 0, op: "audio.playlist", args: { items, index: 0 } };
}

// Pictures and videos shown one after the other on the projector (images
// for their duration, videos to the end); the projector moves on by itself.
export function stageFromMediaList(list) {
    const items = list.map((m) => ({ kind: m.type === "video" && m.file_url?.includes("youtu") ? "youtube" : m.type, url: m.file_url, title: m.title || "", id: m.id, duration: m.duration || undefined, poster: m.thumbnail_url || undefined }));
    return { kind: "media", id: `medias:${list.map((m) => m.id).join(",")}`, title: `${list.length} mídias em sequência`, meta: "Mídia", slides: [], index: 0, op: "media.playlist", args: { items, index: 0 }, missing: list.some((m) => m.missing) };
}

export function stageFromYouTube(url) {
    return { kind: "video", id: `yt:${url}`, title: "Vídeo do YouTube", meta: "YouTube", slides: [], index: 0, op: "video.show", args: { kind: "youtube", url, title: "Vídeo do YouTube" } };
}

// A CommunicationVideo row (src/lib/console/notice.js): countdown, timer,
// attention, announcement, image + text.
export function stageFromPiece(piece) {
    return { kind: "piece", id: `piece:${piece.id}`, title: piece.title || piece.text || "", meta: noticeLabel(piece.type), slides: [], index: 0, op: "communication.show", args: { item: piece } };
}

// Every aviso one after the other ("Tocar todos"), on a loop: each for its
// duration (a cronômetro without one stays until moved on).
export function stageFromPieceList(list) {
    return { kind: "piece", id: `pieces:${list.map((p) => p.id).join(",")}`, title: `${list.length} avisos em sequência`, meta: "Avisos", slides: [], index: 0, op: "communication.show", args: { playlist: list, index: 0 } };
}

export function stageFromTool(mode, { text = "", minutes = 5 } = {}) {
    const titles = { clock: "Relógio", stopwatch: "Cronômetro", timer: `Timer ${minutes} min`, freetext: "Texto livre" };
    const args = { mode, text };
    if (mode === "timer") args.durationMs = minutes * 60000;
    return { kind: "tool", id: `tool:${mode}:${text}:${minutes}`, title: titles[mode], meta: "Ferramenta", slides: mode === "freetext" ? [{ text }] : [], index: 0, op: "tool.show", args };
}

// An Escola bíblica material (BibleMaterial, src/lib/console/school.js):
// slides, text and quizzes as slides (a quiz's answer is the slide after its
// question), video and image through the media layer. The teacher's notes
// ride along for the console and the stage screen (content.stage.notes),
// never the projector.
export function stageFromMaterial(m) {
    const notes = String(m.description || "").trim();
    const meta = materialMeta(m);
    if (m.type === "video" || m.type === "image") {
        const url = m.type === "video" ? m.video_url : m.image_url;
        if (!url) return { ...stageFromText(m.title || "Material", m.title || ""), id: `material:${m.id}`, meta, notes, missing: true };
        const s = stageFromMedia({ id: m.id, type: m.type, file_url: url, title: m.title || "" });
        return { ...s, id: `material:${m.id}`, meta, notes };
    }
    const slides = materialSlides(m);
    const style = { text_color: m.text_color || "", background_image: m.background_image || "", background_color: m.background_image ? "" : (m.background_color || "") };
    // The Texto theme fills what the material leaves at the factory look.
    const ownBg = Boolean(m.background_image || m.background_color);
    const args = { kind: "text", ref: { materialId: m.id }, title: m.title || "", slides: slides.length ? slides : [{ text: m.title || "" }], style, stage: notes ? { notes, musician_notes: notes, material: m.title || "" } : {}, inherit: { look: !m.text_color || m.text_color.toLowerCase() === "#ffffff", background: !ownBg } };
    return { kind: "text", lesson: true, id: `material:${m.id}`, title: m.title || "", meta, slides: args.slides, index: 0, op: "content.show", args, notes };
}

// A history entry (live.history[i]) back as a stage, for "Voltar ao anterior".
export function stageFromHistory(entry, restoreArgs) {
    const [op, args] = restoreArgs(entry);
    const slides = entry.layer === "content" ? entry.data.slides : [];
    const kind = entry.layer === "content" ? entry.data.kind : entry.layer === "communication" ? "piece" : entry.layer;
    return { kind, id: `history:${entry.at}`, title: entry.title, meta: "Esteve no ar", slides, index: entry.layer === "content" ? entry.data.index : 0, op, args };
}

// Another slide of what is on air, prepared in the Prévia: sending it only
// moves the live slide (content.goTo), so the song is not restarted.
export function stageAirSlide(content, index, id) {
    return { kind: content.kind, id, title: content.title, meta: "Slide no ar", slides: content.slides, index, op: "content.goTo", args: {}, airSlide: true };
}

// The operation that puts a stage on air, starting at its chosen slide.
export function stageOp(stage) {
    if (!stage) return null;
    if (stage.op === "content.goTo") return ["content.goTo", { index: stage.index }];
    const args = stage.slides.length ? { ...stage.args, index: stage.index } : stage.args;
    return [stage.op, args];
}

// The same stage at another slide (the console's selection in the Prévia).
export const stageAt = (stage, index) => ({ ...stage, index: Math.max(0, Math.min(stage.slides.length - 1, index)) });

// Which stage a live document is showing, so lists can mark "no ar".
export function liveStageId(state) {
    if (!state) return null;
    if (state.tool) return `tool:${state.tool.mode}`;
    if (state.communication) return state.communication.item?.id ? `piece:${state.communication.item.id}` : "piece";
    if (state.media) return state.media.id ? `media:${state.media.id}` : `media:${state.media.url}`;
    if (state.content) {
        const r = state.content.ref || {};
        if (r.songId) return `song:${r.songId}`;
        if (r.materialId) return `material:${r.materialId}`;
        if (r.passageId) return `passage:${r.passageId}`;
        return `${state.content.kind}:${state.content.title}`;
    }
    return null;
}

export const kindLabel = (kind) => KIND_LABEL[kind] || kind;
