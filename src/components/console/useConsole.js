import { useCallback, useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { applyOp } from "@shared/live-state.mjs";
import { stageOp } from "@/lib/console/stage";

// The console's own state around the live state.
//
// mode:
//   "live"   Apresentar, outputs armed: operations go to the live state.
//   "ensaio" rehearsal: operations go to a local copy of the document, with
//            the same rules (applyOp); the screens keep showing what was on
//            air. The one sandbox: preparing in live mode is already safe,
//            because nothing reaches the screens without "Enviar ao ar".
// Tela preta and Mostrar logo are emergency actions: they always act on the
// real screens, whatever the mode.
//
// The Prévia is a stage, never sent until "Enviar ao ar". Every other change
// of what is on screen goes through callOp.
export function useConsole() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const [mode, setMode] = useState("live");
    const [rh, setRh] = useState(null);
    const [prev, setPrevState] = useState(null);
    const [toast, setToastState] = useState(null);
    const toastTimer = useRef(null);

    const say = useCallback((text) => {
        setToastState(text);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastState(null), 3000);
    }, []);
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const isLive = mode === "live";
    const cur = isLive ? live : rh;
    const copyOf = (doc) => JSON.parse(JSON.stringify(doc));

    const liveOp = useCallback(async (op, args = {}) => {
        try {
            return await keryx.live.call(op, args);
        } catch (err) {
            say(err?.message || "Não foi possível projetar.");
            throw err;
        }
    }, [say]);

    // One operation on what the console is driving: the live state, or the
    // local copy. Resolves with the new document; errors become a toast.
    const callOp = useCallback(async (op, args = {}) => {
        if (isLive) return liveOp(op, args);
        let next = null;
        setRh((doc) => {
            try {
                next = applyOp(doc, op, args, keryx.live.now());
                return next;
            } catch (err) {
                say(err?.message || "Operação inválida.");
                return doc;
            }
        });
        return next;
    }, [isLive, liveOp, say]);

    const setPrev = useCallback((stage) => {
        if (stage?.missing) say(`Arquivo não encontrado: ${stage.title}. Localize o arquivo antes de projetar.`);
        setPrevState(stage);
    }, [say]);

    // "Enviar ao ar": the Prévia (or the stage given) goes to the screens, or
    // to the local copy. Resolves true when it went.
    const send = useCallback(async (stage = prev) => {
        if (!stage) { say("Nada na prévia. Escolha um item do Roteiro, uma música ou um versículo."); return false; }
        if (stage.missing) { say("Arquivo não encontrado · Localizar… antes de enviar."); return false; }
        const [op, args] = stageOp(stage);
        const ref = stage.args?.ref || {};
        try {
            if (isLive && !live?.session) await projection.startSession(ref.serviceId || null);
            if (stage.video) await callOp("video.show", { kind: "video", url: stage.video, title: stage.title });
            await callOp(op, args);
            if (ref.serviceItemId) await callOp("session.item", { itemId: ref.serviceItemId, index: ref.serviceItemIndex ?? null }).catch(() => {});
        } catch {
            return false;
        }
        setPrevState(null);
        return true;
    }, [prev, isLive, live, callOp, say]);

    const moveSlide = useCallback((d) => {
        if (!cur?.content) { say("Nada com slides no ar."); return; }
        callOp(d > 0 ? "content.next" : "content.prev").catch(() => {});
    }, [cur, callOp, say]);

    const goTo = useCallback((index) => callOp("content.goTo", { index }).catch(() => {}), [callOp]);

    // Tela preta / Mostrar logo: always the real screens (emergency). The
    // local copy follows, so the Programa monitor shows it too.
    const toggleScreen = useCallback((which) => {
        const next = live?.screen === which ? "show" : which;
        liveOp("screen.set", { mode: next }).catch(() => {});
        if (!isLive) setRh((doc) => (doc ? applyOp(doc, "screen.set", { mode: next }, keryx.live.now()) : doc));
        if (!isLive) say(next === "show" ? "Telas liberadas." : `${which === "black" ? "Tela preta" : "Logo"} nas telas — vale mesmo fora do ao vivo.`);
    }, [live, isLive, liveOp, say]);

    // Limpar texto: the text layers go; background, logo and media stay.
    const clearText = useCallback(async () => {
        for (const op of ["tool.clear", "communication.clear", "content.clear"]) await callOp(op).catch(() => {});
    }, [callOp]);

    // Encerrar: everything on the main projector and the video screens goes;
    // background, logo, overlays and the alert have their own controls.
    const end = useCallback(() => callOp("clear").catch(() => {}), [callOp]);

    const goEnsaio = useCallback(() => {
        if (!isLive || !live) return;
        setRh(copyOf(live));
        setMode("ensaio");
        say("Modo ensaio: as telas continuam com o que estava no ar.");
    }, [isLive, live, say]);

    const arm = useCallback(() => {
        setRh(null);
        setMode("live");
        say("Saídas armadas. Enviar ao ar volta a mudar as telas.");
    }, [say]);

    // The local copy starts as soon as the live state arrives.
    useEffect(() => { if (mode !== "live" && !rh && live) setRh(copyOf(live)); }, [mode, rh, live]);

    return { live, now, mode, isLive, cur, prev, setPrev, send, moveSlide, goTo, toggleScreen, clearText, end, goEnsaio, arm, callOp, liveOp, toast, say };
}
