import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { placeMenu, orderItems } from "@/lib/console/contextMenu";

// Right-click menus across the console. A list asks for one with
// useContextMenu()(event, { title, items }); Console.jsx holds the open menu
// (so Esc closes it first, src/lib/console/keys.js escapeTarget) and draws
// it with ContextMenuLayer. Rules (live safety):
//  - a right click never prepares, selects or sends by itself: the menu acts
//    on the row under the pointer only when an item is chosen;
//  - anything that changes what is on air (`air: true`) sits last, after a
//    separator (orderItems);
//  - after an item runs, the keys go back to the console (no control keeps
//    the focus), as after any mouse click.
// items: { label, icon, onSelect, air?, disabled?, kbd? } or "sep".

const MenuCtx = createContext(() => {});
export const ContextMenuProvider = MenuCtx.Provider;
export const useContextMenu = () => useContext(MenuCtx);

// A menu request from a right-click event: where, and what.
export const menuRequest = (e, { title = "", items = [] }) => ({ x: e.clientX, y: e.clientY, title, items: orderItems(items) });

export function ContextMenuLayer({ menu, onClose }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);

    // Measure, then place inside the window (flipped near the edges).
    useLayoutEffect(() => {
        if (!menu || !ref.current) { setPos(null); return; }
        const r = ref.current.getBoundingClientRect();
        setPos(placeMenu({ x: menu.x, y: menu.y, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight }));
    }, [menu]);

    // Keyboard: the first item takes the focus, so ↑/↓ and Enter work in it.
    useEffect(() => {
        if (!menu || !pos) return undefined;
        ref.current?.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
        const close = () => onClose();
        window.addEventListener("resize", close);
        window.addEventListener("blur", close);
        return () => { window.removeEventListener("resize", close); window.removeEventListener("blur", close); };
    }, [menu, pos, onClose]);

    if (!menu) return null;

    const run = (item) => {
        onClose();
        document.activeElement?.blur?.();
        item.onSelect?.();
    };
    const onKeyDown = (e) => {
        const buttons = [...(ref.current?.querySelectorAll("button:not(:disabled)") || [])];
        const at = buttons.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); e.stopPropagation();
            const next = buttons[(at + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length];
            next?.focus();
        } else if (e.key === "Escape" || e.key === "Tab") {
            e.preventDefault(); e.stopPropagation();
            onClose();
            document.activeElement?.blur?.();
        } else if (e.key === "Enter" || e.key === " ") {
            // The focused item's own click runs it; keep the console's keys out.
            e.stopPropagation();
        }
    };

    return (
        <>
            <div className="scrim ctx-scrim" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
            <div ref={ref} className="kx-pop ctx-menu" role="menu" aria-label={menu.title || "Ações"} onKeyDown={onKeyDown}
                style={pos ? { left: pos.left, top: pos.top } : { left: menu.x, top: menu.y, visibility: "hidden" }}
                onContextMenu={(e) => e.preventDefault()}>
                {menu.title && <div className="kx-menu-h"><span className="kx-section">{menu.title}</span></div>}
                {menu.items.map((item, i) => (item === "sep"
                    ? <div key={`sep${i}`} className="kx-menu-sep" role="separator" />
                    : (
                        <button key={item.label} type="button" role="menuitem" className={`kx-menu-item kx-t ${item.air ? "is-air" : ""}`} disabled={item.disabled} onClick={() => run(item)}>
                            <span className="kx-glyph">{item.icon ? <Icon name={item.icon} /> : null}</span>
                            <span className="ctx-l">{item.label}</span>
                            {item.kbd && <span className="kx-kbd">{item.kbd}</span>}
                        </button>
                    )))}
            </div>
        </>
    );
}
