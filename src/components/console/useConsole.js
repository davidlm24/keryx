import { useCallback, useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { stageOp } from "@/lib/console/stage";

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
    const [toast, setToastState] = useState(null);
    const toastTimer = useRef(null);

    const say = useCallback((text) => {
        setToastState(text);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastState(null), 3000);
    }, []);
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const locked = Boolean(live?.locked);

    // One operation on the live state. Resolves with the new document; errors
    // (a refused op while locked, a bad argument) become a toast.
    const liveOp = useCallback(async (op, args = {}) => {
        try {
            return await keryx.live.call(op, args);
        } catch (err) {
            say(err?.message || "Não foi possível projetar.");
            throw err;
        }
    }, [say]);
    const callOp = liveOp;

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
        const [op, args] = stageOp(stage);
        const ref = stage.args?.ref || {};
        try {
            if (!live?.session) await projection.startSession(ref.serviceId || null);
            if (stage.video) await callOp("video.show", { kind: "video", url: stage.video, title: stage.title });
            await callOp(op, args);
            if (ref.serviceItemId) await callOp("session.item", { itemId: ref.serviceItemId, index: ref.serviceItemIndex ?? null }).catch(() => {});
        } catch {
            return false;
        }
        setPrevState(null);
        return true;
    }, [prev, locked, live, callOp, say]);

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

    // Encerrar: everything on the main projector and the video screens goes;
    // background, logo, overlays and the alert have their own controls.
    const end = useCallback(() => callOp("clear").catch(() => {}), [callOp]);

    // Travar telas / Destravar (Saídas, the banner).
    const setLocked = useCallback((on) => {
        liveOp("screens.lock", { locked: Boolean(on) })
            .then(() => say(on ? "Telas travadas: prepare à vontade, nada novo vai às telas." : "Telas destravadas: enviar volta a mudar as telas."))
            .catch(() => {});
    }, [liveOp, say]);

    return { live, now, cur: live, locked, setLocked, prev, setPrev, send, moveSlide, goTo, toggleScreen, clearText, end, callOp, liveOp, toast, say };
}
