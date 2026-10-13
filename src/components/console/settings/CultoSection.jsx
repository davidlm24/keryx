import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { Btn, Field } from "../kx";
import Icon from "../Icon";
import { FormRow, Switch, CfgKey } from "./parts";
import { useUser, usePrefs, updateUser } from "@/hooks/useUser";
import { WEEKDAYS, TEAM_ROLES, teamRole } from "@/lib/console/serviceDefaults";
import { parseDuration, formatDuration } from "@/lib/songImport";
import { BgThumb } from "../library/BgChip";
import { useLookEditor } from "../library/LookDialog";
import { lookOf, hasLook } from "@/lib/console/serviceLook";

// The two lists this section edits, with the planner's query keys: a change
// here reaches the planner (and back) through each table's realtime.
function useRows(entity, key, sort) {
    const client = useQueryClient();
    useEffect(() => keryx.entities[entity].subscribe(() => client.invalidateQueries({ queryKey: ["console", key] })), [client, entity, key]);
    return useQuery({ queryKey: ["console", key], queryFn: () => keryx.entities[entity].list(sort) }).data || [];
}

// A text that saves when it loses focus (or on Enter), not on every key.
function Inline({ value, onCommit, placeholder, label, width = 220, type = "text" }) {
    const [v, setV] = useState(value || "");
    useEffect(() => setV(value || ""), [value]);
    return (
        <input className="cfg-inline" style={{ maxWidth: width }} type={type} value={v} placeholder={placeholder} aria-label={label}
            onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== (value || "").trim()) onCommit(v.trim()); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value || ""); e.currentTarget.blur(); } }} />
    );
}

// Culto: how the services are planned. The usual day and time (Novo culto
// and the day's setlist), how long a song and anything else take when added
// without a length, the forecast of the end, the setlist templates and the
// worship team.
export default function CultoSection({ c }) {
    const openLook = useLookEditor();
    const user = useUser();
    const prefs = usePrefs();
    const forecast = user?.show_forecast === true;
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    const run = async (p, message) => { try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível salvar."); } };
    const templates = useRows("ServiceTemplate", "serviceTemplates", "name");
    const team = useRows("WorshipTeam", "worshipTeam", "name");
    const [confirm, setConfirm] = useState(null);
    const [newMember, setNewMember] = useState({ name: "", role: "vocalist" });
    const twoStep = (key, message, go) => {
        if (confirm !== key) { setConfirm(key); c.say(message); return; }
        setConfirm(null);
        go();
    };
    const setDuration = (key, text, label) => {
        const s = parseDuration(text);
        if (s === null || s < 10) { c.say("Use minutos:segundos, como 4:00."); return; }
        save({ [key]: s }, `${label}: ${formatDuration(s)}.`);
    };
    const addMember = () => {
        const name = newMember.name.trim();
        if (!name) return;
        run(keryx.entities.WorshipTeam.create({ name, role: newMember.role, active: true }), `${name} na equipe.`);
        setNewMember({ name: "", role: newMember.role });
    };

    return (
        <>
            <div className="frm">
                <FormRow k="Dia do culto">
                    <select className="cfg-select" value={prefs.service_weekday ?? ""} aria-label="Dia do culto"
                        onChange={(e) => save({ service_weekday: e.target.value === "" ? null : Number(e.target.value) }, e.target.value === "" ? "Novo culto: hoje." : `Novo culto: no próximo ${WEEKDAYS[Number(e.target.value)].toLowerCase()}.`)}>
                        <option value="">Nenhum · o Novo culto é para hoje</option>
                        {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                    </select>
                </FormRow>
                <FormRow k="Horário padrão">
                    <input type="time" className="cfg-inline" style={{ maxWidth: 120 }} value={prefs.service_start_time} aria-label="Horário padrão do culto"
                        onChange={(e) => { if (e.target.value) save({ service_start_time: e.target.value }); }} onBlur={(e) => { if (e.target.value) c.say(`Horário de sempre: ${e.target.value}.`); }} />
                    {prefs.service_start_time && <Btn small onClick={() => save({ service_start_time: null }, "Sem horário de sempre: cada culto recebe o seu.")}>Sem horário</Btn>}
                    <span className="kx-meta">o Novo culto e a setlist do dia já vêm com ele; sem horário, nada é inventado</span>
                </FormRow>
                <FormRow k="Duração padrão">
                    <span className="kx-meta">Música</span>
                    <Inline key={`s${prefs.duration_song}`} value={formatDuration(prefs.duration_song)} placeholder="4:00" label="Duração de uma música" width={64} onCommit={(t) => setDuration("duration_song", t, "Música")} />
                    <span className="kx-meta">Outros itens</span>
                    <Inline key={`o${prefs.duration_other}`} value={formatDuration(prefs.duration_other)} placeholder="2:00" label="Duração de outro item" width={64} onCommit={(t) => setDuration("duration_other", t, "Outros itens")} />
                    <span className="kx-meta">quando o item entra na setlist sem duração própria</span>
                </FormRow>
                <FormRow k="Previsão do culto">
                    <Switch on={forecast} onChange={(on) => save({ show_forecast: on }, on ? "Previsão do fim e atraso ligados." : "Previsão desligada.")} label="Mostrar a previsão do fim do culto e o atraso" />
                    <span className="kx-meta">mostra "termina ~" e "passou N min" na barra do topo; só faz sentido se o culto é planejado com durações</span>
                </FormRow>
            </div>

            <CfgKey k="Modelos de culto" className="listhead"><span className="kx-section">Modelos de culto <span className="kx-count">· {templates.length} · salve uma setlist como modelo em Planejar o culto</span></span></CfgKey>
            {!templates.length && <div className="listhead"><span className="kx-meta">Nenhum modelo ainda.</span></div>}
            {templates.map((t) => (
                <div key={t.id} className="kx-row cfg-edit-row">
                    <span className="kx-glyph"><Icon name="list" /></span>
                    <Inline value={t.name} label={`Nome do modelo ${t.name}`} onCommit={(name) => { if (name) run(keryx.entities.ServiceTemplate.update(t.id, { name }), "Modelo renomeado."); }} />
                    <span className="kx-meta">{(t.items || []).length} {(t.items || []).length === 1 ? "item" : "itens"}{t.isDefault ? " · modelo do KERYX" : ""}{hasLook(t) ? " · com visual" : ""}</span>
                    <span style={{ flex: 1 }} />
                    {!t.isDefault && <><BgThumb spec={lookOf(t).background} /><Btn small onClick={() => openLook({ kind: "template", id: t.id })} title="O fundo e os temas que este modelo traz ao culto">Visual…</Btn></>}
                    {!t.isDefault && <Btn small kind={confirm === `tpl:${t.id}` ? "air" : ""} onClick={() => twoStep(`tpl:${t.id}`, `Clique de novo para excluir o modelo "${t.name}".`, () => run(keryx.entities.ServiceTemplate.delete(t.id), "Modelo excluído."))}>{confirm === `tpl:${t.id}` ? "Excluir mesmo" : "Excluir"}</Btn>}
                </div>
            ))}

            <CfgKey k="Equipe de louvor" className="listhead"><span className="kx-section">Equipe de louvor <span className="kx-count">· {team.length} · para escalar em Planejar o culto</span></span></CfgKey>
            {team.map((m) => (
                <div key={m.id} className={`kx-row cfg-edit-row ${m.active === false ? "is-dim" : ""}`}>
                    <span className="kx-glyph"><Icon name="user" /></span>
                    <Inline value={m.name} label={`Nome de ${m.name}`} width={180} onCommit={(name) => { if (name) run(keryx.entities.WorshipTeam.update(m.id, { name })); }} />
                    <select className="cfg-select" value={m.role || "other"} aria-label={`Função de ${m.name}`} onChange={(e) => run(keryx.entities.WorshipTeam.update(m.id, { role: e.target.value }), `${m.name}: ${teamRole(e.target.value)}.`)}>
                        {TEAM_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <Inline value={m.phone} label={`WhatsApp de ${m.name}`} placeholder="WhatsApp" width={140} type="tel" onCommit={(phone) => run(keryx.entities.WorshipTeam.update(m.id, { phone }))} />
                    <span className="cfg-launch"><Switch on={m.active !== false} onChange={(on) => run(keryx.entities.WorshipTeam.update(m.id, { active: on }), on ? `${m.name} ativo.` : `${m.name} fora da lista de escala.`)} label={`${m.name} ativo`} /><span className="kx-meta">Ativo</span></span>
                    <span style={{ flex: 1 }} />
                    <Btn small kind={confirm === `m:${m.id}` ? "air" : ""} onClick={() => twoStep(`m:${m.id}`, `Clique de novo para tirar ${m.name} da equipe (os cultos já escalados não mudam).`, () => run(keryx.entities.WorshipTeam.delete(m.id), `${m.name} saiu da equipe.`))}>{confirm === `m:${m.id}` ? "Excluir mesmo" : "Excluir"}</Btn>
                </div>
            ))}
            <div className="kx-row cfg-edit-row">
                <span className="kx-glyph"><Icon name="plus" /></span>
                <Field icon={null} value={newMember.name} onChange={(name) => setNewMember({ ...newMember, name })} placeholder="Novo membro" onKeyDown={(e) => { if (e.key === "Enter") addMember(); }} style={{ maxWidth: 180 }} />
                <select className="cfg-select" value={newMember.role} aria-label="Função do novo membro" onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}>
                    {TEAM_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <Btn small kind="brand" disabled={!newMember.name.trim()} onClick={addMember}>Adicionar</Btn>
            </div>
        </>
    );
}
