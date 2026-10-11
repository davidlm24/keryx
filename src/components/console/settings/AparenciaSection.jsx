import React, { useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn, Seg } from "../kx";
import { FormRow } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { TRANSITIONS, TRANSITION_MS, lookDefaults } from "@/lib/console/look";
import WallpaperPicker from "../WallpaperPicker";
import { useLibrary } from "../useConsoleData";
import { SAMPLE_SLIDES } from "./sample";


// Aparência: how the screens look by default, for every service. The
// transition between slides (each item can still choose its own in
// Camadas) and the standby wallpaper the screens show when nothing is on
// air and the service has none of its own. On the local profile (User).
// The Fundos library lives in Temas (FundosGallery), beside the presets.
export default function AparenciaSection({ c }) {
    const { media } = useLibrary();
    const [user, setUser] = useState(null);
    const [ms, setMs] = useState(400);
    const [slide, setSlide] = useState(0);
    const [picking, setPicking] = useState(false);

    useEffect(() => {
        const take = (u) => { setUser(u || {}); setMs(lookDefaults(u).transition_ms || 400); };
        keryx.auth.me().then(take).catch(() => setUser({}));
        return keryx.entities.User.subscribe?.((change) => { if (change?.data && change.type !== "delete") take(change.data); });
    }, []);

    const save = async (patch, message) => {
        try {
            await keryx.entities.User.update("me", patch);
            if (message) c.say(message);
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
    };
    const kind = lookDefaults(user).transition || "fade";
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
                        onChange={(e) => setMs(Number(e.target.value))} onPointerUp={() => save({ transition_ms: ms })} onKeyUp={() => save({ transition_ms: ms })} onBlur={() => save({ transition_ms: ms })}
                        aria-label="Duração da transição" />
                    <span className="kx-content ap-ms">{kind === "cut" ? "imediato" : `${ms} ms`}</span>
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
                <div className="listhead"><span className="kx-meta">Nomes, categorias e os ajustes de cada fundo moram em Temas, junto com os presets.</span></div>
            </div>
        </>
    );
}
