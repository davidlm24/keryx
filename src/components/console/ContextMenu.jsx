import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MenuList } from "./Menu";
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
// items: { label, icon, onSelect, air?, disabled?, kbd? } or "sep" — the
// console's one menu (Menu.jsx MenuList) draws them.

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

    useEffect(() => {
        if (!menu || !pos) return undefined;
        const close = () => onClose();
        window.addEventListener("resize", close);
        window.addEventListener("blur", close);
        return () => { window.removeEventListener("resize", close); window.removeEventListener("blur", close); };
    }, [menu, pos, onClose]);

    if (!menu) return null;

    const done = () => { onClose(); document.activeElement?.blur?.(); };
    const run = (item) => { done(); item.onSelect?.(); };

    return (
        <>
            <div className="scrim ctx-scrim" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
            {/* The first item takes the focus once placed (hidden, it could not). */}
            <MenuList listRef={ref} key={`${menu.x},${menu.y}`} className="kx-pop ctx-menu" label={menu.title || "Ações"} autoFocus={Boolean(pos)}
                items={[...(menu.title ? [{ head: menu.title }] : []), ...menu.items]} onPick={run} onClose={done}
                style={pos ? { left: pos.left, top: pos.top } : { left: menu.x, top: menu.y, visibility: "hidden" }}
                onContextMenu={(e) => e.preventDefault()} />
        </>
    );
}
