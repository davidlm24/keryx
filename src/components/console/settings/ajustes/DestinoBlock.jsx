import React from "react";
import Icon from "../../Icon";
import { Btn } from "../../kx";
import { CfgGroup, FormRow, Switch, desktopOnly } from "../parts";
import { useDisplays, useNetworkInfo } from "../useDisplays";
import { ICON_CHOICES, outputMeta } from "@/lib/outputPrefs";
import { destinoSummary } from "@/lib/console/ajustesSummaries";

// The icons' names, for screen readers and the tooltip.
const ICON_NAMES = { projector: "Projetor", tv: "TV", monitor: "Monitor", tablet: "Tablet", film: "Filme", megaphone: "Megafone", book: "Livro", image: "Imagem", text: "Texto", star: "Estrela", layers: "Camadas", external: "Janela" };

// Destino (Editor da tela › Ajustes, Rodada H2): where this screen is and what
// it is called — the name and icon, the monitor it opens on, "Abrir ao
// iniciar" (moved here from Telas e saídas' card) and its address on the
// network. The first area of the page: open, never folds.
export default function DestinoBlock({ ctx }) {
    const { path, label, pref, save, c } = ctx;
    const meta = outputMeta(path);
    const { displays, list, outputs, apply, valueOf, choose, number } = useDisplays(c.say);
    const { info } = useNetworkInfo();
    // Transmissão is a page of the network only: it has no window to place.
    const placeable = path !== "/StreamView";
    const o = outputs.find((x) => x.key === path) || null;
    const main = info?.urls?.[0] || null;
    const copy = (url) => {
        const fail = () => c.say(`Não foi possível copiar. O endereço é ${url}`);
        try { navigator.clipboard.writeText(url).then(() => c.say("Endereço copiado."), fail); } catch { fail(); }
    };
    return (
        <CfgGroup id="editor.destino" k="Destino" fold={false}
            summary={destinoSummary({ name: label, assignment: o?.assignment, number, network: !placeable })}>
            <div className="frm cfg-outprefs-form">
                <FormRow k="Nome">
                    <input key={pref.name} className="fg-input" defaultValue={pref.name} placeholder={meta.name} maxLength={40}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v !== pref.name) save({ name: v }); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={`Nome da saída ${meta.name}`} />
                    <span className="kx-meta">no console e nas telas na rede; vazio volta ao nome padrão</span>
                </FormRow>
                <FormRow k="Ícone">
                    <div className="cfg-icons" role="radiogroup" aria-label={`Ícone de ${label}`}>
                        <button type="button" className={`kx-t ${!pref.icon ? "is-on" : ""}`} role="radio" aria-checked={!pref.icon} title="Padrão" onClick={() => save({ icon: "" })}><Icon name={meta.icon} /><span className="kx-meta">Padrão</span></button>
                        {ICON_CHOICES.map((ic) => (
                            <button type="button" key={ic} role="radio" aria-checked={pref.icon === ic} className={`kx-t ${pref.icon === ic ? "is-on" : ""}`} aria-label={`Ícone: ${ICON_NAMES[ic] || ic}`} title={ICON_NAMES[ic] || ic} onClick={() => save({ icon: ic })}><Icon name={ic} /></button>
                        ))}
                    </div>
                </FormRow>
                {placeable && (
                    <FormRow k="Tela">
                        {!displays && <span className="kx-meta">{desktopOnly}</span>}
                        {displays && !o && <span className="kx-meta">Lendo as telas…</span>}
                        {displays && o && <>
                            <select className="cfg-select" value={valueOf(o.assignment)} onChange={(e) => choose(o, e.target.value)} aria-label={`Tela de ${label}`}>
                                <option value="auto">Automático</option>
                                <option value="window">Sempre numa janela</option>
                                {list.map((d, i) => <option key={d.id} value={`d:${d.id}`}>Tela {i + 1} · {d.bounds?.width || d.width}×{d.bounds?.height || d.height}</option>)}
                                {typeof o.assignment.target === "object" && !list.some((d) => d.id === o.assignment.target.id) && <option value={`gone:${o.assignment.target.id}`} disabled>{o.assignment.target.width}×{o.assignment.target.height} (desligada)</option>}
                            </select>
                            {o.open
                                ? <Btn small onClick={() => apply(displays.close(path))}>Fechar</Btn>
                                : <Btn small onClick={() => apply(displays.open(path))}>Abrir</Btn>}
                        </>}
                    </FormRow>
                )}
                {placeable && displays && o && (
                    <FormRow k="Abrir ao iniciar">
                        <Switch on={o.assignment.openAtLaunch === true} onChange={(on) => apply(displays.set(path, { openAtLaunch: on }))} label={`Abrir ${label} ao iniciar`} />
                        <span className="kx-meta">a saída abre sozinha quando o KERYX abre</span>
                    </FormRow>
                )}
                <FormRow k="Na rede">
                    {main && info?.running
                        ? <>
                            <code className="cfg-screen-url">{`${main.url}${path}`}</code>
                            <button type="button" className="kx-btn kx-btn-icon kx-t" onClick={() => copy(`${main.url}${path}`)} aria-label={`Copiar o endereço de ${label}`} title="Copiar o endereço"><Icon name="copy" /></button>
                        </>
                        : <span className="kx-meta">{info?.enabled === false || !info?.running ? "Ligue as telas na rede em Configurações › Telas na rede para abrir esta página num tablet ou numa TV." : "Este computador não está ligado a nenhuma rede local."}</span>}
                </FormRow>
            </div>
        </CfgGroup>
    );
}
