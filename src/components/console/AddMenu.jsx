import React, { useRef } from "react";
import { MenuButton } from "./Menu";
import { IconBtn } from "./kx";

// The "+" beside a search field: what can be added there. An item either
// runs (onClick) or picks files (accept + onFiles; several at once;
// directory: a whole folder). The console's one menu draws it (Menu.jsx):
// the keyboard walks it, disabled items stay disabled, and after it closes
// the + keeps no focus unless the keyboard opened it (audit C-15, C-56).
// items: [{ label, icon, onClick, disabled? } | { label, icon, accept, onFiles } |
//         { label, node } | "sep" | { head }] — node rows just hold a control
// (a setting); "sep" and { head } are Menu.jsx's separator and heading;
// a falsy entry is left out. `small`: the 24 px + of a panel's header (the
// Biblioteca's, owner 2026-10-28, I2 = A).
export default function AddMenu({ title = "Adicionar", items: all, small = false }) {
    const inputs = useRef([]);
    const items = all.filter(Boolean);
    const list = items.map((it, i) => (it === "sep" || it.head ? it : it.node
        ? { node: <div key={it.label} className="kx-menu-h addmenu-row">{it.node}</div> }
        : { label: it.label, icon: it.icon, disabled: it.disabled, title: it.title, onSelect: () => (it.onFiles ? inputs.current[i]?.click() : it.onClick?.()) }));
    return (
        <MenuButton title={title} items={list} trigger={small ? (open, toggle) => <IconBtn name="plus" small title={title} on={open} onClick={toggle} aria-haspopup="menu" aria-expanded={open} /> : undefined}>
            {items.map((it, i) => it.onFiles && (
                <input key={it.label} ref={(el) => { inputs.current[i] = el; }} type="file" multiple accept={it.accept} hidden {...(it.directory ? { webkitdirectory: "" } : {})}
                    onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; if (files.length) it.onFiles(files); }} />
            ))}
        </MenuButton>
    );
}
