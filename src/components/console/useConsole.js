import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { stageOp } from "@/lib/console/stage";
import { undoEndOps } from "@/lib/console/restore";
import { lookDefaults, withLookDefaults } from "@/lib/console/look";
import { withBackgroundDefaults, backgroundDefaults, backgroundLook } from "@/lib/console/backgroundPrefs";
import { useBackgroundPrefs, useThemes } from "./useConsoleData";
import { themeForKind, withThemeDefaults, withThemeInUse, themeBackgroundArgs } from "@/lib/console/themes";
import { layerLocked } from "@shared/live-state.mjs";
import { fundoOps } from "@/lib/console/backgroundSpec";
import { useUser, usePrefs } from "@/hooks/useUser";

// The console's own state around the live state. One console, always live:
// every operation goes to the live state (shared/live-state.mjs).
//
// Rehearsing is "Travar telas" (Saídas): with the screens locked (live.locked)
// the console still prepares and browses, nothing new reaches the screens,
// and anything can still come off (Tela preta, Logo, Limpar, Esc). The lock
// is enforced where the document changes (applyOp, in the main process), so
// it holds for every sender; the console only says so first.
//
// The Prévia is a stage, never sent until the operator sends it (a double
// click, Enter, or "Enviar ao ar"). Every other change of what is on screen
// goes through callOp.
export const LOCKED_SAY = "Telas travadas: nada vai ao ar. Destrave em Saídas.";

export function useConsole() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const [prev, setPrevState] = useState(null);
    // The church's default transition (Configurações › Aparência, on User),
    // stamped into each item that goes on air (src/lib/console/look.js).
    const user = useUser();
    const look = useMemo(() => lookDefaults(user), [user]);
    // Each background's dim and blur (Aparência › Fundos), a starting point
    // for the items that use it. stamp() gives an op the church's defaults;
    // the Prévia renders through it too, so it shows what will go out.
    const bgPrefs = useBackgroundPrefs();
    // The default theme (Configurações › Aparência › Temas) dresses a song
    // or a passage that has no look of its own, at send time: what is on
    // air never changes by itself (themes.js, withThemeDefaults).
    // A Bible passage takes the Bíblia's own theme (Configurações › Bíblia
    // e músicas, or the Bíblia's Tema button); everything else the default.
    const themes = useThemes();
    // One default theme per kind (themes.js themeForKind): Música, Bíblia,
    // Texto and Timer (a tool.show).
    const prefs = usePrefs();
    const kindIds = useMemo(() => ({ bible: prefs.bible_theme_id, text: prefs.text_theme_id, tool: prefs.timer_theme_id }), [prefs.bible_theme_id, prefs.text_theme_id, prefs.timer_theme_id]);
    // The service in hand may have its own theme per kind (Visual do culto,
    // serviceLook.js): they come before the church's. Console.jsx sets them.
    const [serviceThemes, setServiceThemes] = useState(null);
    // The theme in use (owner's decision 2026-10-13, the hybrid): the one
    // last clicked in the Fundo layer's strip. It dresses everything sent
    // until someone changes it (withThemeInUse in stamp); the Visual do
    // culto only seeds it when the service is chosen (Console.jsx). Shown
    // in Camadas as "Tema: …"; null = the culto's, else the church's.
    const [themeId, setThemeId] = useState(null);
    const stamp = useCallback((op, args) => withBackgroundDefaults(op, withLookDefaults(op, withThemeDefaults(op, args, themeForKind(themes, op === "tool.show" ? "tool" : args?.kind, kindIds, withThemeInUse(serviceThemes, themeId))), look), bgPrefs), [themes, kindIds, serviceThemes, themeId, look, bgPrefs]);
    const [toast, setToastState] = useState(null);
    const toastTimer = useRef(null);

    // A toast: one line, 3 s; with an action ({ label, run }) a button and
    // 8 s, so there is time to reach it.
    const say = useCallback((text, action = null) => {
        setToastState({ text, action });
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastState(null), action ? 8000 : 3000);
    }, []);
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const locked = Boolean(live?.locked);

    // One operation on the live state. Resolves with the new document; errors
    // (a refused op while locked, a bad argument) become a toast.
    const liveOp = useCallback(async (op, args = {}) => {
        try {
            // A background (an item's, an aviso's, the idle wallpaper) brings
            // the dim and blur Aparência › Fundos gave it; already there: kept.
            return await keryx.live.call(op, withBackgroundDefaults(op, args, bgPrefs));
        } catch (err) {
            say(err?.message || "Não foi possível projetar.");
            throw err;
        }
    }, [say, bgPrefs]);
    const callOp = liveOp;

    // The idle wallpaper follows its settings: editing its dim or blur in
    // Fundos (or the settings loading after it was applied) updates the
    // screens that show it.
    useEffect(() => {
        if (live?.idle !== "background" || !live.idleUrl) return;
        const { dim, blur } = backgroundDefaults(bgPrefs, live.idleUrl);
        if (dim === (live.idleDim ?? null) && blur === (live.idleBlur ?? null)) return;
        keryx.live.call("idle.set", { mode: "background", url: live.idleUrl, dim, blur }).catch(() => {});
    }, [live?.idle, live?.idleUrl, live?.idleDim, live?.idleBlur, bgPrefs]);

    // The Fundo on air follows its picture's settings (the library is the one
    // place to set dim, blur, fit and position, 2026-10-13): when they change,
    // the Fundo showing that picture takes them at once. Only on a change of
    // the settings — a theme that brought its own dim keeps it until then —
    // and never past Camadas' padlock.
    const liveRef = useRef(live);
    liveRef.current = live;
    const seenPrefs = useRef(null);
    useEffect(() => {
        const prev = seenPrefs.current;
        seenPrefs.current = bgPrefs;
        if (prev === null) return;
        const cur = liveRef.current;
        const bg = cur?.background;
        if (!bg || (bg.kind !== "image" && bg.kind !== "video") || layerLocked(cur, "background")) return;
        const look = backgroundLook(bgPrefs, bg.value);
        // This picture's own settings, not another picture's row (a favourite, a hidden one).
        if (JSON.stringify(look) === JSON.stringify(backgroundLook(prev, bg.value))) return;
        const patch = Object.fromEntries(Object.entries(look).filter(([k, v]) => v !== null && v !== (bg[k] ?? null)));
        if (Object.keys(patch).length) keryx.live.call("background.set", { ...bg, ...patch }).catch(() => {});
    }, [bgPrefs]);

    const setPrev = useCallback((stage) => {
        if (stage?.missing) say(`Arquivo não encontrado: ${stage.title}. Localize o arquivo antes de projetar.`);
        setPrevState(stage);
    }, [say]);

    // Send: the Prévia (or the stage given) goes to the screens. Resolves
    // true when it went.
    const send = useCallback(async (stage = prev) => {
        if (locked) { say(LOCKED_SAY); return false; }
        if (!stage) { say("Nada na prévia. Escolha um item da Setlist, uma música ou um versículo."); return false; }
        if (stage.missing) { say("Arquivo não encontrado · Localizar… antes de enviar."); return false; }
        // A theme's example (the Fundo layer strip, nothing on air): sending it uses
        // the theme — its background on the Fundo (not past the padlock) —
        // never the example text.
        if (stage.theme) {
            const bg = themeBackgroundArgs(stage.theme);
            try { if (bg && !layerLocked(live, "background")) await callOp("background.set", bg); } catch { return false; }
            setThemeId(stage.theme.id);
            setPrevState(null);
            say(`Tema ${stage.theme.name} em uso.`);
            return true;
        }
        const [op, stageArgs] = stageOp(stage);
        const args = stamp(op, stageArgs);
        const ref = stage.args?.ref || {};
        try {
            if (!live?.session) await projection.startSession(ref.serviceId || null);
            if (stage.video) await callOp("video.show", { kind: "video", url: stage.video, title: stage.title });
            // The item's own background (its own, its theme's, the default
            // theme's) goes to the Fundo layer first, unless the padlock
            // holds it (backgroundSpec.js fundoOps).
            for (const [o, a] of fundoOps(op, args, live)) await callOp(o, a);
            if (ref.serviceItemId) await callOp("session.item", { itemId: ref.serviceItemId, index: ref.serviceItemIndex ?? null }).catch(() => {});
        } catch {
            return false;
        }
        setPrevState(null);
        return true;
    }, [prev, locked, live, callOp, say, stamp]);

    const moveSlide = useCallback((d) => {
        if (!live?.content) { say("Nada com slides no ar."); return; }
        if (locked) { say(LOCKED_SAY); return; }
        callOp(d > 0 ? "content.next" : "content.prev").catch(() => {});
    }, [live, locked, callOp, say]);

    const goTo = useCallback((index) => {
        if (locked) { say(LOCKED_SAY); return Promise.resolve(); }
        return callOp("content.goTo", { index }).catch(() => {});
    }, [locked, callOp, say]);

    // Tela preta / Mostrar logo: emergency actions, they work locked too.
    const toggleScreen = useCallback((which) => {
        const next = live?.screen === which ? "show" : which;
        liveOp("screen.set", { mode: next }).catch(() => {});
    }, [live, liveOp]);

    // Limpar texto: the text layers go; background, logo and media stay.
    const clearText = useCallback(async () => {
        for (const op of ["tool.clear", "communication.clear", "content.clear"]) await callOp(op).catch(() => {});
    }, [callOp]);

    // Desfazer (the toast after Esc / Encerrar): what the screens showed goes
    // straight back (src/lib/console/restore.js). Not while locked: putting
    // something on air is what the lock refuses.
    const undoEnd = useCallback(async (before) => {
        if (locked) { say(LOCKED_SAY); return; }
        try {
            for (const [op, args] of undoEndOps(before)) await liveOp(op, args);
            say("Projeção de volta.");
        } catch { /* liveOp said why */ }
    }, [locked, liveOp, say]);

    // Encerrar (Esc, at once; the button, after asking): everything on the
    // main projector and the video screens goes; background, logo, overlays
    // and the alert have their own controls. The toast offers Desfazer
    // (owner's decision 2026-10-10).
    const end = useCallback(async () => {
        const before = live;
        try { await callOp("clear"); } catch { return; }
        if (undoEndOps(before).length) say("Projeção encerrada.", { label: "Desfazer", run: () => undoEnd(before) });
        else say("Projeção encerrada.");
    }, [live, callOp, say, undoEnd]);

    // Travar telas / Destravar (Saídas, the banner).
    const setLocked = useCallback((on) => {
        liveOp("screens.lock", { locked: Boolean(on) })
            .then(() => say(on ? "Telas travadas: prepare à vontade, nada novo vai às telas." : "Telas destravadas: enviar volta a mudar as telas."))
            .catch(() => {});
    }, [liveOp, say]);

    return { live, now, cur: live, bgPrefs, themeId, setThemeId, setServiceThemes, locked, setLocked, prev, setPrev, send, moveSlide, goTo, toggleScreen, clearText, end, undoEnd, callOp, liveOp, stamp, toast: toast?.text || null, toastAction: toast?.action || null, say };
}
