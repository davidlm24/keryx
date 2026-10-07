// A "stage" is what the console prepares in the Prévia: one item (a song, a
// passage, a media file, a communication piece, a tool) as the live-state
// operation that would put it on air, plus what the console needs to show it
// (title, slides, a start index). Pure: no I/O, no React.
import { songContent, passageContent, isVideoUrl } from "@/hooks/useProjectionControl";

const KIND_LABEL = { lyrics: "Música", bible: "Bíblia", text: "Texto", media: "Mídia", piece: "Aviso", tool: "Ferramenta", video: "Vídeo", audio: "Áudio" };

export function stageFromSong(song, ref = {}) {
    const content = songContent(song, ref);
    return { kind: "lyrics", id: `song:${song.id}`, title: song.title || "", meta: [song.artist, song.song_key, song.bpm && `${song.bpm} bpm`].filter(Boolean).join(" · "), slides: content.slides, index: 0, op: "content.show", args: { ...content, kind: "lyrics" }, video: isVideoUrl(song.audio_url) ? song.audio_url : null };
}

export function stageFromPassage(passage, ref = {}) {
    const content = passageContent(passage, ref);
    return { kind: "bible", id: `passage:${passage.id || passage.reference}`, title: passage.reference || "", meta: passage.version || "", slides: content.slides, index: 0, op: "content.show", args: { ...content, kind: "bible" } };
}

export function stageFromText(title, text) {
    return { kind: "text", id: `text:${title}`, title, meta: "Texto", slides: [{ text }], index: 0, op: "content.show", args: { kind: "text", title, slides: [{ text }] } };
}

// A Media row: videos, images, PDFs and the like go to the main projector's
// media layer; a video can be sent to the video screens instead (toVideo).
// An audio file goes to the audio channel: it plays under whatever the
// screens show.
export function stageFromMedia(media, { toVideo = false } = {}) {
    const kind = media.type === "video" && media.file_url?.includes("youtu") ? "youtube" : media.type;
    const item = { kind, url: media.file_url, title: media.title || "", duration: media.duration || undefined, id: media.id };
    if (kind === "audio") return { kind: "audio", id: `media:${media.id}`, title: media.title || "", meta: "Áudio", slides: [], index: 0, op: "audio.show", args: item, missing: Boolean(media.missing) };
    return { kind: toVideo ? "video" : "media", id: `media:${media.id}`, title: media.title || "", meta: KIND_LABEL[kind] || media.type, slides: [], index: 0, op: toVideo ? "video.show" : "media.show", args: item, missing: Boolean(media.missing) };
}

// Several audio files played one after the other (music before the service,
// during the offering): the player's Anterior / Próximo move through them.
export function stageFromAudioList(list) {
    const items = list.map((m) => ({ kind: "audio", url: m.file_url, title: m.title || "", id: m.id, duration: m.duration || undefined }));
    return { kind: "audio", id: `audios:${list.map((m) => m.id).join(",")}`, title: `${list.length} áudios em sequência`, meta: "Áudio", slides: [], index: 0, op: "audio.playlist", args: { items, index: 0 } };
}

export function stageFromYouTube(url) {
    return { kind: "video", id: `yt:${url}`, title: "Vídeo do YouTube", meta: "YouTube", slides: [], index: 0, op: "video.show", args: { kind: "youtube", url, title: "Vídeo do YouTube" } };
}

// A CommunicationVideo row (countdown, timer, announcement, image + text).
export function stageFromPiece(piece) {
    return { kind: "piece", id: `piece:${piece.id}`, title: piece.title || piece.text || "", meta: piece.type === "countdown" ? "Contagem regressiva" : piece.type === "timer" ? "Cronômetro" : "Aviso", slides: [], index: 0, op: "communication.show", args: { item: piece } };
}

export function stageFromTool(mode, { text = "", minutes = 5 } = {}) {
    const titles = { clock: "Relógio", stopwatch: "Cronômetro", timer: `Timer ${minutes} min`, freetext: "Texto livre" };
    const args = { mode, text };
    if (mode === "timer") args.durationMs = minutes * 60000;
    return { kind: "tool", id: `tool:${mode}:${text}:${minutes}`, title: titles[mode], meta: "Ferramenta", slides: mode === "freetext" ? [{ text }] : [], index: 0, op: "tool.show", args };
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
        if (r.passageId) return `passage:${r.passageId}`;
        return `${state.content.kind}:${state.content.title}`;
    }
    return null;
}

export const kindLabel = (kind) => KIND_LABEL[kind] || kind;
