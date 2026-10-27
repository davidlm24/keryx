import React from "react";
import Icon from "../Icon";

// A library's category chips (owner 2026-10-22, "Bibliotecas" B3: the same
// row in the background library and the Mídia): one chip per category, a
// radio group, then "Categorias…" (where the church edits them) and what the
// page adds at the end of the row (`children`: the search, the list's
// buttons). `options`: [[key, name]].
export default function FilterChips({ label = "Categoria", options, value, onChange, onEdit, children }) {
    return (
        <div className="fg-filters">
            <div className="fg-chips" role="radiogroup" aria-label={label}>
                {options.map(([k, name]) => (
                    <button type="button" key={k} role="radio" aria-checked={value === k} className={`kx-t fg-chip ${value === k ? "is-on" : ""}`} onClick={() => onChange(k)}>{name}</button>
                ))}
            </div>
            {onEdit && <button type="button" className="kx-t fg-chip fg-chip-edit" title="Criar, renomear, ordenar e excluir as categorias" onClick={onEdit}><Icon name="edit" size={12} />Categorias…</button>}
            {children}
        </div>
    );
}
