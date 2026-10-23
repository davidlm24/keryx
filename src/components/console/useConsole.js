import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState } from "@/hooks/useLiveState";
import { stageOp } from "@/lib/console/stage";
import { undoEndOps } from "@/lib/console/restore";
import { lastFromEnd, lastStays, airKey } from "@/lib/console/lastOnAir";
import { emptyToasts, pushToast, nextToast, dropToast } from "@/lib/console/toastQueue";
import { lookDefaults, withLookDefaults } from "@/lib/console/lookDefaults";
import { withBackgroundDefaults, backgroundDefaults, backgroundLook } from "@/lib/console/backgroundPrefs";
import { useBackgroundPrefs, useThemes } from "./useConsoleData";
import { themeForKind, withThemeDefaults, themeBackgroundArgs, themeName } from "@/lib/console/themes";
import { layerLocked, followIndex } from "@shared/live-state.mjs";
import { fundoOps } from "@/lib/console/backgroundSpec";
import { withTransitions } from "@/lib/console/transitions";
import { pagesProgressOf } from "@/hooks/usePagesBackfill";
import { useUser, usePrefs } from "@/hooks/useUser";
import { liveIdleLook } from "@shared/idleLook.mjs";
import { usePendingMedia } from "@/hooks/usePendingMedia";
import { pendingUrls, PENDING_SAY } from "@/lib/pendingMedia";
import { LOCKED_SAY, PENDING_SKIP, sendBlock } from "@/lib/console/sendBlock";

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
export const THEME_IN_USE_KEY = "keryx.themeInUse";
// The Prévia's stage, for a reload of this window (useConsole).
const PREV_KEY = "keryx.console.prev";
const readPrev = () => { try { const s = JSON.parse(sessionStorage.getItem(PREV_KEY) || "null"); return s && typeof s === "object" ? s : null; } catch { return null; } };
const writePrev = (stage, key = PREV_KEY) => { try { if (stage) sessionStorage.setItem(key, JSON.stringify(stage)); else sessionStorage.removeItem(key); } catch { /* not remembered */ } };
// The item the Slides column keeps after Esc (src/lib/console/lastOnAir.js),
// kept for a reload like the Prévia.
const LAST_KEY = "keryx.console.last";
const readLast = () => { try { const s = JSON.parse(sessionStorage.getItem(LAST_KEY) || "null"); return s && typeof s === "object" && Array.isArray(s.slides) ? s : null; } catch { return null; } };
// The checks before a send (src/lib/console/sendBlock.js, pure).
export { LOCKED_SAY };

// The look every op is stamped with (withThemeDefaults, the Bíblia's
// display preferences, each background's own settings): the console and a
// detached page (src/pages/Janela.jsx) dress what they prepare the same way.
export function useStamp(themeId) {
    // The Bíblia's display preferences (Configurações › Bíblia e músicas,
    // on User), stamped into each passage that goes on air
    // (src/lib/console/lookDefaults.js). The transition is the theme's alone.
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
    const stamp = useCallback((op, args) => withBackgroundDefaults(op, withLookDefaults(op, withThemeDefaults(op, args, themeForKind(themes, op === "tool.show" ? "tool" : args?.kind, kindIds, themeId)), look), bgPrefs), [themes, kindIds, themeId, look, bgPrefs]);
    return { stamp, bgPrefs };
}

// A toast: one line, 3 s (6 s for a long one, such as how to send a
// PowerPoint as PDF); with an action ({ label, run, undo? }) a button and
// 8 s, so there is time to reach it. A plain toast said meanwhile waits
// behind an action toast instead of replacing it, and the time stands still
// while the pointer or the focus is on it (holdToast; design audit C-13,
// src/lib/console/toastQueue.js). Running the action closes its toast first.
// undo: Ctrl+Z runs it too (keys.js "undo").
export function useToast() {
    const [toasts, setToasts] = useState(emptyToasts);
    const ids = useRef(0);
    const timer = useRef(null);
    const held = useRef(false);
    const left = useRef(0);
    const since = useRef(0);
    // opts: { ms } how long it shows, when not toastMs's (the Setlist
    // automática's countdown lasts its pause); { replace } a plain toast that
    // takes an action toast's place (its Cancelar answered another way);
    // { important } a new pedido or chat message: 6 s at least, a gold wave
    // round it, and a plain toast never takes its place.
    const say = useCallback((text, action = null, opts = null) => setToasts((s) => pushToast(s, { id: ++ids.current, text, action, ...(opts?.ms ? { ms: opts.ms } : {}), ...(opts?.replace ? { replace: true } : {}), ...(opts?.important ? { important: true } : {}) })), []);
    const done = useCallback(() => setToasts(nextToast), []);
    // The toast showing goes now, if it is this one (a countdown overtaken).
    const unsay = useCallback((text) => setToasts((s) => dropToast(s, text)), []);
    const cur = toasts.cur;
    useEffect(() => {
        clearTimeout(timer.current);
        if (!cur) { held.current = false; return; }
        left.current = cur.ms;
        if (!held.current) { since.current = Date.now(); timer.current = setTimeout(done, cur.ms); }
    }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const holdToast = useCallback((on) => {
        if (Boolean(on) === held.current) return;
        held.current = Boolean(on);
        clearTimeout(timer.current);
        if (on) left.current = Math.max(0, left.current - (Date.now() - since.current));
        // Let go: what was left, never less than a moment to read it again.
        else { since.current = Date.now(); left.current = Math.max(left.current, 1500); timer.current = setTimeout(done, left.current); }
    }, [done]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const toastAction = useMemo(() => (cur?.action ? { ...cur.action, run: () => { done(); cur.action.run(); } } : null), [cur, done]);
    return { toast: cur?.text || null, toastId: cur?.id ?? 0, toastImportant: Boolean(cur?.important), toastAction, say, unsay, holdToast };
}

// The operations on what is on air that need nothing of the console's own
// state (no Prévia, no history): any window may run them — the console, and
// a detached page (the Escola bíblica walks its slides, Configurações
// changes the idle screen). Travar telas holds in applyOp, whoever sends.
export function useLiveOps(live, say, bgPrefs) {
    const locked = Boolean(live?.locked);
    // The church's Transições (Rodada F2), for every window that sends.
    const prefs = usePrefs();

    // One operation on the live state. Resolves with the new document; errors
    // (a refused op while locked, a bad argument) become a toast.
    const liveOp = useCallback(async (op, args = {}) => {
        try {
            // A background (an item's, an aviso's, the idle wallpaper) brings
            // the dim and blur Aparência › Fundos gave it; already there: kept.
            // A sound that starts, Esc, Limpar, Tela preta and Logo bring the
            // church's Transições (transitions.js): every sender through here
            // (keys, the controle remoto, Tocar todos, a song's playback).
            return await keryx.live.call(op, withTransitions(op, withBackgroundDefaults(op, args, bgPrefs), prefs));
        } catch (err) {
            say(err?.message || "Não foi possível projetar.");
            throw err;
        }
    }, [say, bgPrefs, prefs]);
    const callOp = liveOp;

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

    // Limpar texto: the text layers go (one change, one fade: text.clear);
    // background, logo and media stay.
    const clearText = useCallback(() => callOp("text.clear").catch(() => {}), [callOp]);

    return { locked, liveOp, callOp, moveSlide, goTo, toggleScreen, clearText };
}

export function useConsole() {
    // No ticking clock here: a `now` in `c` re-rendered the whole console
    // every second of the service. What shows the time keeps its own
    // (useLiveNow: the top bar's clocks, the timers, the player, the
    // monitors' ScreenRenderer); a one-off read is keryx.live.now().
    const live = useLiveState();
    // The Prévia survives the console's reload after a crash (sessionStorage
    // lives as long as this window: a reopened KERYX starts empty).
    const [prev, setPrevState] = useState(readPrev);
    useEffect(() => { writePrev(prev); }, [prev]);
    // Media files the sync between the church's computers has not brought
    // yet: an item that needs one is not sent (src/lib/pendingMedia.js).
    const pending = usePendingMedia();
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
    const { stamp, bgPrefs } = useStamp(themeId);
    const { toast, toastId, toastImportant, toastAction, say, unsay, holdToast } = useToast();
    const { locked, liveOp, callOp, moveSlide, goTo, toggleScreen } = useLiveOps(live, say, bgPrefs);

    // Esc takes the song off the screens, not out of the Slides column
    // (owner 2026-10-23, Rodada Q7): the item whose slides were on air is
    // kept as `last` until something new goes on air or the Prévia holds an
    // item (lastStays). Only the key of what is on air is watched: reading
    // `last` there would drop it in the moment before the live state shows
    // the change that made it.
    const [last, setLastState] = useState(readLast);
    useEffect(() => { writePrev(last, LAST_KEY); }, [last]);
    const key = airKey(live);
    useEffect(() => { if (live) setLastState((l) => (l && l.key !== key ? null : l)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    const handHeld = Boolean(prev && !prev.theme && prev.slides?.length);
    useEffect(() => { if (handHeld) setLastState(null); }, [handHeld]);
    const keepLast = useCallback((before, after) => { const l = lastFromEnd(before, after); if (l) setLastState(l); }, []);
    // Anterior / Próximo under the kept item move the slide marked "parou aqui".
    const moveLast = useCallback((d) => setLastState((l) => {
        if (!l) return l;
        const i = Math.max(0, Math.min(l.slides.length - 1, l.stopped + d));
        return { ...l, stopped: i, index: i };
    }), []);
    // Limpar texto (C) keeps the item the same way when it took text slides
    // off (the same rule: slides were on air).
    const clearText = useCallback(() => {
        const before = live;
        return callOp("text.clear").then((after) => keepLast(before, after)).catch(() => {});
    }, [live, callOp, keepLast]);

    // The idle wallpaper follows its settings: editing its dim or blur in
    // Fundos (or the settings loading after it was applied) updates the
    // screens that show it.
    useEffect(() => {
        if (live?.idle !== "background" || !live.idleUrl) return;
        const { dim, blur } = backgroundDefaults(bgPrefs, live.idleUrl);
        if (dim === (live.idleDim ?? null) && blur === (live.idleBlur ?? null)) return;
        keryx.live.call("idle.set", { mode: "background", url: live.idleUrl, dim, blur }).catch(() => {});
    }, [live?.idle, live?.idleUrl, live?.idleDim, live?.idleBlur, bgPrefs]);

    // The Tela ociosa's look follows the church's (Editor de telas › Tela
    // ociosa saves User.idle_look, which also syncs between computers): this
    // console puts it on the screens, with the church's name written in for
    // "Nome da igreja", so a rename, an edit from a detached window or from
    // another computer reaches the screens. Not before the profile is read.
    const idleUser = useUser();
    const idleWanted = idleUser ? JSON.stringify(liveIdleLook(idleUser.idle_look, idleUser.church_name || "")) : null;
    const idleOnAir = JSON.stringify(live?.idleLook ?? null);
    useEffect(() => {
        if (idleWanted === null || !live || idleWanted === idleOnAir) return;
        keryx.live.call("idle.look", { look: JSON.parse(idleWanted) }).catch(() => {});
    }, [idleWanted, idleOnAir, Boolean(live)]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // A setting back to "padrão" (null) leaves the picture without it, so
        // the screens use their own default again.
        const next = { ...bg };
        let changed = false;
        for (const [k, v] of Object.entries(look)) {
            if (v === (bg[k] ?? null)) continue;
            changed = true;
            if (v === null) delete next[k]; else next[k] = v;
        }
        if (changed) keryx.live.call("background.set", next).catch(() => {});
    }, [bgPrefs]);

    const setPrev = useCallback((stage) => {
        if (stage && pendingUrls(stage, pending, PENDING_SKIP).length) say(`${stage.title || "O arquivo"} ainda está baixando da sincronização · vai ao ar quando terminar.`);
        else if (stage?.missing) say(`Arquivo não encontrado: ${stage.title}. Localize o arquivo antes de projetar.`);
        // A PowerPoint, or a PDF whose pages are being made (or could not
        // be): no toast, the Prévia says it over its screen and keeps saying
        // it until the pages are ready (presentationPreviewStatus; Rodada H).
        setPrevState(stage);
    }, [say, pending]);

    // Send: the Prévia (or the stage given) goes to the screens. Resolves
    // true when it went. keepPrev: a stage sent from elsewhere (the controle
    // remoto) leaves the operator's Prévia alone, unless it is that very
    // item. why: told why it did not go ({ status, code, message }) instead
    // of the toast.
    const send = useCallback(async (stage = prev, { keepPrev = false, why = null } = {}) => {
        const refused = (b) => { if (why) why(b); else say(b.message); return false; };
        const block = sendBlock(stage, { locked, pending, progress: pagesProgressOf(stage?.args?.id) });
        if (block) return refused(block);
        const clearsPrev = !keepPrev || prev?.id === stage.id;
        // A theme's example (Camadas › Temas, nothing on air): sending it uses
        // the theme — its background on the Fundo (not past the padlock) —
        // never the example text.
        if (stage.theme) {
            const bg = themeBackgroundArgs(stage.theme);
            try { if (bg && !layerLocked(live, "background")) await callOp("background.set", bg); } catch { return false; }
            setThemeId(stage.theme.id);
            if (clearsPrev) setPrevState(null);
            say(themeName(stage.theme, "") ? `Tema ${themeName(stage.theme)} em uso.` : "Tema em uso.");
            return true;
        }
        const [op, stageArgs] = stageOp(stage);
        const args = stamp(op, stageArgs);
        // The theme that dresses it may bring a background still coming.
        if (pendingUrls(args, pending, PENDING_SKIP).length) return refused({ status: 409, code: "syncing", message: PENDING_SAY });
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
        } catch (err) {
            // callOp said why on the console; the sender hears it too.
            why?.({ status: err?.status || 409, code: err?.status === 423 ? "locked" : undefined, message: err?.message || "Não foi para o ar." });
            return false;
        }
        if (clearsPrev) setPrevState(null);
        return true;
    }, [prev, locked, live, callOp, say, stamp, setThemeId, pending]);

    // Desfazer (the toast after Esc / Encerrar): what the screens showed goes
    // straight back, and the player's music at the second Esc stopped it
    // (`endedAt`, src/lib/console/restore.js). Not while locked: putting
    // something on air is what the lock refuses.
    const undoEnd = useCallback(async (before, endedAt) => {
        if (locked) { say(LOCKED_SAY); return; }
        try {
            for (const [op, args] of undoEndOps(before, endedAt)) await liveOp(op, args);
            say(before?.audio ? "Projeção e música de volta." : "Projeção de volta.");
        } catch { /* liveOp said why */ }
    }, [locked, liveOp, say]);

    // Encerrar (Esc, at once; the button, after asking): everything on the
    // main projector and the video screens goes, and the player's music
    // (owner 2026-10-17, Rodada G3); background, logo, overlays and the alert
    // have their own controls. The toast offers Desfazer (owner's decision
    // 2026-10-10). `by`: who asked, when not this console ("Celular"); then a
    // refusal is thrown back to it. Resolves whether Desfazer is offered.
    const end = useCallback(async ({ by } = {}) => {
        const before = live;
        let after;
        try { after = await callOp("clear"); } catch (err) { if (by) throw err; return; }
        keepLast(before, after);
        const what = before?.audio ? "projeção encerrada e música parada." : "projeção encerrada.";
        const message = by ? `${by}: ${what}` : what[0].toUpperCase() + what.slice(1);
        const endedAt = after?.updatedAt;
        const undo = undoEndOps(before, endedAt).length > 0;
        if (undo) say(message, { label: "Desfazer", undo: true, run: () => undoEnd(before, endedAt) });
        else say(message);
        // Whether Desfazer can put it back (the controle remoto says so).
        return undo;
    }, [live, callOp, say, undoEnd, keepLast]);

    // Travar telas / Destravar (Saídas, the banner).
    const setLocked = useCallback((on) => {
        liveOp("screens.lock", { locked: Boolean(on) })
            .then(() => say(on ? "Telas travadas: prepare à vontade, nada novo vai às telas." : "Telas destravadas: enviar volta a mudar as telas."))
            .catch(() => {});
    }, [liveOp, say]);

    return { live, cur: live, bgPrefs, themeId, setThemeId, locked, setLocked, prev, setPrev, last: lastStays(last, live, handHeld) ? last : null, moveLast, send, moveSlide, goTo, toggleScreen, clearText, end, undoEnd, callOp, liveOp, stamp, toast, toastId, toastImportant, toastAction, say, unsay, holdToast };
}
