import { createPageUrl } from "@/utils";

const WINDOW_NAME = "keryx_projection";
const PROJ_URL = createPageUrl("Projection");

let win = null;
let ready = false;
const pending = [];

function flush() {
    if (!win || win.closed || !ready) return;
    while (pending.length) {
        try { win.postMessage(pending.shift(), "*"); } catch (e) { /* noop */ }
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("message", (e) => {
        if (e.data && e.data.type === "PROJECTION_READY") {
            ready = true;
            flush();
        }
    });
}

/**
 * Abre (ou reutiliza) a janela ÚNICA de projeção em /Projection.
 * Sempre a mesma janela — nunca abre janelas novas por conteúdo.
 */
export function openProjectionWindow() {
    if (win && !win.closed) {
        try { win.focus(); } catch (e) {}
        return win;
    }
    ready = false;
    pending.length = 0;
    win = window.open(
        PROJ_URL,
        WINDOW_NAME,
        "width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no"
    );
    // Fallbacks: se o sinal PROJECTION_READY não chegar, assumir pronto após intervalos
    [1200, 2500, 4000, 7000].forEach((d) => {
        setTimeout(() => { if (!ready) { ready = true; flush(); } }, d);
    });
    return win;
}

/**
 * Envia uma mensagem para a janela única de projeção.
 * Abre-a automaticamente se ainda não existir e faz fila até estar pronta.
 */
export function sendToProjection(message) {
    if (!win || win.closed) {
        openProjectionWindow();
    }
    pending.push(message);
    flush();
    if (win && !win.closed) {
        try { win.focus(); } catch (e) {}
    }
}

export function closeProjectionWindow() {
    if (win && !win.closed) {
        try { win.close(); } catch (e) {}
    }
    win = null;
    ready = false;
    pending.length = 0;
}

export function isProjectionWindowOpen() {
    return !!(win && !win.closed);
}