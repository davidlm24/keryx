import React from "react";
import Icon from "../../Icon";
import { Btn, Seg } from "../../kx";
import { CfgDisc, CfgGroup, CfgKey, FormRow, Switch } from "../parts";
import { RULE_KINDS, RULE_GROUPS } from "@/lib/contentKinds";
import { PREF_CONTENTS, RULE_SHORTCUTS, RULE_EMPTY, ruleShortcut, ruleSummary, normalizeRule, stageOptions, pastorOptions, lyricsOptions } from "@/lib/outputPrefs";
import { partsSummary, conteudoSummary, kindsSummary } from "@/lib/console/ajustesSummaries";

const NEXT_COUNTS = [["0", "Não"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]];

// One checkbox of the rule's list (the same look as the old Mostrar's).
function Kind({ on, label, hint, onChange }) {
    return (
        <button type="button" role="checkbox" aria-checked={on} className={`kx-check kx-t ${on ? "is-on" : ""}`} title={hint} onClick={() => onChange(!on)}>
            <Icon name="check" size={12} />{label}
        </button>
    );
}

// Conteúdo (Editor da tela › Ajustes, Rodada H2 / G10): "O que esta tela
// recebe" — ONE rule per output, the same list on every output, replacing the
// old Conteúdo select and Mostrar buttons: shortcuts (Tudo, Letra e Bíblia,
// Vídeos, Avisos; changing an item shows Personalizado), the kinds in three
// groups and "Por cima de tudo" (Aviso rápido, Logo no canto) folded under
// them as "Escolher por tipo" (owner 2026-10-27, T2 = A: open when the rule
// is Personalizado), and "Sem item da lista", the rule's other half (T4 = A,
// from Comportamento). Cifra and Nome da parte of a song sit here too. The
// Palco and the Pastor list the parts of their design instead (their
// switches, OutputPref.options).
export default function ConteudoBlock({ ctx }) {
    const { path, label, pref, rule, design, save, saveOpt, isStage, isPastor, renderer } = ctx;
    const setRule = (patch) => save({ content_rule: normalizeRule({ ...rule, ...patch, top: { ...rule.top, ...(patch.top || {}) } }) });
    const shortcut = ruleShortcut(rule);
    const has = (id) => rule.kinds.includes(id);
    const toggle = (id, on) => setRule({ kinds: on ? [...rule.kinds, id] : rule.kinds.filter((k) => k !== id) });
    const own = isStage || isPastor;
    const stage = stageOptions(pref);
    const pastor = pastorOptions(pref);
    const lyrics = lyricsOptions(path, pref);
    // An old Conteúdo choice turned this page into a renderer view: no UI
    // picks one any more; the way back is here.
    const oldView = own && pref.content ? PREF_CONTENTS.find((x) => x.id === pref.content) : null;
    const summary = own ? partsSummary(path, pref) : conteudoSummary(rule, ruleSummary(rule));

    return (
        <CfgGroup id="editor.conteudo" k="Conteúdo" summary={summary}>
            {renderer && (
                <div className="cfg-rule" role="group" aria-label={`O que ${label} recebe`}>
                    <CfgKey k="O que esta tela recebe" className="cfg-rule-q">O que esta tela recebe</CfgKey>
                    <div className="cfg-rule-profs" role="group" aria-label="Atalhos">
                        {RULE_SHORTCUTS.map((s) => (
                            <button type="button" key={s.id} className={`kx-t cfg-rule-prof ${shortcut === s.id ? "is-on" : ""}`} aria-pressed={shortcut === s.id} onClick={() => setRule({ kinds: s.kinds })}>{s.name}</button>
                        ))}
                        {shortcut === "custom" && <span className="cfg-rule-prof is-on is-custom" aria-pressed="true">Personalizado</span>}
                    </div>
                    <CfgDisc k="Escolher por tipo" defaultOpen={shortcut === "custom"} summary={kindsSummary(rule, RULE_KINDS.length)}>
                        {RULE_GROUPS.map((g) => (
                            <div key={g} className="cfg-rule-g">
                                <span className="kx-section">{g}</span>
                                <div className="cfg-kinds kx-checks" role="group" aria-label={g}>
                                    {RULE_KINDS.filter((k) => k.group === g).map((k) => (
                                        <Kind key={k.id} on={has(k.id)} label={k.label} hint={has(k.id) ? `${label} recebe ${k.label.toLowerCase()} · clique para tirar` : `${label} não recebe ${k.label.toLowerCase()} · clique para receber`} onChange={(on) => toggle(k.id, on)} />
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div className="cfg-rule-g">
                            <span className="kx-section">Por cima de tudo</span>
                            <div className="cfg-kinds kx-checks" role="group" aria-label="Por cima de tudo">
                                <Kind on={rule.top.alert} label="Aviso rápido" hint="A barra do Aviso rápido por cima do que estiver na tela" onChange={(on) => setRule({ top: { alert: on } })} />
                                <Kind on={rule.top.logo} label="Logo no canto" hint="A camada Logo do console, no canto desta tela" onChange={(on) => setRule({ top: { logo: on } })} />
                            </div>
                        </div>
                        <span className="kx-meta cfg-rule-note">O que não está na lista deixa a tela no que está por baixo; a música de uma letra continua tocando.</span>
                    </CfgDisc>
                </div>
            )}
            {renderer && (
                <div className="frm cfg-outprefs-form">
                    {/* The rule's other half (T4 = A): with nothing from the
                        list on air, the papel de parede (as always), the Tela
                        preta or the Logo. */}
                    <FormRow k="Sem item da lista">
                        <Seg small label={`O que ${label} mostra sem item da lista`} value={rule.empty} options={RULE_EMPTY} onChange={(v) => setRule({ empty: v })} />
                    </FormRow>
                    {/* What this screen adds to a song's lyrics (lyricsOptions):
                        the chords over the syllables and the part's name. */}
                    {has("lyrics") && <>
                        <FormRow k="Cifra">
                            <Switch on={lyrics.chords} onChange={(on) => saveOpt("chords", on)} label={`Cifra em ${label}`} />
                            <span className="kx-meta">os acordes da letra ([G]) sobre as sílabas</span>
                        </FormRow>
                        <FormRow k="Nome da parte">
                            <Switch on={lyrics.labels} onChange={(on) => saveOpt("labels", on)} label={`Nome da parte em ${label}`} />
                            <span className="kx-meta">Verso, Refrão, Ponte… sobre a letra</span>
                        </FormRow>
                    </>}
                </div>
            )}
            {own && (
                <div className="frm cfg-outprefs-form">
                    {oldView && (
                        <FormRow k="Vista antiga">
                            <span className="kx-meta">Esta tela mostra a vista “{oldView.name}” (um ajuste antigo) em vez do desenho {isStage ? "do Palco" : "do Pastor"}.</span>
                            <Btn small onClick={() => save({ content: "" })} title="A tela volta ao desenho próprio">Voltar ao desenho</Btn>
                        </FormRow>
                    )}
                    {design && !oldView && (
                        <FormRow k="Partes do desenho">
                            <span className="kx-meta">Esta tela tem um desenho próprio: as partes dela são os elementos do Desenho (o olho e a regra Aparece).</span>
                        </FormRow>
                    )}
                    {!design && !oldView && isStage && <>
                        <FormRow k="Cifra">
                            <Switch on={stage.chords} onChange={(on) => saveOpt("chords", on)} label="Cifra no Palco" />
                            <span className="kx-meta">os acordes sobre a letra (ou o bloco de cifra ao lado)</span>
                        </FormRow>
                        <FormRow k="Nome da parte">
                            <Switch on={stage.labels} onChange={(on) => saveOpt("labels", on)} label="Nome da parte no Palco" />
                            <span className="kx-meta">Verso, Refrão, Ponte… no alto</span>
                        </FormRow>
                        <FormRow k="Relógio e tempo">
                            <Switch on={stage.clock} onChange={(on) => saveOpt("clock", on)} label="Relógio e tempo no Palco" />
                            <span className="kx-meta">a hora e o "na música"</span>
                        </FormRow>
                        <FormRow k="Notas para músicos">
                            <Switch on={stage.notes} onChange={(on) => saveOpt("notes", on)} label="Notas para músicos no Palco" />
                        </FormRow>
                        <FormRow k="Próximo slide">
                            <Switch on={stage.next} onChange={(on) => saveOpt("next", on)} label="Próximo slide no Palco" />
                        </FormRow>
                    </>}
                    {!design && !oldView && isPastor && <>
                        <FormRow k="Relógio">
                            <Switch on={pastor.clock} onChange={(on) => saveOpt("clock", on)} label="Relógio no Pastor" />
                            <span className="kx-meta">a hora e o tempo de culto</span>
                        </FormRow>
                        <FormRow k="Próximos itens">
                            <Seg small label="Próximos itens do Pastor" value={String(pastor.next_count)} options={NEXT_COUNTS} onChange={(v) => saveOpt("next_count", Number(v))} />
                            <span className="kx-meta">quantos itens da Setlist aparecem; Não esconde a lista</span>
                        </FormRow>
                        <FormRow k="Cifra">
                            <Switch on={lyrics.chords} onChange={(on) => saveOpt("chords", on)} label="Cifra no Pastor" />
                            <span className="kx-meta">os acordes da letra ([G]) sobre as sílabas</span>
                        </FormRow>
                        <FormRow k="Nome da parte">
                            <Switch on={lyrics.labels} onChange={(on) => saveOpt("labels", on)} label="Nome da parte no Pastor" />
                            <span className="kx-meta">Verso, Refrão, Ponte… sobre a letra</span>
                        </FormRow>
                    </>}
                    {isStage && (
                        <FormRow k="Aviso rápido por cima">
                            <Switch on={rule.top.alert} onChange={(on) => setRule({ top: { alert: on } })} label="Aviso rápido por cima do Palco" />
                            <span className="kx-meta">a barra do aviso, embaixo por padrão</span>
                        </FormRow>
                    )}
                </div>
            )}
        </CfgGroup>
    );
}
