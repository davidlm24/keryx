import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, Empty } from "../kx";

const SIZE = { small: "P", medium: "M", large: "G", xlarge: "GG" };
const FONT = { sans: "Sem serifa", serif: "Serifa", mono: "Mono", georgia: "Georgia", verdana: "Verdana" };

// Temas: the projection themes (ProjectionTheme). New themes are saved from
// the console's Camadas ("Salvar como novo"); here they are renamed, marked
// as the default, or deleted (asked twice).
export default function TemasSection({ c }) {
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["settings", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    const [renaming, setRenaming] = useState(null);
    const [newName, setNewName] = useState("");
    const [confirmDel, setConfirmDel] = useState(null);
    const reload = () => client.invalidateQueries({ queryKey: ["settings", "themes"] });
    const run = async (p, message) => {
        try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível."); }
        reload();
    };
    const makeDefault = (t) => run(Promise.all(themes.map((x) => (x.id === t.id ? keryx.entities.ProjectionTheme.update(x.id, { is_default: true }) : x.is_default ? keryx.entities.ProjectionTheme.update(x.id, { is_default: false }) : null))), `${t.name} é o tema padrão.`);
    const rename = (t) => {
        const name = newName.trim();
        setRenaming(null);
        if (name && name !== t.name) run(keryx.entities.ProjectionTheme.update(t.id, { name }), "Tema renomeado.");
    };
    const remove = (t) => {
        if (confirmDel !== t.id) { setConfirmDel(t.id); c.say(`Clique de novo em Excluir para apagar "${t.name}".`); return; }
        setConfirmDel(null);
        run(keryx.entities.ProjectionTheme.delete(t.id), "Tema excluído.");
    };

    if (!themes.length) return <Empty icon="palette" title="Nenhum tema ainda">Ajuste o texto em Camadas, no console, e use "Salvar como novo".</Empty>;
    return (
        <>
            {themes.map((t) => (
                <div key={t.id} className={`kx-row ${t.is_default ? "is-selected" : ""}`}>
                    <span className="kx-glyph"><Icon name="palette" /></span>
                    <div className="kx-row-main">
                        {renaming === t.id ? (
                            <input className="cfg-inline" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onBlur={() => rename(t)} onKeyDown={(e) => { if (e.key === "Enter") rename(t); if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} aria-label="Novo nome do tema" />
                        ) : <div className="kx-row-title">{t.name}</div>}
                        <div className="kx-row-meta">{[FONT[t.font_family] || t.font_family || "Sem serifa", SIZE[t.font_size] || "G", t.text_effect && t.text_effect !== "none" ? t.text_effect : "", t.background_image ? "com fundo" : ""].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className="cfg-acts">
                        {t.is_default ? <span className="kx-meta">padrão</span> : <Btn onClick={() => makeDefault(t)}>Tornar padrão</Btn>}
                        <Btn onClick={() => { setRenaming(t.id); setNewName(t.name); }}>Renomear</Btn>
                        <Btn kind={confirmDel === t.id ? "air" : ""} onClick={() => remove(t)}>{confirmDel === t.id ? "Excluir mesmo" : "Excluir"}</Btn>
                    </span>
                </div>
            ))}
            <div className="listhead"><span className="kx-meta">Para criar um tema: ajuste fonte, tamanho e fundo em Camadas, no console, e use "Salvar como novo".</span></div>
        </>
    );
}
