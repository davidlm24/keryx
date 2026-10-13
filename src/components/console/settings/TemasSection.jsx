import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, Empty } from "../kx";
import { FormRow, CfgKey } from "./parts";
import { THEME_FONTS, TEXT_SIZES, defaultTheme, defaultChanges } from "@/lib/console/themes";
import { openEditor } from "@/lib/editorWindow";

const SIZE = Object.fromEntries(TEXT_SIZES);
const FONT = Object.fromEntries(THEME_FONTS);

// Configurações › Temas: the LIST of the projection presets — the default
// one, Tornar padrão and Excluir. Editing happens in ONE place, the Editor
// de temas e layouts (its own window, src/pages/Editor.jsx): "Editar" and
// "Novo tema…" open it. Camadas adjusts what is on air and captures a theme
// with "Salvar como novo"; the console's Temas card applies them.
export default function TemasSection({ c }) {
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["settings", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    useEffect(() => keryx.entities.ProjectionTheme.subscribe(() => client.invalidateQueries({ queryKey: ["settings", "themes"] })), [client]);
    const [confirmDel, setConfirmDel] = useState(null);
    const reload = () => client.invalidateQueries({ queryKey: ["settings", "themes"] });
    const run = async (p, message) => {
        try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível."); }
        reload();
    };
    const edit = (id) => { const r = openEditor({ theme: id || "new" }); if (r?.error) c.say(r.error); };
    // One transaction: never two defaults, never none in between.
    const def = defaultTheme(themes);
    const setDefault = (id) => {
        const rows = defaultChanges(themes, id);
        if (!rows.length) return;
        const t = themes.find((x) => x.id === id);
        run(keryx.entities.ProjectionTheme.bulkUpdate(rows), t ? `${t.name} é o tema padrão: músicas e passagens sem estilo próprio vão ao ar com ele.` : "Sem tema padrão: vale o estilo de fábrica.");
    };
    const remove = (t) => {
        if (confirmDel !== t.id) { setConfirmDel(t.id); c.say(`Clique de novo em Excluir para apagar "${t.name}".`); return; }
        setConfirmDel(null);
        run(keryx.entities.ProjectionTheme.delete(t.id), "Tema excluído.");
    };

    return (
        <>
            <div className="frm">
                <FormRow k="Estilo padrão do texto">
                    <select className="cfg-select" value={def?.id || ""} onChange={(e) => setDefault(e.target.value || null)} aria-label="Tema padrão">
                        <option value="">Estilo de fábrica (sem tema)</option>
                        {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <span className="kx-meta">músicas e passagens sem estilo próprio vão ao ar com ele · o que já está no ar não muda</span>
                </FormRow>
            </div>
            <CfgKey k="Temas" className="listhead"><span className="kx-section">Temas <span className="kx-count">· texto e fundo prontos, aplicados na hora em Camadas</span></span><span style={{ flex: 1 }} /><Btn small kind="brand" onClick={() => edit("new")}>Novo tema…</Btn></CfgKey>
            {!themes.length && <Empty icon="palette" title="Nenhum tema ainda">Crie um em "Novo tema…" (abre o Editor de temas e layouts), ou ajuste o texto em Camadas e use "Salvar como novo".</Empty>}
            {themes.map((t) => (
                <div key={t.id} className={`kx-row ${t.is_default ? "is-selected" : ""}`}>
                    <span className="kx-glyph"><Icon name="palette" /></span>
                    <div className="kx-row-main">
                        <div className="kx-row-title">{t.name}</div>
                        <div className="kx-row-meta">{[FONT[t.font_family] || t.font_family || "Sem serifa", SIZE[t.font_size] || "G", t.text_effect && t.text_effect !== "none" ? t.text_effect : "", t.transition ? `transição ${t.transition}` : "", t.background_image ? "com fundo" : ""].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className="cfg-acts">
                        {t.is_default ? <span className="kx-meta">padrão</span> : <Btn onClick={() => setDefault(t.id)}>Tornar padrão</Btn>}
                        <Btn onClick={() => edit(t.id)} title="Abre o Editor de temas e layouts, na janela dele">Editar</Btn>
                        <Btn kind={confirmDel === t.id ? "air" : ""} onClick={() => remove(t)}>{confirmDel === t.id ? "Excluir mesmo" : "Excluir"}</Btn>
                    </span>
                </div>
            ))}
        </>
    );
}
