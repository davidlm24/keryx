import React, { useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Panel, Btn, Seg, WinBar } from "../console/kx";
import { FormRow } from "../console/settings/parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import ScreensMenu, { IDLE_SCREEN } from "./ScreensMenu";
import { emptyState, mainLayer } from "@shared/live-state.mjs";
import { IDLE_LOOK_DEFAULT, IDLE_TEXT_MAX, idleLookOf, isDefaultIdleLook, liveIdleLook } from "@shared/idleLook.mjs";
import { usePrefs } from "@/hooks/useUser";
import { useChurch } from "@/hooks/useChurch";
import { useWinCol } from "@/components/console/winLayout";
import { setIdleLook, setIdleMode } from "@/lib/console/idle";

const BGS = [["color", "Cor"], ["gradient", "Degradê"]];
const DIRS = [["radial", "Do centro"], ["down", "De cima para baixo"], ["diag", "Diagonal"]];
const LOGOS = [["none", "Sem logo"], ["s", "P"], ["m", "M"], ["l", "G"]];
const PHRASES = [["none", "Nenhuma"], ["church", "Nome da igreja"], ["own", "Outra"]];

// Editor de telas › Tela ociosa (owner 2026-10-19): what every screen shows
// with nothing on air and no papel de parede, for the whole app (not a
// culto's). Logo or Preto, and with the logo its fundo (a colour or a
// gradient of two colours), the logo's size and a phrase under it. Saves at
// once on the church's profile (User.idle_look, User.idle_mode); the console
// puts it on the screens (useConsole). A page of THE window, hosted like the
// screen editor, with the same screens menu.
export default function IdleEditor({ say, live: liveState, screens, onClose, onSwitch, escRef = null, hosted = false, onDetach = null }) {
    const colTelas = useWinCol("screen.telas", { name: "Telas", def: 190, min: 160, max: 360 });
    const colAjustes = useWinCol("screen.ajustes", { name: "Ajustes", def: 400, min: 340, max: 720 });
    const prefs = usePrefs();
    const church = useChurch();
    const saved = useMemo(() => idleLookOf(prefs.idle_look) || { ...IDLE_LOOK_DEFAULT }, [prefs.idle_look]);
    // What the controls show: a change at once, saved a moment later (a colour
    // being dragged would otherwise write the profile at every step).
    const [draft, setDraft] = useState(null);
    const look = draft || saved;
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    const commit = (next) => setIdleLook(next).catch(() => say("Não foi possível salvar a tela ociosa.")).finally(() => setDraft((d) => (d === next ? null : d)));
    // The idle mode is the live state's (Logo or Preto, also in Saídas).
    const black = liveState?.idle === "black";
    const c = useMemo(() => ({ say, liveOp: (op, args) => keryx.live.call(op, args) }), [say]);
    const save = (patch) => {
        const next = { ...look, ...patch };
        setDraft(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(next), 250);
    };
    // "Outra": its words save when the field is left (or Enter).
    const [own, setOwn] = useState(look.text);
    useEffect(() => { setOwn(look.text); }, [look.text]);
    const saveOwn = () => { const t = own.trim(); if (t !== look.text) save({ text: t }); };

    if (escRef) escRef.current = (mode) => onClose(mode === "all");

    // The canvas: an empty screen in this look (the church's name written in).
    const doc = useMemo(() => ({ ...emptyState(0), idle: black ? "black" : "logo", idleLook: liveIdleLook(look, church.name) }), [black, look, church.name]);
    // Something on air, or a papel de parede on the Fundo, covers the Tela ociosa now.
    const covered = liveState && mainLayer(liveState) !== "none" ? "Agora há algo no ar; as telas voltam à tela ociosa quando nada estiver." : liveState?.background ? "Agora as telas mostram o papel de parede; a tela ociosa aparece quando não houver um." : "";

    const body = (
        <>
            <ScreensMenu path={IDLE_SCREEN} screens={screens} onPick={(p) => { if (p !== IDLE_SCREEN) onSwitch?.(p); }} style={colTelas.style} />
            {colTelas.split}
            <div className="col nv-l" style={colAjustes.style}>
                <Panel title="Tela ociosa" bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="nv-scroll cfg">
                        <div className="listhead"><span className="kx-meta">Todas as telas mostram isto quando nada está no ar e não há papel de parede.</span></div>
                        <div className="frm">
                            <FormRow k="Mostrar">
                                <Seg small label="Tela ociosa" value={black ? "black" : "logo"} options={[["logo", "Logo da igreja"], ["black", "Preto"]]} onChange={(m) => setIdleMode(c, m)} />
                            </FormRow>
                            {black ? (
                                <FormRow k="">
                                    <span className="kx-meta">Com Preto, os ajustes abaixo ficam guardados e voltam com Logo da igreja.</span>
                                </FormRow>
                            ) : <>
                                <FormRow k="Fundo">
                                    <Seg small label="Fundo da tela ociosa" value={look.bg} options={BGS} onChange={(v) => save({ bg: v })} />
                                </FormRow>
                                {look.bg === "color" ? (
                                    <FormRow k="Cor">
                                        <input type="color" className="ed-color" value={look.color} onChange={(e) => save({ color: e.target.value })} aria-label="Cor do fundo da tela ociosa" />
                                    </FormRow>
                                ) : <>
                                    <FormRow k="Cores">
                                        <input type="color" className="ed-color" value={look.c1} onChange={(e) => save({ c1: e.target.value })} aria-label="Primeira cor do degradê" />
                                        <span className="kx-meta">→</span>
                                        <input type="color" className="ed-color" value={look.c2} onChange={(e) => save({ c2: e.target.value })} aria-label="Segunda cor do degradê" />
                                    </FormRow>
                                    <FormRow k="Direção">
                                        <Seg small label="Direção do degradê" value={look.dir} options={DIRS} onChange={(v) => save({ dir: v })} />
                                    </FormRow>
                                </>}
                                <FormRow k="Logo">
                                    <Seg small label="Tamanho do logo" value={look.logo} options={LOGOS} onChange={(v) => save({ logo: v })} />
                                    <span className="kx-meta">{church.logo ? "o de Configurações › Igreja" : "a igreja ainda não tem logo (Configurações › Igreja)"}</span>
                                </FormRow>
                                <FormRow k="Frase">
                                    <Seg small label="Frase embaixo do logo" value={look.phrase} options={PHRASES} onChange={(v) => save({ phrase: v })} />
                                    {look.phrase === "church" && !church.name && <span className="kx-meta">a igreja ainda não tem nome (Configurações › Igreja)</span>}
                                </FormRow>
                                {look.phrase === "own" && (
                                    <FormRow k="">
                                        <input className="fg-input" value={own} maxLength={IDLE_TEXT_MAX} placeholder="Ex.: Seja bem-vindo" aria-label="Frase da tela ociosa"
                                            onChange={(e) => setOwn(e.target.value)} onBlur={saveOwn} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                                    </FormRow>
                                )}
                                <FormRow k="">
                                    <Btn small disabled={isDefaultIdleLook(look)} onClick={() => { clearTimeout(timer.current); setDraft(null); setIdleLook(null).catch(() => say("Não foi possível salvar a tela ociosa.")); }} title="O degradê azul, o logo M e nenhuma frase">Voltar ao padrão</Btn>
                                </FormRow>
                            </>}
                        </div>
                    </div>
                </Panel>
            </div>
            {colAjustes.split}
            <div className="col center">
                <Panel title={<>Tela <span className="kx-count">· 16:9</span></>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="le-stage">
                        <div className="le-screen"><ScreenRenderer fill state={doc} logoUrl={church.logo} preview audio={false} /></div>
                    </div>
                    <div className="listhead nv-note">
                        <span className="kx-meta">Vale para todas as saídas e para as telas na rede. Muda na hora, sem salvar.{covered ? ` ${covered}` : ""}</span>
                    </div>
                </Panel>
            </div>
        </>
    );

    if (!hosted) return body;
    return (
        <>
            <WinBar title="Editor da tela" sub="Tela ociosa" detach={onDetach} />
            <div className="win-body is-ed">{body}</div>
        </>
    );
}
