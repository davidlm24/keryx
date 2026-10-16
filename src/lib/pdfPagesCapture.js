import { keryx } from "@/api/keryxClient";
import { needsPages, pageScale } from "@/lib/presentation";
// The worker ships in the build (Vite copies it, ?url gives its address):
// no CDN, the console reads PDFs offline.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// pdf.js is loaded the first time a PDF is read, never with the console.
let lib = null;
const pdfjs = () => {
    lib ||= import("pdfjs-dist").then((m) => {
        m.GlobalWorkerOptions.workerSrc = workerUrl;
        return m;
    });
    return lib;
};

// pdf.js's data files (character maps, standard fonts, image decoders and
// colour profiles), served at /pdfjs/ by the build and the dev server
// (vite.config.js, pdfjsAssets).
const assets = () => {
    const base = `${window.location.origin}/pdfjs/`;
    return { cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, iccUrl: `${base}iccs/` };
};

const jpeg = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Sem imagem da página."))), "image/jpeg", 0.9);
});

// Each page of a PDF (its bytes) as a JPEG about 1920 px wide, one at a
// time, on a white page as printed: onCount(total) first, then
// onPage({ n, total, blob, w, h }) for each, awaited before the next.
export async function renderPdfPages(data, { onCount, onPage } = {}) {
    const { getDocument } = await pdfjs();
    const task = getDocument({ data, ...assets() });
    try {
        const doc = await task.promise;
        const total = doc.numPages;
        onCount?.(total);
        for (let n = 1; n <= total; n++) {
            const page = await doc.getPage(n);
            const size = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: pageScale(size.width, size.height) });
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));
            await page.render({ canvas, viewport, background: "#ffffff" }).promise;
            const blob = await jpeg(canvas);
            const w = canvas.width;
            const h = canvas.height;
            // Let the pixels go before the next page (a long PDF on an old PC).
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
            await onPage?.({ n, total, blob, w, h });
        }
    } finally {
        // The document, its worker and what it held go (pdf.js 6: the task's).
        await task.destroy();
    }
}

// A PDF row's pages saved as media files of their own (UploadFile: the
// adapter stores them as keryx-media://, never the http form) and listed in
// Media.pages, the first one as its thumbnail. onProgress({ done, total }).
// -> the updated row
export async function savePages(row, { onProgress } = {}) {
    if (!needsPages(row)) return row;
    const res = await fetch(row.file_url);
    if (!res.ok) throw new Error("Não foi possível abrir o PDF.");
    const data = new Uint8Array(await res.arrayBuffer());
    const pages = [];
    await renderPdfPages(data, {
        onCount: (total) => onProgress?.({ done: 0, total }),
        onPage: async ({ n, total, blob, w, h }) => {
            const file = new File([blob], `${row.id || "pdf"}-pagina-${n}.jpg`, { type: "image/jpeg" });
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            pages.push({ url: file_url, w, h });
            onProgress?.({ done: n, total });
        },
    });
    if (!pages.length) throw new Error("O PDF não tem páginas.");
    return keryx.entities.Media.update(row.id, { pages, thumbnail_url: pages[0].url });
}
