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

// The Mídia row's progress while its pages are made: { done, total } or { error }.
export function pagesLabel(progress) {
    if (!progress) return "";
    if (progress.error) return "Não foi possível ler o PDF";
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

// "Tocar todos" (the media sequence): pictures and videos only. A PDF goes
// on air by itself, page by page; a PowerPoint not at all.
export const playsInSequence = (row) => row?.type === "video" || row?.type === "image" || row?.type === "gif";
