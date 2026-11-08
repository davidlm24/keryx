import React, { useContext, useEffect, useState } from "react";
import { Seg } from "../kx";
import Icon from "../Icon";
import { Switch, CfgKey, CfgFlash, FormRow, CfgGroup } from "./parts";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { MEDIA_MODES, MEDIA_MS, CLEAR_MODES, CLEAR_MS, PAUSE_MS, ENTER_MODES, ENTER_MS, KIND_MODES, transitionsSummary } from "@/lib/console/transitions";
import { TRANSITION_TYPES } from "@/lib/contentKinds";

// Transições (owner 2026-10-16, Rodada F2): how one sound gives way to the
// next and how what leaves the air goes, for every output and network screen
// (User prefs; the console adds them to the ops, transitions.js). Rodada G3
// (owner 2026-10-17): Ao pausar o som, and Ao tirar da tela renamed Ao tirar
// do ar (the player's music leaves with the picture). Rodada G5 (owner
// 2026-10-17): Ao entrar ou trocar, with its exceptions per kind of content
// folded under it (src/lib/contentKinds.js). The slide-to-slide transition
// of the text stays the theme's. Rodada H0 (owner 2026-10-19): the whole
// block is a group that starts closed, its summary saying what is chosen
// (the pilot of CfgGroup, parts.jsx).
const msOptions = (list) => list.map(([v, label]) => [String(v), label]);
const KINDS_KEY = "Por tipo de conteúdo";
export default function TransicoesBlock({ c }) {
    const prefs = usePrefs();
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    const mediaFade = prefs.media_transition === "fade";
    const clearFades = prefs.clear_transition === "fade";
    const kinds = prefs.enter_transition_kinds;
    const enterFades = prefs.enter_transition === "fade" || Object.values(kinds).includes("fade");
    const setKind = (id, v) => {
        const next = { ...kinds };
        if (v) next[id] = v; else delete next[id];
        save({ enter_transition_kinds: next });
    };
    // Folded until the operator opens it, or the search lands on it (the
    // jump's `pending` arrives first, while the group above may still be
    // closed; `flash` once the row is found).
    const { flash, pending } = useContext(CfgFlash) || {};
    const [open, setOpen] = useState(false);
    useEffect(() => { if (flash === KINDS_KEY || pending === KINDS_KEY) setOpen(true); }, [flash, pending]);
    return (
        <CfgGroup id="telas.transicoes" k="Transições" defaultOpen={false} summary={transitionsSummary(prefs)}>
            <div className="frm">
                <FormRow k="Ao pausar o som">
                    <Seg small label="Ao pausar o som" value={String(prefs.pause_fade_ms)} options={msOptions(PAUSE_MS)}
                        onChange={(v) => save({ pause_fade_ms: Number(v) }, Number(v) ? "Pausar e Tocar passam a ser suaves." : "Pausar e Tocar cortam o som na hora.")} />
                    <span className="kx-meta">Pausar e Tocar no player</span>
                </FormRow>
                <FormRow k="Ao tirar do ar">
                    <Seg small label="Ao tirar do ar" value={prefs.clear_transition} options={CLEAR_MODES}
                        onChange={(v) => save({ clear_transition: v }, v === "fade" ? "Esc, Limpar e Parar tiram do ar aos poucos." : "Esc, Limpar e Parar tiram do ar na hora.")} />
                    {clearFades && <Seg small label="Duração ao tirar do ar" value={String(prefs.clear_transition_ms)} options={msOptions(CLEAR_MS)} onChange={(v) => save({ clear_transition_ms: Number(v) })} />}
                    <span className="kx-meta">Esc, Limpar e Parar: a imagem e o som saem juntos</span>
                </FormRow>
                <FormRow k="Ao entrar ou trocar">
                    <Seg small label="Ao entrar ou trocar" value={prefs.enter_transition} options={ENTER_MODES}
                        onChange={(v) => save({ enter_transition: v }, v === "fade" ? "Conteúdo novo entra e troca aos poucos." : "Conteúdo novo entra e troca na hora.")} />
                    {enterFades && <Seg small label="Duração ao entrar ou trocar" value={String(prefs.enter_transition_ms)} options={msOptions(ENTER_MS)} onChange={(v) => save({ enter_transition_ms: Number(v) })} />}
                    <span className="kx-meta">O que entra na tela ou é trocado por outra coisa; passar de slide continua sendo do tema.</span>
                </FormRow>
                <CfgKey k="Por tipo de conteúdo" as="button" type="button" className="cfg-disc kx-t" aria-expanded={open} aria-controls="cfg-enter-kinds" onClick={() => setOpen((o) => !o)}>
                    <Icon name="chevron-down" size={12} />{KINDS_KEY}
                </CfgKey>
                {open && (
                    <div className="frm cfg-subrows" id="cfg-enter-kinds">
                        {TRANSITION_TYPES.map((t) => (
                            <FormRow key={t.id} k={t.label}>
                                <Seg small label={t.label} value={kinds[t.id] || ""} options={KIND_MODES} onChange={(v) => setKind(t.id, v)} />
                                {t.id === "tool" && <span className="kx-meta">Padrão: Corte, a contagem não espera.</span>}
                            </FormRow>
                        ))}
                    </div>
                )}
                <FormRow k="Entre áudios e vídeos">
                    <Seg small label="Entre áudios e vídeos" value={prefs.media_transition} options={MEDIA_MODES}
                        onChange={(v) => save({ media_transition: v }, v === "mix" ? "Áudios e vídeos tocam juntos, como antes." : v === "cut" ? "Um som novo para o que tocava na hora." : "Um som novo faz o que tocava sumir aos poucos.")} />
                    {mediaFade && <Seg small label="Duração entre áudios e vídeos" value={String(prefs.media_transition_ms)} options={msOptions(MEDIA_MS)} onChange={(v) => save({ media_transition_ms: Number(v) })} />}
                    <span className="kx-meta">Quando um começa, o que tocava para</span>
                </FormRow>
                <FormRow k="Tela preta e Logo">
                    <Switch on={prefs.screen_transition} disabled={!clearFades} onChange={(on) => save({ screen_transition: on }, on ? "Tela preta e Logo entram e saem aos poucos." : "Tela preta e Logo entram e saem na hora.")} label="Tela preta e Logo entram e saem com a transição" />
                    <span className="kx-meta">{clearFades ? "entram e saem com a transição de Ao tirar do ar" : "com Corte em Ao tirar do ar, entram e saem na hora"}</span>
                </FormRow>
            </div>
        </CfgGroup>
    );
}
