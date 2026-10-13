import React, { useEffect, useMemo, useState } from "react";
import { Btn, Seg } from "../kx";
import { FormRow, Switch } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { TRANSITIONS, TRANSITION_MS, NATURAL_MS, lookDefaults } from "@/lib/console/look";
import BgChip, { BgThumb } from "../library/BgChip";
import { useLibraryPicker } from "../library/libraryContext";
import { churchFundo, dayFundo, withDay, WEEKDAYS } from "@/lib/console/defaultFundo";
import { SAMPLE_SLIDES } from "./sample";
import { useUser, usePrefs, updateUser } from "@/hooks/useUser";
import IdleBlock from "./IdleBlock";


// Aparência › Geral: how the screens look by default, for every service.
// The transition between slides (each item can still choose its own in
// Camadas), the idle look of the screens and the standby wallpaper they
// show when nothing is on air and the service has none of its own. On the
// local profile (User), but the idle look (the live state).
export default function AparenciaSection({ c }) {
    const user = useUser();
    const prefs = usePrefs();
    const [slide, setSlide] = useState(0);
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
    // Fundo padrão (src/lib/console/defaultFundo.js): the church's for every
    // day, and optionally one per day of the week; the service's wins.
    const pick = useLibraryPicker();
    const church = churchFundo(user);
    const pickDay = async (d) => {
        const cur = dayFundo(user, d);
        const r = await pick({ title: `Fundo de ${WEEKDAYS[d][2]}`, value: cur, allowNone: Boolean(cur), noneLabel: "Sem fundo neste dia (usa o padrão)" });
        if (r?.spec || r?.none) save({ weekday_backgrounds: withDay(user?.weekday_backgrounds, d, r.spec || null) }, r.spec ? `Fundo de ${WEEKDAYS[d][2]} salvo.` : `${WEEKDAYS[d][2][0].toUpperCase()}${WEEKDAYS[d][2].slice(1)} usa o fundo padrão.`);
    };

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
                <FormRow k="Fundo padrão">
                    <BgChip title="Fundo padrão" empty="nenhum · as telas mostram o logo" value={church}
                        noneLabel={church ? "Sem fundo padrão (logo da igreja)" : undefined}
                        onPick={(spec) => save({ default_background: spec || null, standby_background: spec?.kind === "image" ? spec.value : "" }, spec ? "Fundo padrão salvo." : "Sem fundo padrão.")} />
                    <span className="kx-meta">na camada Fundo quando nada está no ar (ao abrir o KERYX, ao escolher o culto e a cada Esc), se o culto não tiver o seu</span>
                </FormRow>
                <FormRow k="Fundo por dia da semana">
                    <span className="ap-days">
                        {WEEKDAYS.map(([d, short, name]) => {
                            const spec = dayFundo(user, d);
                            return <button type="button" key={d} className={`kx-t ap-day ${spec ? "is-on" : ""}`} onClick={() => pickDay(Number(d))} title={spec ? `Fundo de ${name} · trocar` : `Escolher um fundo para ${name}`} aria-label={`Fundo de ${name}`}><BgThumb spec={spec} /><span>{short}</span></button>;
                        })}
                    </span>
                    <span className="kx-meta">opcional: vale antes do fundo padrão no dia do culto (ou hoje, sem culto)</span>
                </FormRow>
                <FormRow k="Fundos">
                    <Btn small onClick={() => pick({ title: "Fundos", manage: true })}>Abrir biblioteca</Btn>
                    <span className="kx-meta">imagens, vídeos, gerados e cores: nome, categoria, escurecer, desfoque, favoritos e ocultos; e enviar do computador</span>
                </FormRow>
                <IdleBlock c={c} />
                <FormRow k="Títulos nas telas">
                    <span className="cfg-launch"><Switch on={prefs.show_item_title} onChange={(on) => save({ show_item_title: on }, on ? "O título do item aparece nas telas." : "Sem o título do item nas telas.")} label="Mostrar o título do item nas telas" /><span className="kx-meta">Título do item nas telas</span></span>
                    <span className="cfg-launch"><Switch on={prefs.youtube_hide_title} onChange={(on) => save({ youtube_hide_title: on }, on ? "A faixa de título do YouTube fica escondida." : "O YouTube volta a mostrar o título sobre o vídeo.")} label="Esconder o título e o canal que o YouTube põe sobre o vídeo" /><span className="kx-meta">Esconder o título do YouTube</span></span>
                    <span className="kx-meta">o nome da música, do texto ou da imagem por cima do que vai ao ar (a referência da Bíblia continua); e o nome do vídeo e do canal que o YouTube mostra no começo e na pausa (o vídeo não é cortado)</span>
                </FormRow>
            </div>
        </>
    );
}
