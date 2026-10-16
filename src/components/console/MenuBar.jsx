import React, { useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { MenuItem } from "./kx";
import { nextMenu } from "@/lib/console/menuBar";

// The menu bar (owner 2026-10-15, Rodada D4, "Menus novos" = A; the model
// is src/lib/console/menuBar.js): its buttons ride in the top bar beside the
// logo; the open menu is the console's `open` ("mb:<id>"), so Esc and the
// scrim close it like any popover. With one open, pointing at another
// switches to it, and ← / → walk them, as in a desktop program. On a narrow
// window the bar folds away (console.css) and the logo's menu has it all.
export function MenuBarButtons({ menus, open, setOpen }) {
    const openId = typeof open === "string" && open.startsWith("mb:") ? open.slice(3) : null;
    return (
        <nav className="tb-menus" role="menubar" aria-label="Menus">
            {menus.map((m) => (
                <button key={m.id} type="button" role="menuitem" data-menu={m.id} aria-haspopup="menu" aria-expanded={openId === m.id}
                    className={`tb-menu kx-t ${openId === m.id ? "is-on" : ""}`}
                    onClick={() => setOpen(openId === m.id ? null : `mb:${m.id}`)}
                    onPointerEnter={() => { if (openId && openId !== m.id) setOpen(`mb:${m.id}`); }}>
                    {m.label}
                </button>
            ))}
        </nav>
    );
}

// One item: an icon, the check of a state (the culto of the day), a key.
function Item({ it, onPick, onSub, subOpen }) {
    const tail = it.sub ? <Icon name="chevron-right" /> : it.checked && it.icon ? <Icon name="check" /> : it.kbd;
    return (
        <MenuItem icon={it.icon} checked={it.checked} kbd={tail} disabled={it.disabled} title={it.title} role="menuitem"
            aria-haspopup={it.sub ? "menu" : undefined} aria-expanded={it.sub ? subOpen : undefined}
            className={`kx-menu-item kx-t ${it.checked ? "is-checked" : ""} ${subOpen ? "is-on" : ""}`}
            onPointerEnter={onSub} onClick={it.sub ? onSub : onPick}>
            <span className="mb-l">{it.label}</span>
        </MenuItem>
    );
}

function Items({ items, onDone }) {
    const [sub, setSub] = useState(null);
    return items.map((it, i) => {
        if (it.sep) return <div key={`s${i}`} className="kx-menu-sep" />;
        if (it.head) return <div key={`h${i}`} className="kx-menu-h"><span className="kx-section">{it.head}</span></div>;
        const pick = () => { onDone(); it.onSelect?.(); };
        return (
            <div key={`${it.label}${i}`} className="mb-row" onPointerLeave={(e) => { if (it.sub && !e.currentTarget.contains(e.relatedTarget)) setSub(null); }}>
                <Item it={it} onPick={pick} subOpen={sub === i} onSub={() => setSub(it.sub ? i : null)} />
                {it.sub && sub === i && (
                    <div className="kx-pop mb-sub" role="menu" aria-label={it.label}>
                        <Items items={it.sub} onDone={onDone} />
                    </div>
                )}
            </div>
        );
    });
}

// The open menu, under its button (in the console, outside the top bar,
// which clips what overflows it).
export function MenuBarPop({ menus, open, setOpen }) {
    const openId = typeof open === "string" && open.startsWith("mb:") ? open.slice(3) : null;
    const menu = menus.find((m) => m.id === openId) || null;
    const [left, setLeft] = useState(8);
    const box = useRef(null);
    useLayoutEffect(() => {
        if (!menu) return;
        const btn = document.querySelector(`.topbar .tb-menus [data-menu="${menu.id}"]`);
        const host = box.current?.offsetParent;
        if (!btn || !host) return;
        const b = btn.getBoundingClientRect();
        const h = host.getBoundingClientRect();
        const w = box.current.offsetWidth;
        setLeft(Math.max(8, Math.min(b.left - h.left, h.width - w - 8)));
    }, [menu]);
    if (!menu) return null;
    // The keyboard inside the menu: ↑ ↓ between items, ← → to the next menu.
    const onKeyDown = (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault(); e.stopPropagation();
            setOpen(`mb:${nextMenu(menu.id, e.key === "ArrowRight" ? 1 : -1)}`);
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); e.stopPropagation();
            const list = [...box.current.querySelectorAll(":scope > .mb-row > .kx-menu-item:not(:disabled)")];
            const at = list.indexOf(document.activeElement);
            const next = list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length];
            next?.focus();
        }
    };
    return (
        <div ref={box} className="pop kx-pop mb-pop" role="menu" aria-label={menu.label} style={{ left, top: "var(--pop-top)" }} onKeyDown={onKeyDown}>
            <Items key={menu.id} items={menu.items} onDone={() => setOpen(null)} />
        </div>
    );
}
