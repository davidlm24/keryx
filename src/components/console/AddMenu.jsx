import React, { useEffect, useRef, useState } from "react";
import { IconBtn, MenuItem } from "./kx";

// The "+" beside a search field: what can be added there. An item either
// runs (onClick) or picks files (accept + onFiles; several at once;
// directory: a whole folder).
// items: [{ label, icon, onClick } | { label, icon, accept, onFiles } |
//         { label, node }] — node rows just hold a control (a setting).
export default function AddMenu({ title = "Adicionar", items }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    const inputs = useRef([]);
    useEffect(() => {
        if (!open) return undefined;
        const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
        window.addEventListener("mousedown", away);
        window.addEventListener("keydown", esc, true);
        return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
    }, [open]);
    return (
        <span className="addmenu" ref={box}>
            <IconBtn name="plus" title={title} on={open} onClick={() => setOpen((o) => !o)} />
            {open && (
                <div className="kx-pop addmenu-pop" role="menu">
                    {items.map((it, i) => (it.node ? (
                        <div key={it.label} className="kx-menu-h addmenu-row">{it.node}</div>
                    ) : (
                        <MenuItem key={it.label} icon={it.icon} role="menuitem" onClick={() => {
                            if (it.onFiles) inputs.current[i]?.click();
                            else { setOpen(false); it.onClick?.(); }
                        }}>{it.label}</MenuItem>
                    )))}
                </div>
            )}
            {items.map((it, i) => it.onFiles && (
                <input key={it.label} ref={(el) => { inputs.current[i] = el; }} type="file" multiple accept={it.accept} hidden {...(it.directory ? { webkitdirectory: "" } : {})}
                    onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; setOpen(false); if (files.length) it.onFiles(files); }} />
            ))}
        </span>
    );
}
