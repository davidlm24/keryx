import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { Btn, Field } from "../kx";
import Icon from "../Icon";
import { FormRow, Switch, CfgKey } from "./parts";
import { useUser, usePrefs, updateUser } from "@/hooks/useUser";
import { WEEKDAYS, TEAM_ROLES, teamRole } from "@/lib/console/serviceDefaults";
import { parseDuration, formatDuration } from "@/lib/songImport";
import BgChip from "../library/BgChip";
import ThemeChip from "../library/ThemeChip";
import { lookOf, templateLookFields } from "@/lib/console/serviceLook";
import { churchFundo, defaultFundoFrom } from "@/lib/console/defaultFundo";
import IdleBlock from "./IdleBlock";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";

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
// without a length, the forecast of the end, what the screens show off air
// (the papel de parede's fallback and the Tela ociosa — Aparência dissolved
// into here, Rodada B 2026-10-14), the setlist templates (each with its own
// papel de parede and theme) and the worship team.
export default function CultoSection({ c }) {
    const user = useUser();
    const prefs = usePrefs();
    const forecast = user?.show_forecast === true;
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    const run = async (p, message) => { try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível salvar."); } };
    const templates = useRows("ServiceTemplate", "serviceTemplates", "name");
    const team = useRows("WorshipTeam", "worshipTeam", "name");
    const [newMember, setNewMember] = useState({ name: "", role: "vocalist" });
    const confirmAsk = useConfirm();
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
                        onChange={(e) => { if (e.target.value) save({ service_start_time: e.target.value }); }} onBlur={(e) => { if (e.target.value) c.say(`Horário padrão: ${e.target.value}.`); }} />
                    {prefs.service_start_time && <Btn small onClick={() => save({ service_start_time: null }, "Sem horário padrão: cada culto recebe o seu.")}>Sem horário</Btn>}
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
                    <span className="kx-meta">"termina ~" e o atraso na barra do topo</span>
                </FormRow>
            </div>

            {/* Fora do ar (Rodada B 2026-10-14, "Papel de parede × Tema"): the
                papel de parede is the day's culto's (each template below has
                its own); this row is the fallback — the church's, shown by
                any culto with none — and the Tela ociosa is what remains with
                no papel de parede at all. The row says so while the culto on
                screen covers it (the live state's background.default). */}
            <CfgKey k="Fora do ar" className="listhead"><span className="kx-section">Fora do ar <span className="kx-count">· o papel de parede: as telas sem nada no ar, depois do Esc</span></span></CfgKey>
            <div className="frm">
                <FormRow k="Qualquer outro culto">
                    <BgChip title="Papel de parede · qualquer outro culto" empty="nenhum · as telas mostram a tela ociosa" value={churchFundo(user)}
                        noneLabel={churchFundo(user) ? "Sem papel de parede (tela ociosa)" : undefined}
                        onPick={(spec) => save({ default_background: spec || null, standby_background: spec?.kind === "image" ? spec.value : "" }, spec ? "Papel de parede salvo." : "Sem papel de parede: vale a tela ociosa.")} />
                    <span className="kx-meta">o papel de parede dos cultos sem um próprio</span>
                    {defaultFundoFrom(c.cur) === "culto" && <span className="kx-meta" style={{ color: "var(--warn-fg)" }}>Hoje o culto tem o seu papel de parede (Camadas › Fundo); este fica guardado.</span>}
                </FormRow>
                <IdleBlock c={c} />
            </div>

            <CfgKey k="Modelos de culto" className="listhead"><span className="kx-section">Modelos de culto <span className="kx-count">· {templates.length}</span></span></CfgKey>
            {!templates.length && <div className="listhead"><span className="kx-meta">Nenhum ainda · salve uma setlist como modelo em Planejar o culto.</span></div>}
            {templates.map((t) => (
                <div key={t.id} className="kx-row cfg-edit-row">
                    <span className="kx-glyph"><Icon name="list" /></span>
                    <Inline value={t.name} label={`Nome do modelo ${t.name}`} onCommit={(name) => { if (name) run(keryx.entities.ServiceTemplate.update(t.id, { name }), "Modelo renomeado."); }} />
                    <span className="kx-meta">{(t.items || []).length} {(t.items || []).length === 1 ? "item" : "itens"}{t.isDefault ? " · modelo do KERYX" : ""}</span>
                    <span style={{ flex: 1 }} />
                    {/* What the template brings to the culto (owner's review
                        2026-10-14): its papel de parede and its theme. */}
                    {!t.isDefault && <>
                        <BgChip value={lookOf(t).background} title={`Papel de parede · ${t.name}`} empty="o de qualquer outro culto" noneLabel={lookOf(t).background ? "Sem papel de parede próprio" : undefined}
                            onPick={(spec) => run(keryx.entities.ServiceTemplate.update(t.id, templateLookFields({ ...lookOf(t), background: spec })), "Papel de parede do modelo salvo.")} />
                        <ThemeChip value={lookOf(t).theme_id} title={`Tema do modelo ${t.name}`} empty="sem tema" now={c.now}
                            onPick={(id) => run(keryx.entities.ServiceTemplate.update(t.id, { theme_id: id }), id ? "Tema do modelo salvo." : "O modelo fica sem tema.")} />
                    </>}
                    {!t.isDefault && <Btn small onClick={async () => { if (await confirmAsk(deleteQuestion("o modelo", t.name))) run(keryx.entities.ServiceTemplate.delete(t.id), "Modelo excluído."); }}>Excluir…</Btn>}
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
                    <Btn small onClick={async () => { if (await confirmAsk(deleteQuestion("da equipe", m.name, "Os cultos já escalados não mudam."))) run(keryx.entities.WorshipTeam.delete(m.id), `${m.name} saiu da equipe.`); }}>Excluir…</Btn>
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
