import React, { useEffect, useMemo, useState } from "react";
import { Btn, Seg } from "../kx";
import { FormRow } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { TRANSITIONS, TRANSITION_MS, NATURAL_MS, lookDefaults } from "@/lib/console/look";
import WallpaperPicker from "../WallpaperPicker";
import { useLibrary } from "../useConsoleData";
import { SAMPLE_SLIDES } from "./sample";
import { useUser, updateUser } from "@/hooks/useUser";
import IdleBlock from "./IdleBlock";


// Aparência › Geral: how the screens look by default, for every service.
// The transition between slides (each item can still choose its own in
// Camadas), the idle look of the screens and the standby wallpaper they
// show when nothing is on air and the service has none of its own. On the
// local profile (User), but the idle look (the live state).
export default function AparenciaSection({ c }) {
    const { media } = useLibrary();
    const user = useUser();
    const [slide, setSlide] = useState(0);
    const [picking, setPicking] = useState(false);
    const kind = lookDefaults(user).transition || "fade";
    // The length saved, else what this transition lasts by itself; the
    // slider moves a draft, saved once when it is let go.
    const savedMs = lookDefaults(user).transition_ms;
    const [ms, setMs] = useState(savedMs || NATURAL_MS[kind] || 400);
    useEffect(() => { setMs(savedMs || NATURAL_MS[kind] || 400); }, [savedMs, kind]);
    const commitMs = () => { if (ms !== (savedMs || NATURAL_MS[kind])) save({ transition_ms: ms }); };

    const save = async (patch, message) => {
        try {
            await updateUser(patch);
            if (message) c.say(message);
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
    };
    const wall = user?.standby_background || null;

    // A sample of the screens with the chosen transition: Ver a transição
    // changes its slide.
    const doc = useMemo(() => {
        try {
            const shown = applyOp(emptyState(c.now), "content.show", { kind: "lyrics", title: "Exemplo", slides: SAMPLE_SLIDES, style: { transition: kind, transition_ms: ms } }, c.now);
            return { ...shown, content: { ...shown.content, index: slide } };
        } catch { return null; }
    }, [kind, ms, slide]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!user) return null;
    return (
        <>
            <div className="frm">
                <FormRow k="Transição entre slides">
                    <Seg small value={kind} onChange={(v) => save({ transition_type: v }, `Transição padrão: ${TRANSITIONS.find(([k]) => k === v)?.[1]}.`)} options={TRANSITIONS} />
                    <span className="kx-meta">vale para todo item que for ao ar; nas Camadas cada item pode escolher a sua</span>
                </FormRow>
                <FormRow k="Duração">
                    <input type="range" className="ap-range" min={TRANSITION_MS[0]} max={TRANSITION_MS[1]} step={20} value={ms} disabled={kind === "cut"}
                        onChange={(e) => setMs(Number(e.target.value))} onPointerUp={commitMs} onKeyUp={(e) => { if (e.key !== "Tab") commitMs(); }} onBlur={commitMs}
                        aria-label="Duração da transição" />
                    <span className="kx-content ap-ms">{kind === "cut" ? "imediato" : `${ms} ms${savedMs ? "" : " · padrão"}`}</span>
                </FormRow>
                <FormRow k="">
                    <div className="ap-sample">{doc && <ScreenRenderer state={doc} now={c.now} preview />}</div>
                    <Btn small onClick={() => setSlide((n) => (n + 1) % SAMPLE_SLIDES.length)} disabled={kind === "cut"} title="Troca o slide do exemplo com a transição escolhida">Ver a transição</Btn>
                </FormRow>
                <FormRow k="Fundo de espera padrão">
                    {wall ? <img className="cfg-wall" src={wall} alt="" /> : <span className="kx-meta">nenhum · as telas mostram o logo</span>}
                    <Btn small on={picking} onClick={() => setPicking(!picking)}>{wall ? "Trocar…" : "Escolher…"}</Btn>
                    <span className="kx-meta">as telas mostram quando nada está no ar e o culto não tem fundo próprio</span>
                </FormRow>
                {picking && (
                    <div className="pl-wallpick">
                        <WallpaperPicker value={wall} media={media} noneLabel="Sem fundo padrão (logo da igreja)"
                            onNone={() => { setPicking(false); save({ standby_background: "" }, "Sem fundo de espera padrão."); }}
                            onPick={(url) => { setPicking(false); save({ standby_background: url }, "Fundo de espera padrão salvo."); }} />
                    </div>
                )}
                <IdleBlock c={c} media={media} />
            </div>
        </>
    );
}
