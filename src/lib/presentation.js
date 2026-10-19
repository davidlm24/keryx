// Apresentações (Rodada F3, owner 2026-10-16, "Só PDF"): a PDF of the Mídia
// becomes its pages as pictures when it is sent there (Media.pages, made by
// the console with pdf.js: src/lib/pdfPagesCapture.js), and goes on air as a
// content of kind "presentation", one page per slide, so the arrows, the
// Slides column, No ar, the controle remoto and every screen walk it like a
// song. PowerPoint files are not converted: the operator saves them as PDF.
// Pure, so node --test can check it (presentation.test.mjs).

// What the Mídia says when a PowerPoint file is chosen or prepared.
export const PPTX_HINT = "Apresentações do PowerPoint: no PowerPoint, use Arquivo › Salvar como › PDF e envie o PDF.";
// A PDF whose pages are not ready (being prepared, or a file that could not be read).
export const PAGES_PENDING = "As páginas deste PDF ainda estão sendo preparadas.";
export const PAGES_FAILED = "Não foi possível ler as páginas deste PDF.";

// Errors from fetch, pdf.js and the page renderer are intentionally reduced
// to four short, actionable messages. Their raw text differs by browser and
// PDF producer and should never become operator-facing copy.
export function pdfFailure(error) {
    if (error && typeof error === "object" && error.cause) return error;
    const name = String(error?.name || "").toLowerCase();
    const text = String(error?.message || error || "").toLowerCase();
    if (name.includes("password") || /password|senha|encrypted/.test(text)) return { cause: "o arquivo está protegido por senha", retryable: false, terminal: "PDF protegido por senha. Tire a senha e envie de novo." };
    if (name.includes("invalidpdf") || /invalid pdf|corrupt|corromp|incomplet|unexpected end|end of file/.test(text)) return { cause: "o arquivo está corrompido ou incompleto", retryable: true };
    if (name.includes("rangeerror") || /out of memory|memory|mem[oó]ria|allocation|canvas.*size/.test(text)) return { cause: "faltou memória para este PDF; tente um arquivo menor", retryable: true };
    return { cause: "o leitor de PDF não abriu; reinicie o KERYX", retryable: true };
}

export function pdfFailureMessage(error) {
    const failure = pdfFailure(error);
    return failure.terminal || `Não deu para preparar as páginas: ${failure.cause}.`;
}

export const isPowerPoint = (row) => row?.type === "powerpoint";
export const isPdf = (row) => row?.type === "pdf";

// A page's picture: about 1920 px wide (a projector), at most 2160 px high
// (a portrait page shown whole on a 1080 p screen needs no more).
export const PAGE_MAX_W = 1920;
export const PAGE_MAX_H = 2160;
export function pageScale(width, height, maxW = PAGE_MAX_W, maxH = PAGE_MAX_H) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) return 1;
    return Math.min(maxW / w, maxH / h);
}

// The pages a row has (only the ones with a picture).
export const pagesOf = (row) => (Array.isArray(row?.pages) ? row.pages.filter((p) => p && typeof p.url === "string" && p.url) : []);

// A PDF of the library without its pages yet. Files that are not on this
// computer, and links, are left alone.
export function needsPages(row) {
    if (!isPdf(row) || row.missing || pagesOf(row).length) return false;
    return String(row.file_url || "").startsWith("http");
}

// How long to wait before making a PDF's pages here (ms; 0 = now). With the
// sync between the church's computers (docs/desktop-architecture.md §8b) a
// PDF sent on another computer arrives here before its pages do, and both
// would make them: the computer it was sent on starts at once, every other
// one waits PAGES_WAIT_MS from when the row was made, and the pages usually
// arrive with the row's next change. `mine`: the row was made in this
// window (importMediaFiles). Rows from before (no date, or older) go now.
// `syncs`: this computer syncs (a folder and the church's code). Only then
// can a row come from another computer, so a computer that does not goes
// now — a PDF sent from a detached Mídia window included; null (not known
// yet) waits, as before.
export const PAGES_WAIT_MS = 5 * 60 * 1000;
export function pagesWait(row, { mine = false, syncs = null, now = Date.now() } = {}) {
    if (mine || syncs === false) return 0;
    const made = Date.parse(row?.created_date || "");
    if (!Number.isFinite(made)) return 0;
    return Math.max(0, made + PAGES_WAIT_MS - now);
}

// The pages as the live state's slides (content.show, kind "presentation").
export const presentationSlides = (pages) => (pages || []).map((p, i) => ({ text: "", image_url: p.url, label: `Página ${i + 1}` }));

// A PDF with its pages as a stage (src/lib/console/stage.js): a content.show
// of kind "presentation", the PDF's title, ref { mediaId } so the lists mark
// it on air. No style, no inherit, no fundo: no theme dresses it and the
// Fundo stays as it is under it.
export function presentationStage(media) {
    const slides = presentationSlides(pagesOf(media));
    const title = media.title || "";
    const n = slides.length;
    return {
        kind: "presentation", id: `media:${media.id}`, title, meta: `Apresentação · ${n} ${n === 1 ? "página" : "páginas"}`, slides, index: 0,
        op: "content.show", args: { kind: "presentation", ref: { mediaId: media.id }, title, slides }, missing: Boolean(media.missing),
    };
}

// Why a PDF or a PowerPoint row cannot go on air now (null: it can).
export function presentationBlock(row) {
    if (isPowerPoint(row)) return PPTX_HINT;
    if (isPdf(row) && !row.missing && !pagesOf(row).length) return PAGES_PENDING;
    return null;
}

// What to say about a stage that cannot go on air, given how the making of
// its pages went (usePagesBackfill's { error } for its Media id): a PDF whose
// pages failed says so, never "being prepared" for ever.
export function stageBlock(stage, progress = null) {
    if (!stage?.blocked) return null;
    return stage.blocked === PAGES_PENDING && progress?.error ? pdfFailureMessage(progress.error) : stage.blocked;
}

// The Mídia row's progress while its pages are made: { done, total } or { error }.
export function pagesLabel(progress) {
    if (!progress) return "";
    if (progress.error) return pdfFailureMessage(progress.error);
    if (!progress.total) return "Preparando páginas…";
    return `Preparando páginas ${Math.min(progress.done + 1, progress.total)}/${progress.total}`;
}

// What a PDF or PowerPoint row says in the lists (besides its kind): the
// pages it has, the work going on, or what it needs.
export function presentationMeta(row, progress = null) {
    if (isPowerPoint(row)) return "Salve como PDF";
    if (!isPdf(row)) return "";
    if (progress) return pagesLabel(progress);
    const n = pagesOf(row).length;
    if (n) return `${n} ${n === 1 ? "página" : "páginas"}`;
    return row.missing ? "" : "Preparando páginas…";
}

// The Prévia keeps the PDF in hand but makes it unambiguous that it cannot
// yet be sent. Unlike a toast, this remains visible until the last page is
// ready or the operator retries a recoverable failure.
export function presentationPreviewStatus(stage, progress = null) {
    if (stage?.blocked !== PAGES_PENDING) return stage?.blocked || "";
    if (progress?.error) return pdfFailureMessage(progress.error);
    return `${pagesLabel(progress) || "Preparando páginas…"} · Pode ir ao ar quando terminar.`;
}

// "Tocar todos" (the media sequence): pictures and videos only. A PDF goes
// on air by itself, page by page; a PowerPoint not at all.
export const playsInSequence = (row) => row?.type === "video" || row?.type === "image" || row?.type === "gif";
