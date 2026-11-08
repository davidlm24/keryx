import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, emptyState, mainLayer } from "../../shared/live-state.mjs";
import { streamCaption } from "./streamCaption.js";
import {
    PPTX_HINT, PAGES_PENDING, PAGES_FAILED, pageScale, pagesOf, needsPages, presentationSlides, presentationStage, presentationBlock, stageBlock, pagesLabel, presentationMeta, presentationPreviewStatus, pdfFailure, pdfFailureMessage, playsInSequence, pagesWait, PAGES_WAIT_MS,
} from "./presentation.js";

const pages = [{ url: "http://127.0.0.1:7700/media/a-1.jpg", w: 1920, h: 1080 }, { url: "http://127.0.0.1:7700/media/a-2.jpg", w: 1920, h: 1080 }];
const pdf = { id: "m1", type: "pdf", title: "Missões 2026", file_url: "http://127.0.0.1:7700/media/a.pdf", pages };

test("a page is about 1920 px wide; a portrait page at most 2160 px high", () => {
    assert.equal(pageScale(960, 540), 2, "a 16:9 slide of 960 pt: 1920 px wide");
    assert.equal(pageScale(3840, 2160), 0.5);
    const a4 = pageScale(595, 842);
    assert.equal(Math.round(842 * a4), 2160, "a portrait A4: as tall as two 1080 p screens, not 2700 px");
    assert.equal(pageScale(0, 0), 1, "a page with no size: as it is");
});

test("which PDFs still need their pages, and the pages a row has", () => {
    assert.equal(needsPages({ ...pdf, pages: [] }), true);
    assert.equal(needsPages({ ...pdf, pages: undefined }), true);
    assert.equal(needsPages(pdf), false, "already has them");
    assert.equal(needsPages({ ...pdf, pages: [], missing: true }), false, "a file not on this computer");
    assert.equal(needsPages({ ...pdf, pages: [], file_url: "keryx-media://a.pdf" }), false, "only a URL the window can load");
    assert.equal(needsPages({ type: "powerpoint", file_url: "http://x/a.pptx" }), false, "PowerPoint is never converted");
    assert.deepEqual(pagesOf({ pages: [{ url: "" }, null, pages[0]] }), [pages[0]]);
});

test("a PDF with pages is a presentation stage: one slide per page, its title, ref { mediaId }", () => {
    const s = presentationStage(pdf);
    assert.equal(s.kind, "presentation");
    assert.equal(s.id, "media:m1", "the same id as the Mídia row's, so the lists mark it");
    assert.equal(s.op, "content.show");
    assert.deepEqual(s.slides, presentationSlides(pages));
    assert.deepEqual(s.slides[1], { text: "", image_url: pages[1].url, label: "Página 2" });
    assert.deepEqual(s.args, { kind: "presentation", ref: { mediaId: "m1" }, title: "Missões 2026", slides: s.slides });
    assert.equal(s.meta, "Apresentação · 2 páginas");
    assert.ok(!("inherit" in s.args) && !("style" in s.args) && !("fundo" in s.args), "no theme dresses it, no Fundo comes with it");
    // On air it is content: the arrows walk it; the stream shows nothing (text only).
    const live = applyOp(emptyState(1), s.op, { ...s.args, index: 0 }, 1);
    assert.equal(mainLayer(live), "content");
    assert.equal(applyOp(live, "content.next", {}, 2).content.slides[1].label, "Página 2");
    assert.equal(streamCaption(live), null, "Transmissão: text only, never a page");
});

test("what cannot go on air says why: a PowerPoint, a PDF before its pages", () => {
    assert.equal(presentationBlock({ type: "powerpoint" }), PPTX_HINT);
    assert.match(PPTX_HINT, /Arquivo › Salvar como › PDF/);
    assert.equal(presentationBlock({ ...pdf, pages: [] }), PAGES_PENDING);
    assert.equal(presentationBlock(pdf), null);
    assert.equal(presentationBlock({ type: "image" }), null);
    assert.equal(presentationBlock({ ...pdf, pages: [], missing: true }), null, "a missing file says so itself");
});

test("a PDF whose pages failed says so, never 'being prepared' for ever", () => {
    const waiting = { blocked: PAGES_PENDING };
    assert.equal(stageBlock(waiting), PAGES_PENDING);
    assert.equal(stageBlock(waiting, { done: 2, total: 9 }), PAGES_PENDING, "still being made");
    assert.match(stageBlock(waiting, { error: "falhou" }), /Não deu para preparar as páginas/);
    assert.equal(stageBlock({ blocked: PPTX_HINT }, { error: "x" }), PPTX_HINT, "a PowerPoint keeps its own reason");
    assert.equal(stageBlock({ kind: "presentation" }), null);
    assert.equal(stageBlock(null), null);
});

test("the Mídia row's line: progress, pages, what it needs", () => {
    assert.equal(pagesLabel({ done: 6, total: 12 }), "Preparando páginas 7/12");
    assert.equal(pagesLabel({ done: 12, total: 12 }), "Preparando páginas 12/12");
    assert.equal(pagesLabel({ done: 0, total: 0 }), "Preparando páginas…");
    assert.match(pagesLabel({ error: "x" }), /Não deu para preparar as páginas/);
    assert.equal(presentationMeta(pdf), "2 páginas");
    assert.equal(presentationMeta({ ...pdf, pages: [pages[0]] }), "1 página");
    assert.equal(presentationMeta({ ...pdf, pages: [] }), "Preparando páginas…");
    assert.equal(presentationMeta(pdf, { done: 1, total: 2 }), "Preparando páginas 2/2");
    assert.equal(presentationMeta({ type: "powerpoint" }), "Salve como PDF");
    assert.equal(presentationMeta({ type: "video" }), "");
});

test("PDF errors are concise, actionable and a password PDF is not retried", () => {
    const locked = pdfFailure({ name: "PasswordException" });
    assert.equal(locked.retryable, false);
    assert.equal(pdfFailureMessage(locked), "PDF protegido por senha. Tire a senha e envie de novo.");
    assert.equal(pdfFailure({ name: "InvalidPDFException" }).cause, "o arquivo está corrompido ou incompleto");
    assert.equal(pdfFailure(new RangeError("out of memory")).cause, "faltou memória para este PDF; tente um arquivo menor");
    assert.equal(pdfFailure(new Error("worker failed")).cause, "o leitor de PDF não abriu; reinicie o KERYX");
    assert.equal(presentationPreviewStatus({ blocked: PAGES_PENDING }, { done: 2, total: 12 }), "Preparando páginas 3/12 · Pode ir ao ar quando terminar.");
    assert.equal(presentationPreviewStatus({ blocked: PAGES_PENDING }, { error: locked }), "PDF protegido por senha. Tire a senha e envie de novo.");
});

test("Tocar todos: pictures and videos only, never a PDF or a PowerPoint", () => {
    assert.deepEqual(["video", "image", "gif", "pdf", "powerpoint", "audio"].filter((type) => playsInSequence({ type })), ["video", "image", "gif"]);
});

test("pagesWait: a PDF sent here goes now; one from another computer waits for that one's pages", () => {
    const now = Date.parse("2026-10-16T20:00:00.000Z");
    const at = (ms) => ({ type: "pdf", created_date: new Date(now - ms).toISOString() });
    assert.equal(pagesWait(at(1000), { mine: true, now }), 0);
    assert.equal(pagesWait(at(60 * 1000), { now }), PAGES_WAIT_MS - 60 * 1000);
    assert.equal(pagesWait(at(PAGES_WAIT_MS + 1), { now }), 0, "nobody sent them: this computer makes them");
    assert.equal(pagesWait({ type: "pdf" }, { now }), 0, "rows from before have no date to wait from");
});

test("pagesWait: only a computer that syncs waits; not known yet waits as before", () => {
    const now = Date.parse("2026-10-16T20:00:00.000Z");
    const fresh = { type: "pdf", created_date: new Date(now - 1000).toISOString() };
    assert.equal(pagesWait(fresh, { syncs: false, now }), 0, "no other computer can send its pages");
    assert.equal(pagesWait(fresh, { syncs: true, now }), PAGES_WAIT_MS - 1000);
    assert.equal(pagesWait(fresh, { syncs: null, now }), PAGES_WAIT_MS - 1000, "the status has not come yet");
    assert.equal(pagesWait(fresh, { mine: true, syncs: true, now }), 0);
});
