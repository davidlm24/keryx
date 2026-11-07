// The same video (or picture, audio, PDF) twice in the Mídia (owner
// 2026-11-07: "o sistema deve alertar ao tentar salvar o mesmo vídeo"): the
// console asks before it adds what is already there ("Já está na Mídia":
// Pular as repetidas, the default, or Adicionar mesmo assim; the new ones go
// in either way). Pure rules; the questions are MediaView's, Library's and
// the Pedidos'. Compared only with the Mídia's own rows (useLibrary().media:
// no backgrounds — Trazer da Mídia copies a row there on purpose — and no
// fonts).
import { getYouTubeId } from "../utils/youtube.js";

// Names compared without accents, case or the spaces around them.
export const foldName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
// A file's title as the Mídia gives it (importMediaFiles): its name without the extension.
export const titleOfFile = (file) => String(file?.name || "").replace(/\.[^.]+$/, "");

// The picked files already in the Mídia: the same kind (`typeOf`, the
// Mídia's mediaTypeOf), the same title and the same size (a row whose size
// is not known yet, its file still being read, counts by its title). Two of
// the same file in one pick repeat too: the first goes in.
//   -> { fresh: [file], repeated: [{ file, row }] }  (row null: repeated within the pick)
export function repeatedFiles(files, media, typeOf) {
    const rows = (media || []).filter((m) => m && !getYouTubeId(m.file_url));
    const fresh = [];
    const repeated = [];
    const same = (a, b) => a.type === b.type && foldName(a.title) === foldName(b.title) && (a.size == null || b.size == null || a.size === b.size);
    for (const file of Array.from(files || [])) {
        const me = { type: typeOf(file), title: titleOfFile(file), size: file.size };
        const row = rows.find((m) => same(me, { type: m.type, title: m.title, size: m.size }));
        if (row) { repeated.push({ file, row }); continue; }
        const twin = fresh.find((f) => same(me, { type: typeOf(f), title: titleOfFile(f), size: f.size }));
        if (twin) { repeated.push({ file, row: null }); continue; }
        fresh.push(file);
    }
    return { fresh, repeated };
}

// The Mídia's row of this YouTube video, by the video's id, whatever form
// the link takes (youtu.be, &t=30, /shorts/) and also once it was downloaded
// (Baixar para a Mídia keeps the link in source_url). null: not there.
export function youtubeRow(url, media) {
    const id = getYouTubeId(String(url || ""));
    if (!id) return null;
    return (media || []).find((m) => m && (getYouTubeId(m.file_url || "") === id || getYouTubeId(m.source_url || "") === id)) || null;
}

// The question (ConfirmDialog): the action adds anyway; Cancelar, Esc and
// Enter skip (`danger`: it opens on the safe answer, confirm.js).
// `link`: a YouTube video (found by its id, so it IS there).
export function repeatQuestion(names, { link = false } = {}) {
    const one = names.length === 1;
    return {
        title: "Já está na Mídia",
        text: link ? "Este vídeo do YouTube já está na Mídia. Adicionar outra cópia?"
            : one ? "Este arquivo parece já estar na Mídia (mesmo nome e tamanho). Adicionar outra cópia?"
                : `Estes arquivos parecem já estar na Mídia (mesmo nome e tamanho). Os outros entram de qualquer jeito.`,
        list: names,
        ok: "Adicionar mesmo assim",
        no: one ? "Pular" : "Pular as repetidas",
        danger: true,
    };
}

// The toast's part for what was left out.
export const skippedSay = (n) => (n ? `${n} já ${n === 1 ? "estava" : "estavam"} na Mídia e ${n === 1 ? "ficou" : "ficaram"} de fora` : "");
