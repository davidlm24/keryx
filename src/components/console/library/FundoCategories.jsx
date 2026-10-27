import React, { useEffect, useState } from "react";
import { Btn, IconBtn } from "../kx";
import Icon from "../Icon";
import { keryx } from "@/api/keryxClient";
import { useSaveBackgroundPref } from "../settings/FundosGallery";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { FALLBACK_CATEGORY, managedCategories, addCategory, renameCategory, removeCategory, moveCategory, inCategory } from "@/lib/console/backgroundPrefs";
import { managedMediaCategories, addMediaCategory, renameMediaCategory, removeMediaCategory, mediaInCategory } from "@/lib/console/mediaCategories";

// A category's name, edited in place: Enter or leaving saves, Esc gives up;
// a refused name (onCommit answers false) goes back to the saved one.
function CategoryName({ value, onCommit }) {
    const [v, setV] = useState(value);
    useEffect(() => setV(value), [value]);
    const commit = async () => { if (v.trim() !== value && (await onCommit(v)) === false) setV(value); };
    return (
        <input className="cfg-inline" style={{ maxWidth: 220 }} value={v} maxLength={40} aria-label={`Nome da categoria ${value}`}
            onChange={(e) => setV(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.stopPropagation(); setV(value); e.currentTarget.blur(); } }} />
    );
}

// A library's categories, the church's (the backgrounds' since 2026-10-16,
// the Mídia's since 2026-10-22, "Bibliotecas" B4): it creates, renames,
// orders and deletes them, even while empty. `names`: the list shown;
// `rows(name)`: what is in one; `keep(list)` saves the list (a User field);
// `moveAll(from, to)` rewrites what was in one; `ops`: the rules (add,
// rename, remove, move; each answers { list, name } or { error }); `noun`:
// [one, many]. "Outros" receives what was in a deleted category and is never
// renamed or deleted.
export function CategoriesEditor({ c, names, rows, keep, moveAll, ops, noun, icon, onDone }) {
    const confirm = useConfirm();
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const count = (n) => `${n} ${n === 1 ? noun[0] : noun[1]}`;

    const run = async (work, message) => {
        setBusy(true);
        try { await work(); if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível salvar as categorias."); }
        setBusy(false);
    };
    const add = () => {
        const r = ops.add(names, draft);
        if (r.error) { c.say(r.error); return; }
        setDraft("");
        run(() => keep(r.list), `Categoria "${r.name}" criada.`);
    };
    const rename = (from, to) => {
        const r = ops.rename(names, from, to);
        if (r.error) { c.say(r.error); return false; }
        run(async () => { await keep(r.list); await moveAll(from, r.name); }, `"${from}" agora é "${r.name}".`);
        return true;
    };
    const remove = async (name) => {
        const r = ops.remove(names, name);
        if (r.error) { c.say(r.error); return; }
        const n = rows(name).length;
        if (!(await confirm(deleteQuestion("a categoria", name, n ? `${n === 1 ? `O ${noun[0]} dela vai` : `Os ${count(n)} dela vão`} para "${FALLBACK_CATEGORY}".` : "Ela está vazia.")))) return;
        run(async () => { await moveAll(name, FALLBACK_CATEGORY); await keep(r.list); }, `Categoria "${name}" excluída.`);
    };
    const move = (name, by) => run(() => keep(ops.move(names, name, by)));

    return (
        <div className="cfg lib-cats">
            <div className="listhead">
                <span className="kx-section">Categorias <span className="kx-count">· na ordem dos filtros</span></span>
                <span style={{ flex: 1 }} />
                <Btn small kind="brand" onClick={onDone}>Concluir</Btn>
            </div>
            {names.map((name, i) => {
                const n = rows(name).length;
                const fixed = name === FALLBACK_CATEGORY;
                return (
                    <div key={name} className="kx-row cfg-edit-row">
                        <span className="kx-glyph"><Icon name={icon} /></span>
                        {fixed ? <span className="kx-row-title">{name}</span> : <CategoryName value={name} onCommit={(to) => rename(name, to)} />}
                        <span className="kx-meta">{n ? count(n) : "vazia"}{fixed ? ` · recebe os ${noun[1]} de uma categoria excluída` : ""}</span>
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
        </div>
    );
}

const FUNDO_OPS = { add: addCategory, rename: renameCategory, remove: removeCategory, move: moveCategory };
const MEDIA_OPS = { add: addMediaCategory, rename: renameMediaCategory, remove: removeMediaCategory, move: moveCategory };

// Categorias de fundos (owner 2026-10-16), a view of the background library
// (its "Categorias…" chip; Configurações › Temas e fundos opens the library
// on it): User.background_categories names and orders them (the helpers in
// backgroundPrefs.js); a rename or a delete moves every background in that
// category (BackgroundPref.category; a factory photo gets its first row).
// Both are church data: they sync with the other computers and ride the
// backups. The first change also keeps the names in use outside the list,
// so nothing moves on its own.
export default function FundoCategories({ c, entries, onDone }) {
    const stored = usePrefs().background_categories;
    const save = useSaveBackgroundPref(c.say);
    // One by one: each may create its BackgroundPref (useSaveBackgroundPref).
    const moveAll = async (from, to) => { for (const b of inCategory(entries, from)) await save(b, { category: to }); };
    return <CategoriesEditor c={c} names={managedCategories(stored, entries)} rows={(n) => inCategory(entries, n)} keep={(list) => updateUser({ background_categories: list })}
        moveAll={moveAll} ops={FUNDO_OPS} noun={["fundo", "fundos"]} icon="image" onDone={onDone} />;
}

// The Mídia's categories (owner 2026-10-22, B4 = A; mediaCategories.js):
// User.media_categories names and orders them, each file's is
// Media.category (the name; an old key is read as its name and rewritten
// when it moves).
export function MediaCategories({ c, media, onDone }) {
    const stored = usePrefs().media_categories;
    const moveAll = async (from, to) => { for (const m of mediaInCategory(media, from)) await keryx.entities.Media.update(m.id, { category: to }); };
    return <CategoriesEditor c={c} names={managedMediaCategories(stored, media)} rows={(n) => mediaInCategory(media, n)} keep={(list) => updateUser({ media_categories: list })}
        moveAll={moveAll} ops={MEDIA_OPS} noun={["arquivo", "arquivos"]} icon="media" onDone={onDone} />;
}
