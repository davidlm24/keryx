// YouTube links in the Mídia: what the check found, what a download is doing,
// what the console says when the player refused one on air (owner
// 2026-10-27, mockup "YouTube · checar o link e baixar para a Mídia",
// Y1–Y5). Pure; the work is electron/youtube.cjs.

import { getYouTubeId } from "../utils/youtube.js";

// A Media row that is a YouTube link (not a file downloaded from one).
export const isYouTubeRow = (m) => Boolean(m) && m.type === "video" && Boolean(getYouTubeId(m.file_url || ""));

// The check's words in the Link do YouTube dialog: { tone: ok|warn, text }.
export function checkWords(check) {
    switch (check?.state) {
        case "ok": return { tone: "ok", text: "Toca no KERYX pela internet" };
        case "blocked": return { tone: "warn", text: "O dono deste vídeo não deixa tocar fora do YouTube. No ar ele mostraria “Este vídeo não está disponível”." };
        case "missing": return { tone: "warn", text: "Este vídeo não existe ou é privado." };
        case "offline": return { tone: "warn", text: "Não deu para conferir agora (sem internet). Ele pode não tocar no culto." };
        case "error": return { tone: "warn", text: "O YouTube não respondeu à conferência. Ele pode não tocar no culto." };
        default: return null;
    }
}

// The dialog's buttons for a check: the link only where it may play (or
// could not be checked), the download wherever there is a video.
export function linkActions(check) {
    const state = check?.state;
    if (!state) return [];
    if (state === "missing") return [];
    if (state === "blocked") return ["download"];
    return ["add", "download"];
}

// The Media row's youtube_state for a check (unchanged when it says nothing).
export const stateOfCheck = (check) => (["ok", "blocked", "missing"].includes(check?.state) ? check.state : undefined);

// YouTube's player error numbers: 101/150 the owner blocks embedding, 100
// gone or private; anything else is not the video's fault.
export function stateOfCode(code) {
    if (code === 101 || code === 150) return "blocked";
    if (code === 100) return "missing";
    return null;
}

const mb = (n) => {
    const v = n / 1e6;
    return v >= 100 ? String(Math.round(v)) : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
};

// A download job's line under the row ("Baixando 42 % · 18 de 43 MB").
export function jobMeta(job) {
    if (!job) return "";
    switch (job.phase) {
        case "waiting": return "Na fila para baixar";
        case "downloading": {
            if (!job.total) return job.bytes ? `Baixando · ${mb(job.bytes)} MB` : "Baixando…";
            const pct = Math.min(99, Math.floor((job.bytes / job.total) * 100));
            return `Baixando ${pct} % · ${mb(job.bytes)} de ${mb(job.total)} MB`;
        }
        case "saving": return "Salvando na Mídia…";
        case "failed": return job.message || "Não foi possível baixar.";
        case "canceled": return "Download cancelado";
        default: return "";
    }
}

// 0..1 for the thin bar along the row, null when it should not show.
export function jobFraction(job) {
    if (!job || (job.phase !== "downloading" && job.phase !== "saving")) return null;
    if (job.phase === "saving") return 1;
    return job.total ? Math.min(1, job.bytes / job.total) : 0;
}

export const jobActive = (job) => Boolean(job) && ["waiting", "downloading", "saving"].includes(job.phase);

// The toast when an output took a refused link off the screens (Y4 = A).
export function refusedWords(refused) {
    const name = refused?.title ? `“${refused.title}”` : "o vídeo";
    if (stateOfCode(refused?.code) === "missing") return `${name} não existe mais ou é privado no YouTube. As telas voltaram ao papel de parede.`;
    if (stateOfCode(refused?.code) === "blocked") return `O YouTube não deixou tocar ${name} fora do site. As telas voltaram ao papel de parede.`;
    return `O YouTube não tocou ${name} (erro ${refused?.code || "?"}). As telas voltaram ao papel de parede.`;
}

// A Media row's line about its link (the Mídia's rows, the Setlist), or "".
export function linkNote(m) {
    if (!isYouTubeRow(m)) return "";
    if (m.youtube_state === "blocked") return "o dono não deixa tocar fora do YouTube";
    if (m.youtube_state === "missing") return "não existe mais ou é privado";
    return "";
}

// The Terms of Service sentence (Y5 = A: asked once, before the first download).
export const TERMS_TEXT = "Os Termos do YouTube não permitem baixar vídeos sem a autorização de quem os publicou. Baixe só vídeos que a igreja tem permissão de usar (do próprio ministério, liberados pelo autor, ou com licença).";
export const TERMS_CHECK = "A igreja só vai baixar vídeos que tem permissão de usar";
