import React, { useEffect, useState } from "react";
import { Btn, IconBtn } from "../kx";
import Icon from "../Icon";
import { CfgKey } from "./parts";
import { useSaveBackgroundPref } from "./FundosGallery";
import { useBackgrounds } from "../useConsoleData";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { FALLBACK_CATEGORY, managedCategories, addCategory, renameCategory, removeCategory, moveCategory, inCategory } from "@/lib/console/backgroundPrefs";

// A category's name, edited in place: Enter or leaving saves, Esc gives up;
// a refused name (onCommit answers false) goes back to the saved one.
function CategoryName({ value, onCommit }) {
    const [v, setV] = useState(value);
    useEffect(() => setV(value), [value]);
    const commit = async () => { if (v.trim() !== value && (await onCommit(v)) === false) setV(value); };
    return (
        <input className="cfg-inline" style={{ maxWidth: 220 }} value={v} maxLength={40} aria-label={`Nome da categoria ${value}`}
            onChange={(e) => setV(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value); e.currentTarget.blur(); } }} />
    );
}

// Categorias de fundos (Configurações › Temas e fundos, owner 2026-10-16):
// the church creates, renames, orders and deletes the background library's
// categories, even while empty (User.background_categories; the helpers and
// their rules are in backgroundPrefs.js). A rename or a delete moves every
// background in that category (BackgroundPref.category; a factory photo gets
// its first row), so the library's chips follow. Both are church data: they
// sync with the other computers and ride the backups. The first change also
// keeps the names in use outside the list, so nothing moves on its own.
export default function FundoCategories({ c }) {
    const stored = usePrefs().background_categories;
    const entries = useBackgrounds();
    const save = useSaveBackgroundPref(c.say);
    const confirm = useConfirm();
    const names = managedCategories(stored, entries);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);

    const run = async (work, message) => {
        setBusy(true);
        try { await work(); if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível salvar as categorias."); }
        setBusy(false);
    };
    const keep = (list) => updateUser({ background_categories: list });
    // One by one: each may create its BackgroundPref (useSaveBackgroundPref).
    const moveAll = async (from, to) => { for (const b of inCategory(entries, from)) await save(b, { category: to }); };

    const add = () => {
        const r = addCategory(names, draft);
        if (r.error) { c.say(r.error); return; }
        setDraft("");
        run(() => keep(r.list), `Categoria "${r.name}" criada.`);
    };
    const rename = (from, to) => {
        const r = renameCategory(names, from, to);
        if (r.error) { c.say(r.error); return false; }
        run(async () => { await keep(r.list); await moveAll(from, r.name); }, `"${from}" agora é "${r.name}".`);
        return true;
    };
    const remove = async (name) => {
        const r = removeCategory(names, name);
        if (r.error) { c.say(r.error); return; }
        const n = inCategory(entries, name).length;
        if (!(await confirm(deleteQuestion("a categoria", name, n ? `${n === 1 ? "O fundo dela vai" : `Os ${n} fundos dela vão`} para "${FALLBACK_CATEGORY}".` : "Ela está vazia.")))) return;
        run(async () => { await moveAll(name, FALLBACK_CATEGORY); await keep(r.list); }, `Categoria "${name}" excluída.`);
    };
    const move = (name, by) => run(() => keep(moveCategory(names, name, by)));

    return (
        <>
            <CfgKey k="Categorias de fundos" className="listhead"><span className="kx-section">Categorias de fundos <span className="kx-count">· na ordem das galerias</span></span></CfgKey>
            {names.map((name, i) => {
                const n = inCategory(entries, name).length;
                const fixed = name === FALLBACK_CATEGORY;
                return (
                    <div key={name} className="kx-row cfg-edit-row">
                        <span className="kx-glyph"><Icon name="image" /></span>
                        {fixed ? <span className="kx-row-title">{name}</span> : <CategoryName value={name} onCommit={(to) => rename(name, to)} />}
                        <span className="kx-meta">{n ? `${n} ${n === 1 ? "fundo" : "fundos"}` : "vazia"}{fixed ? " · recebe os fundos de uma categoria excluída" : ""}</span>
                        <span style={{ flex: 1 }} />
                        <IconBtn small name="chevron-up" title={`Subir ${name}`} disabled={busy || i === 0} onClick={() => move(name, -1)} />
                        <IconBtn small name="chevron-down" title={`Descer ${name}`} disabled={busy || i === names.length - 1} onClick={() => move(name, 1)} />
                        {!fixed && <Btn small disabled={busy} onClick={() => remove(name)}>Excluir…</Btn>}
                    </div>
                );
            })}
            <div className="kx-row cfg-edit-row">
                <span className="kx-glyph"><Icon name="plus" /></span>
                <input className="cfg-inline" style={{ maxWidth: 220 }} value={draft} maxLength={40} placeholder="Nova categoria" aria-label="Nova categoria"
                    onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
                <Btn small kind="brand" disabled={busy || !draft.trim()} onClick={add}>Adicionar</Btn>
            </div>
        </>
    );
}
