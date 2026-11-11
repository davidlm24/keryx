// "Exportar vídeo com a letra…" (owner 2026-11-11): what the console decides
// before asking main (electron/lyricVideo.cjs) to make the MP4. Pure.

const isMark = (v) => Number.isFinite(v);
const isYouTube = (url) => /youtu\.?be/.test(String(url || ""));

// The song's length in seconds: its own, else its playback's (the Mídia row
// of that file). null when neither is known.
export function videoLength(song, media = []) {
    if (Number(song?.duration) > 0) return Number(song.duration);
    const row = (media || []).find((m) => m.file_url && m.file_url === song?.audio_url);
    return Number(row?.duration) > 0 ? Number(row.duration) : null;
}

// Why it cannot be made now ("" = it can), in the order the operator fixes
// them. `desktop`: the program (not the browser preview); `ffmpeg`: this
// KERYX brought it (null = not known yet).
export function exportBlock(song, { desktop = true, ffmpeg = true, media = [] } = {}) {
    if (!desktop) return "Só no programa, não na prévia do navegador.";
    if (ffmpeg === false) return "Este KERYX não trouxe o ffmpeg: o vídeo com a letra não pode ser feito aqui.";
    if (!song) return "Escolha uma música.";
    if (!song.audio_url) return "A música não tem playback: escolha um em Vídeo ou playback….";
    if (isYouTube(song.audio_url)) return "Um link do YouTube não serve: baixe-o para a Mídia e escolha o arquivo.";
    const marked = (song.slides || []).some((s) => isMark(s?.start)) || (song.line_starts || []).some(isMark);
    if (!marked) return "Marque os tempos primeiro (Marcar os tempos).";
    if (!videoLength(song, media)) return "Preencha a duração da música.";
    return "";
}

// The progress line of a job (keryx:lyricVideo).
export function jobLine(job) {
    if (!job) return "";
    if (job.phase === "frames") return `Desenhando os slides · ${job.pct || 0} %`;
    if (job.phase === "encode") return `Juntando as imagens e o som · ${job.pct || 0} %`;
    if (job.phase === "done") return `Pronto: ${job.out}`;
    if (job.phase === "canceled") return "Cancelado.";
    if (job.phase === "failed") return job.error || "Não foi possível fazer o vídeo.";
    return "";
}
