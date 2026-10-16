import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, emptyState, mainLayer } from "../../shared/live-state.mjs";
import { streamCaption } from "./streamCaption.js";
import {
    PPTX_HINT, PAGES_PENDING, pageScale, pagesOf, needsPages, presentationSlides, presentationStage, presentationBlock, pagesLabel, presentationMeta, playsInSequence,
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

test("the Mídia row's line: progress, pages, what it needs", () => {
    assert.equal(pagesLabel({ done: 6, total: 12 }), "Preparando páginas 7/12");
    assert.equal(pagesLabel({ done: 12, total: 12 }), "Preparando páginas 12/12");
    assert.equal(pagesLabel({ done: 0, total: 0 }), "Preparando páginas…");
    assert.equal(pagesLabel({ error: "x" }), "Não foi possível ler o PDF");
    assert.equal(presentationMeta(pdf), "2 páginas");
    assert.equal(presentationMeta({ ...pdf, pages: [pages[0]] }), "1 página");
    assert.equal(presentationMeta({ ...pdf, pages: [] }), "Preparando páginas…");
    assert.equal(presentationMeta(pdf, { done: 1, total: 2 }), "Preparando páginas 2/2");
    assert.equal(presentationMeta({ type: "powerpoint" }), "Salve como PDF");
    assert.equal(presentationMeta({ type: "video" }), "");
});

test("Tocar todos: pictures and videos only, never a PDF or a PowerPoint", () => {
    assert.deepEqual(["video", "image", "gif", "pdf", "powerpoint", "audio"].filter((type) => playsInSequence({ type })), ["video", "image", "gif"]);
});
