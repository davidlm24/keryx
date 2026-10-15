import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { stageOp } from "@/lib/console/stage";
import { undoEndOps } from "@/lib/console/restore";
import { lookDefaults, withLookDefaults } from "@/lib/console/look";
import { withBackgroundDefaults, backgroundDefaults, backgroundLook } from "@/lib/console/backgroundPrefs";
import { useBackgroundPrefs, useThemes } from "./useConsoleData";
import { themeForKind, withThemeDefaults, themeBackgroundArgs, themeName } from "@/lib/console/themes";
import { layerLocked, followIndex } from "@shared/live-state.mjs";
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
// The theme in use, on this computer (localStorage, like the arrangement).
const THEME_IN_USE_KEY = "keryx.themeInUse";
export const LOCKED_SAY = "Telas travadas: nada vai ao ar. Destrave em Saídas.";

export function useConsole() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const [prev, setPrevState] = useState(null);
    // The Bíblia's display preferences (Configurações › Bíblia e músicas,
    // on User), stamped into each passage that goes on air
    // (src/lib/console/look.js). The transition is the theme's alone.
    const user = useUser();
    const look = useMemo(() => lookDefaults(user), [user]);
    // Each background's dim and blur (Aparência › Fundos), a starting point
    // for the items that use it. stamp() gives an op the church's defaults;
    // the Prévia renders through it too, so it shows what will go out.
    const bgPrefs = useBackgroundPrefs();
    // The default theme (Configurações › Temas e fundos) dresses a song
    // or a passage that has no look of its own, at send time: what is on
    // air never changes by itself (themes.js, withThemeDefaults).
    // A Bible passage takes the Bíblia's own theme (Configurações › Bíblia
    // e músicas, or the Bíblia's Tema button); everything else the songs'.
    const themes = useThemes();
    // One default theme per kind (themes.js themeForKind): Música, Bíblia,
    // Texto and Timer (a tool.show).
    const prefs = usePrefs();
    const kindIds = useMemo(() => ({ bible: prefs.bible_theme_id, text: prefs.text_theme_id, tool: prefs.timer_theme_id }), [prefs.bible_theme_id, prefs.text_theme_id, prefs.timer_theme_id]);
    // The theme in use (owner's decisions 2026-10-13/14): the one last
    // clicked in Camadas › Temas. It dresses everything sent until someone
    // changes it (Música in themeForKind); choosing a culto with a theme of
    // its own replaces it (Console.jsx, themeInUseSeed). Kept on this
    // computer: lost when KERYX reopened, the next song went out over the
    // Fundo do culto (review 2026-10-14). null = the default theme.
    const [themeId, setThemeIdState] = useState(() => { try { return localStorage.getItem(THEME_IN_USE_KEY) || null; } catch { return null; } });
    const setThemeId = useCallback((id) => {
        setThemeIdState(id || null);
        try { if (id) localStorage.setItem(THEME_IN_USE_KEY, id); else localStorage.removeItem(THEME_IN_USE_KEY); } catch { /* not remembered */ }
    }, []);
    const stamp = useCallback((op, args) => withBackgroundDefaults(op, withLookDefaults(op, withThemeDefaults(op, args, themeForKind(themes, op === "tool.show" ? "tool" : args?.kind, kindIds, themeId)), look), bgPrefs), [themes, kindIds, themeId, look, bgPrefs]);
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
    // Letra automática (owner 2026-10-15, Rodada D4): while the song on air
    // follows its video, its playback or the live clock, the console moves
    // the slide when the source passes a mark (content.goTo auto: the
    // follower's own move never re-syncs). Only this window does it; locked,
    // the screens keep their slide.
    const follow = live?.content?.follow;
    const following = Boolean(follow && !follow.paused) && !live?.locked;
    useEffect(() => {
        if (!following) return undefined;
        let asked = null;
        const tick = () => {
            const cur = liveRef.current;
            const i = followIndex(cur, keryx.live.now());
            if (i === null || i === cur?.content?.index) { asked = null; return; }
            if (i === asked) return;
            asked = i;
            keryx.live.call("content.goTo", { index: i, auto: true }).catch(() => {});
        };
        tick();
        const id = setInterval(tick, 150);
        return () => clearInterval(id);
    }, [following, follow]);
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
        // A theme's example (Camadas › Temas, nothing on air): sending it uses
        // the theme — its background on the Fundo (not past the padlock) —
        // never the example text.
        if (stage.theme) {
            const bg = themeBackgroundArgs(stage.theme);
            try { if (bg && !layerLocked(live, "background")) await callOp("background.set", bg); } catch { return false; }
            setThemeId(stage.theme.id);
            setPrevState(null);
            say(themeName(stage.theme, "") ? `Tema ${themeName(stage.theme)} em uso.` : "Tema em uso.");
            return true;
        }
        const [op, stageArgs] = stageOp(stage);
        const args = stamp(op, stageArgs);
        const ref = stage.args?.ref || {};
        try {
            if (!live?.session) await projection.startSession(ref.serviceId || null);
            if (stage.video) await callOp("video.show", { kind: "video", url: stage.video, title: stage.title });
            // A song's playback: the audio channel, with the player (Rodada D4).
            if (stage.playback) await callOp("audio.show", { kind: "audio", url: stage.playback, title: stage.title });
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
    }, [prev, locked, live, callOp, say, stamp, setThemeId]);

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

    return { live, now, cur: live, bgPrefs, themeId, setThemeId, locked, setLocked, prev, setPrev, send, moveSlide, goTo, toggleScreen, clearText, end, undoEnd, callOp, liveOp, stamp, toast: toast?.text || null, toastAction: toast?.action || null, say };
}
