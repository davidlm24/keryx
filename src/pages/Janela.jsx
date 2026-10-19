// A page of THE window, DETACHED (Rodada F5, owner 2026-10-16: "Destacar em
// janela" on every page): Configurações, Planejar o culto, the Mídia, the
// Editor de música (and Sincronizar), the Editor de aviso, the Escola
// bíblica (and its Material), Relatórios and the two editors, in a window
// of their own for whoever works watching another monitor. The console's ⧉
// opens it (Console.jsx, nav.js detachSpec) after the page's own guard said
// it may leave; /Editor (the old detached Editor de temas e telas) lands
// here too.
//
// It is the console's window frame without the console: the same pages
// (WinPages.jsx), a stack of its own with Voltar, the confirm, prompt, menu
// and background library a page awaits, one toast, and Esc routed to the
// top page's request. It reads the store and the live state like any
// window; what goes to the Prévia or on air goes to the console instead
// (src/lib/janelaRelay.js), so the Prévia, what was on air and the
// service's log stay the console's. useConsole is never mounted here (its
// letra automática ticker and the Fundo's follow-ups run once, there): the
// page gets a light `c` (useJanelaConsole).
//
// Desktop only: never in NETWORK_SCREENS (electron/lan.cjs). One window per
// kind of page (keryx-janela-<page>): detaching it again navigates that one,
// and a page with unsaved changes asks before its window goes
// (useUnloadGuard; on the desktop electron/closeGuard.cjs).
import React, { useCallback, useEffect, useRef, useState } from "react";
import "@ds/tokens.css";
import "@ds/components/bundle.css";
import "@/components/console/console.css";
import { WinCtx, useLiveRegion } from "@/components/console/kx";
import { winPage } from "@/components/console/WinPages";
import { useStamp, useToast, useLiveOps, THEME_IN_USE_KEY } from "@/components/console/useConsole";
import { useLibrary, useRundown, pickDefaultService } from "@/components/console/useConsoleData";
import { useLiveState } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { useWindowTitle } from "@/hooks/useChurch";
import { ContextMenuProvider, ContextMenuLayer, menuRequest } from "@/components/console/ContextMenu";
import BackgroundLibrary from "@/components/console/library/BackgroundLibrary";
import { LibraryContext } from "@/components/console/library/libraryContext";
import ConfirmDialog, { ConfirmContext } from "@/components/console/ConfirmDialog";
import PromptDialog from "@/components/console/PromptDialog";
import Toast from "@/components/console/Toast";
import { useWinPageFocus } from "@/components/console/useDialogFocus";
import { setEditorHost } from "@/lib/editorWindow";
import { relaySend, relayListen } from "@/lib/janelaRelay";
import { setRelayedProgress, relayPagesRetry } from "@/hooks/usePagesBackfill";
import { PAGE_TITLES, openStack, push as winPush, pop as winPop, top as winTopOf, replaceTop as winReplaceTop, stackFromParams, detachSpec } from "@/lib/console/nav";
import { resolveSection } from "@/lib/console/settings";
import { liveAction, escapeTarget } from "@/lib/console/keys";
import { usePrefs } from "@/hooks/useUser";
import { blurSelectsAfterPick } from "@/lib/console/selectPick";

// Where a control keeps the focus after a mouse click: overlays that run
// their own keys (a question, the palette…).
const KEEPS_FOCUS = ".dialog, .palette, .lyr, .addmenu";

// The theme in use, as the console keeps it on this computer (localStorage):
// what a song or a material in this window is dressed with in its previews.
function useThemeInUse() {
    const read = () => { try { return localStorage.getItem(THEME_IN_USE_KEY) || null; } catch { return null; } };
    const [id, setId] = useState(read);
    useEffect(() => {
        const on = (e) => { if (e.key === null || e.key === THEME_IN_USE_KEY) setId(read()); };
        window.addEventListener("storage", on);
        return () => window.removeEventListener("storage", on);
    }, []);
    return id;
}

// What the pages need of a console, without the console: the live state,
// the stamp, a toast and the ops any window may run (useLiveOps); no ticking
// clock, as in useConsole (what shows the time keeps its own). The Prévia is
// the CONSOLE's — the page's "Pôr na prévia" goes there, and `prev` is what
// the console says it holds (console.prev).
function useJanelaConsole() {
    const live = useLiveState();
    const themeId = useThemeInUse();
    const { stamp, bgPrefs } = useStamp(themeId);
    const { toast, toastAction, say, holdToast } = useToast();
    const ops = useLiveOps(live, say, bgPrefs);
    const [prev, setPrevMirror] = useState(null);
    useEffect(() => {
        const off = relayListen("janela", (m) => {
            if (m.type === "console.prev") setPrevMirror(m.stage);
            // The PDFs' pages are the console's work: their progress comes from
            // it, and Tentar de novo goes back to it (Rodada H, HB).
            else if (m.type === "pages.progress") setRelayedProgress(m.pages);
        });
        relayPagesRetry((id) => relaySend("janela", "pages.retry", { id }));
        relaySend("janela", "console.hello");
        return () => { off(); relayPagesRetry(null); };
    }, []);
    const setPrev = useCallback((stage) => {
        if (stage?.missing) say(`Arquivo não encontrado: ${stage.title}. Localize o arquivo antes de projetar.`);
        // A PowerPoint, or a PDF whose pages are being made (presentation.js).
        else if (stage?.blocked) say(stage.blocked);
        if (relaySend("janela", "prev.set", { stage: stage || null })) setPrevMirror(stage || null);
        else say("Não foi possível pôr na Prévia do console.");
    }, [say]);
    return { live, cur: live, bgPrefs, themeId, prev, setPrev, ...ops, stamp, toast, toastAction, say, holdToast, detached: true };
}

// The stack this window opens with: its params (nav.js stackFromParams), or,
// as the old /Editor did with none, the Editor da tela on the Projeção.
const firstStack = () => {
    try { return stackFromParams(new URLSearchParams(window.location.search)) || openStack({ page: "screen", props: { path: "/Projection" } }); } catch { return openStack({ page: "screen", props: { path: "/Projection" } }); }
};

export default function Janela() {
    const c = useJanelaConsole();
    // The toasts, said by one polite region that is always there (C-25).
    const [liveRegion, announce] = useLiveRegion();
    useEffect(() => { if (c.toast) announce(c.toast); }, [c.toast, announce]);
    const data = useLibrary();
    const logoUrl = useChurchLogo();
    const [stack, setStack] = useState(firstStack);
    const stackRef = useRef(stack);
    stackRef.current = stack;
    const winTop = winTopOf(stack);
    // The focus moves into the page shown when it changes (C-12), as in the console.
    const boxRef = useRef(null);
    useWinPageFocus(boxRef, stack);
    useWindowTitle(winTop ? PAGE_TITLES[winTop.page] : "");

    // Configurações' section, and the culto Planejar o culto shows (the
    // console's when it was detached; changing it here changes only here).
    const [cfgAt, setCfgAt] = useState(() => resolveSection(stack[0]?.page === "config" && stack[0].props.section ? stack[0].props.section : "igreja"));
    const cfg = cfgAt?.id || null;
    const setCfg = useCallback((id, tab) => setCfgAt(id ? resolveSection(tab ? `${id}/${tab}` : id) : null), []);
    const [serviceId, setServiceId] = useState(() => stack[0]?.props?.serviceId || null);
    const { services } = useRundown(serviceId);
    useEffect(() => { if (!serviceId && services.length) setServiceId(pickDefaultService(services)?.id || null); }, [services, serviceId]);

    // The URL follows the first page, so a reload (F5) reopens it.
    useEffect(() => {
        const spec = stack.length ? detachSpec([stack[0]], { section: cfg, serviceId }) : null;
        if (!spec) return;
        try { window.history.replaceState(null, "", `${window.location.pathname}?${spec.query}`); } catch { /* the URL is cosmetic */ }
    }, [stack, cfg, serviceId]);

    // The last level left (its guard said yes): the pages unmount first —
    // their unsaved-changes holds go with them — then the window closes.
    // window.close works: the console opened this window. Opened by a typed
    // URL it may be refused; then the toast says what to do.
    const say = c.say;
    useEffect(() => {
        if (stack.length) return undefined;
        window.close();
        const t = setTimeout(() => say("Feche esta janela quando terminar."), 150);
        return () => clearTimeout(t);
    }, [stack.length, say]);

    // The dialogs a page awaits, as the console has them.
    const [libReq, setLibReq] = useState(null);
    const pickFromLibrary = useCallback((opts = {}) => new Promise((resolve) => {
        setLibReq((prev) => { prev?.resolve(null); return { ...opts, resolve }; });
    }), []);
    const closeLibrary = useCallback((result = null) => setLibReq((prev) => { prev?.resolve(result); return null; }), []);
    const [confirmReq, setConfirmReq] = useState(null);
    const askConfirm = useCallback((opts) => new Promise((resolve) => setConfirmReq((prev) => { prev?.resolve(false); return { ...opts, resolve }; })), []);
    const answerConfirm = useCallback((yes) => setConfirmReq((prev) => { prev?.resolve(Boolean(yes)); return null; }), []);
    const [ask, setAsk] = useState(null);
    const askText = useCallback((spec) => new Promise((resolve) => setAsk({ ...spec, resolve })), []);
    const answerAsk = useCallback((value) => setAsk((prev) => { prev?.resolve(value ?? null); return null; }), []);
    const [ctxMenu, setCtxMenu] = useState(null);
    const openMenu = useCallback((e, spec) => { e.preventDefault(); e.stopPropagation(); setCtxMenu(menuRequest(e, spec)); }, []);

    // The stack (nav.js), as the console's: Esc, Voltar and the (x) go
    // through the top page's request; a page that registered none just leaves.
    const winRefs = useRef(new Map());
    const winRef = (k) => { if (!winRefs.current.has(k)) winRefs.current.set(k, { current: null }); return winRefs.current.get(k); };
    useEffect(() => {
        const keys = new Set(stack.map((e) => e.key));
        for (const k of [...winRefs.current.keys()]) if (!keys.has(k)) winRefs.current.delete(k);
    }, [stack]);
    const leaveTop = useCallback((all = false) => setStack((s) => (all || s.length <= 1 ? [] : winPop(s))), []);
    const winEsc = useCallback((mode = "esc") => {
        const t = winTopOf(stackRef.current);
        if (!t) return;
        const fn = winRefs.current.get(t.key)?.current;
        if (fn) fn(mode); else leaveTop(mode === "all");
    }, [leaveTop]);

    // openEditor (Configurações › Temas, Telas e saídas, Editar tema…) lands
    // in this window, a level up — as it does in the console's.
    useEffect(() => setEditorHost(({ theme, screen, from }) => {
        const spec = theme ? { page: "theme", props: { id: theme } } : { page: "screen", props: { path: screen || "/Projection" } };
        closeLibrary(null);
        setStack((s) => (s.length ? winPush(s, spec, from || PAGE_TITLES[winTopOf(s)?.page]) : openStack(spec)));
        return true;
    }), [closeLibrary]);

    // What only the console does goes there (janelaRelay.js).
    const toConsole = (type, payload, said) => {
        if (relaySend("janela", type, payload)) { if (said) say(said); return true; }
        say("O console não recebeu: ele está aberto?");
        return false;
    };
    const host = {
        c, data, logoUrl, askText,
        push: (spec, from) => setStack((s) => winPush(s, spec, from)),
        replaceTop: (props, opts) => setStack((s) => winReplaceTop(s, props, opts)),
        // Said here too: the console refuses it, but its toast is over there.
        sendNow: (s) => (s?.blocked ? (say(s.blocked), false) : toConsole("stage.send", { stage: s })),
        // No stage (the Escola's Enviar ao ar button): what the console's
        // Prévia holds goes, as Enter does — `stage: undefined` is no message.
        sendStage: (s) => (!s ? toConsole("prev.send", {}) : s.blocked ? (say(s.blocked), false) : toConsole("stage.send", { stage: s })),
        songSaved: (row) => { if (row?.id) relaySend("janela", "song.saved", { song: row }); },
        addMaterial: (m) => toConsole("setlist.material", { material: { id: m.id, title: m.title || "Material" } }),
        cfg, setCfg, uiLayout: null, setUiLayout: () => {}, restoreLayout: () => {},
        openScreen: (path) => setStack((s) => winPush(s, { page: "screen", props: { path: path || "/Projection" } }, "Telas e saídas")),
        openWhatsNew: () => toConsole("console.open", { what: "novidades" }, "As novidades abriram no console."),
        services, serviceId, setServiceId, plannerFocus: null,
    };

    // Keys: Esc closes what is on top (a menu, a question, the library, then
    // one level of the stack — the first closes the window). Tela preta and
    // Logo work on every page, as behind the console's window; the Escola
    // bíblica is the projecting page, so there every live key works — Enter
    // sends the console's Prévia, ↑/↓ walk it, ←/→ move what is on air, C clears.
    const letters = usePrefs().letter_keys;
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        const action = liveAction(e, letters);
        if (!action) return;
        if (action === "blur") { e.target.blur?.(); return; }
        if (action === "end") {
            const top = escapeTarget({ menu: ctxMenu, confirm: confirmReq || ask, library: libReq, window: stack.length > 0 });
            e.preventDefault();
            if (top === "menu") setCtxMenu(null);
            else if (top === "confirm") { if (ask) answerAsk(null); else answerConfirm(false); }
            else if (top === "library") closeLibrary(null);
            else if (top === "window") winEsc("esc");
            return;
        }
        if ((ctxMenu || libReq || confirmReq || ask) && !["black", "logo"].includes(action)) return;
        // Prevented: a select focused with Tab would also jump to its option.
        if (action === "black") { e.preventDefault(); c.toggleScreen("black"); }
        else if (action === "logo") { e.preventDefault(); c.toggleScreen("logo"); }
        else if (winTop?.page !== "school") return;
        else if (action === "send") { e.preventDefault(); toConsole("prev.send", {}); }
        else if (action === "next" || action === "prev") { e.preventDefault(); c.moveSlide(action === "next" ? 1 : -1); }
        else if (action === "selUp" || action === "selDown") { e.preventDefault(); toConsole("prev.step", { d: action === "selDown" ? 1 : -1 }); }
        else if (action === "clear") { e.preventDefault(); c.clearText(); }
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // A mouse click must not leave focus on the control it hit (the keys
    // would then be that control's), as in the console; a select gives it
    // back after a mouse pick (selectPick.js, audit C-03).
    const onMouseClick = (e) => {
        if (e.detail === 0) return;
        const t = e.target.closest?.("button, [role='button'], [role='tab'], [role='radio'], [role='menuitem'], [role='listitem'][tabindex], a[href]");
        if (t && !t.closest(KEEPS_FOCUS)) setTimeout(() => t.blur?.(), 0);
    };
    useEffect(() => blurSelectsAfterPick(window, { skip: KEEPS_FOCUS }), []);

    // On the desktop (Windows) the system draws its buttons over the page
    // (main.cjs titleBarOverlay): the WinBar is then the title bar and its
    // own × would be a second close button.
    const systemFrame = typeof navigator !== "undefined" && Boolean(navigator.windowControlsOverlay?.visible);

    return (
        <ContextMenuProvider value={openMenu}>
        <LibraryContext.Provider value={pickFromLibrary}>
        <ConfirmContext.Provider value={askConfirm}>
        <div className="kx console janela" onClick={onMouseClick}>
            {stack.length > 0 && (
                <div ref={boxRef} className="win-dialog is-detached" role="main" aria-label={PAGE_TITLES[winTop.page]}>
                    {stack.map((entry, i) => {
                        const active = i === stack.length - 1;
                        const page = winPage(entry, { active, escRef: winRef(entry.key), onClose: (all = false) => leaveTop(Boolean(all)) }, host);
                        return (
                            <WinCtx.Provider key={entry.key} value={{ back: entry.back, onBack: () => winEsc("back"), onCloseAll: () => winEsc("all"), onResetSize: null, onDetach: null, detached: true, systemFrame }}>
                                <div className="win-page" hidden={!active}>{page}</div>
                            </WinCtx.Provider>
                        );
                    })}
                </div>
            )}
            {libReq && <BackgroundLibrary c={c} request={libReq} onDone={closeLibrary} />}
            {confirmReq && <ConfirmDialog request={confirmReq} onAnswer={answerConfirm} />}
            <PromptDialog ask={ask} onAnswer={answerAsk} />
            <Toast c={c} />
            {liveRegion}
            <ContextMenuLayer menu={ctxMenu} onClose={() => setCtxMenu(null)} />
        </div>
        </ConfirmContext.Provider>
        </LibraryContext.Provider>
        </ContextMenuProvider>
    );
}
