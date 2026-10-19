import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MenuList, usePlaced } from "./Menu";
import { flattenMenus, nextMenu } from "@/lib/console/menuBar";
import { ACCESS_KEYS, accessParts, menuBarKey, altTap } from "@/lib/console/menuNav";

// The menu bar (owner 2026-10-15, Rodada D4, "Menus novos" = A; the model
// is src/lib/console/menuBar.js): its buttons ride in the top bar beside the
// logo; the open menu is the console's `open` ("mb:<id>"), so Esc and the
// scrim close it like any popover. With one open, pointing at another
// switches to it, and ← / → walk them, as in a desktop program. On a narrow
// window the bar folds away (console.css) and the top bar's Menu button has
// it all (MenusPop below, Rodada M0).
//
// The keyboard (audit C-14, 2026-10-16), as in Windows: F10 or Alt alone
// puts the focus on the bar (← / → walk it, ↓ / Enter open, Esc leaves it);
// Alt + the underlined letter opens that menu — C Culto, M Música, D Mídia,
// F Ferramentas (src/lib/console/menuNav.js; the letter is underlined only
// while Alt is held or the bar has the keyboard, so it reads as before).
// An open menu has the focus (its first item), → enters a submenu, ← leaves
// it, and ← / → elsewhere go to the next menu.
// `blocked`: something is over the console (a window, a dialog): the bar's
// keys rest.
export function MenuBarButtons({ menus, open, setOpen, blocked = false }) {
    const openId = typeof open === "string" && open.startsWith("mb:") ? open.slice(3) : null;
    const nav = useRef(null);
    const [alt, setAlt] = useState(false);
    const [cur, setCur] = useState(0);
    const buttons = () => [...(nav.current?.querySelectorAll("[data-menu]") || [])];
    const shown = () => Boolean(nav.current?.offsetParent);
    const live = useRef({});
    live.current = { open, setOpen, blocked };

    // F10, Alt alone and Alt + letter, from anywhere in the console.
    useEffect(() => {
        let tap = null;
        const free = () => !live.current.blocked && (!live.current.open || live.current.open === "menus" || String(live.current.open).startsWith("mb:"));
        // Folded: the Menu button's popover is the bar (it toggles).
        const toggleMenus = () => live.current.setOpen(live.current.open === "menus" ? null : "menus");
        const focusBar = () => {
            if (!shown()) { toggleMenus(); return; }
            live.current.setOpen(null);
            const list = buttons();
            if (list.includes(document.activeElement)) { document.activeElement.blur(); return; }
            setCur(0);
            list[0]?.focus();
        };
        const onDown = (e) => {
            const r = altTap(tap, e);
            tap = r.state;
            setAlt(e.altKey && !e.ctrlKey);
            const k = menuBarKey(e);
            if (!k || !free()) return;
            e.preventDefault();
            if (k === "bar") focusBar();
            else if (shown()) live.current.setOpen(`mb:${k.slice(5)}`);
            else toggleMenus();
        };
        const onUp = (e) => {
            const r = altTap(tap, e);
            tap = r.state;
            if (e.key === "Alt") setAlt(false);
            if (r.fire && free()) { e.preventDefault(); focusBar(); }
        };
        const reset = (e) => { tap = altTap(tap, { type: e.type }).state; setAlt(false); };
        window.addEventListener("keydown", onDown);
        window.addEventListener("keyup", onUp);
        window.addEventListener("pointerdown", reset, true);
        window.addEventListener("blur", reset);
        return () => {
            window.removeEventListener("keydown", onDown);
            window.removeEventListener("keyup", onUp);
            window.removeEventListener("pointerdown", reset, true);
            window.removeEventListener("blur", reset);
        };
    }, []);

    // The bar with the focus: ← / → (Home / End) walk it, ↓ / Enter / Space
    // open the menu (its first item focused), Esc leaves the bar. Its keys
    // never reach the console behind (an arrow would move what is on air,
    // Esc would end the projection).
    const onKeyDown = (e) => {
        const list = buttons();
        const at = list.indexOf(document.activeElement);
        if (at < 0) return;
        const go = (i) => { const n = (i + list.length) % list.length; setCur(n); list[n].focus(); };
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); go(at + (e.key === "ArrowRight" ? 1 : -1)); }
        else if (e.key === "Home" || e.key === "End") { e.preventDefault(); e.stopPropagation(); go(e.key === "Home" ? 0 : list.length - 1); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setOpen(`mb:${menus[at].id}`); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); document.activeElement.blur(); }
    };
    return (
        <nav ref={nav} className={`tb-menus ${alt ? "show-ak" : ""}`} role="menubar" aria-label="Menus" onKeyDown={onKeyDown}>
            {menus.map((m, i) => {
                const [a, k, b] = accessParts(m.label, ACCESS_KEYS[m.id]);
                return (
                    <button key={m.id} type="button" role="menuitem" data-menu={m.id} aria-haspopup="menu" aria-expanded={openId === m.id}
                        tabIndex={i === cur ? 0 : -1} aria-keyshortcuts={k ? `Alt+${k.toUpperCase()}` : undefined}
                        className={`tb-menu kx-t ${openId === m.id ? "is-on" : ""}`}
                        onFocus={() => setCur(i)}
                        onClick={() => setOpen(openId === m.id ? null : `mb:${m.id}`)}
                        onPointerEnter={() => { if (openId && openId !== m.id) setOpen(`mb:${m.id}`); }}>
                        {a}{k && <span className="tb-ak">{k}</span>}{b}
                    </button>
                );
            })}
        </nav>
    );
}

// The open menu, under its button (in the console, outside the top bar,
// which clips what overflows it). It takes the focus when it opens; the
// console gives the focus back when it closes (Menu.jsx useFocusReturn).
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
    return (
        <MenuList listRef={box} key={menu.id} className="pop kx-pop mb-pop" label={menu.label} items={menu.items} style={{ left, top: "var(--pop-top)" }}
            onClose={() => setOpen(null)} onArrow={(d) => setOpen(`mb:${nextMenu(menu.id, d)}`)} />
    );
}

// The Menu button's popover (Rodada M0): the bar's four menus stacked and all
// open in one list, submenus inline (flattenMenus), anchored to the button
// that shows exactly when the bar is hidden (console.css, one container
// query). The same handlers as the bar. Placed by usePlaced (inside the
// window, scrolling when it is taller than the room), it takes the focus, the
// arrows walk it, Esc and Tab close it and so does a pick. When the window
// grows past the width where the bar is back the button goes, and so does it.
export function MenusPop({ menus, open, setOpen, onAllServices }) {
    const on = open === "menus";
    const box = useRef(null);
    const anchor = useMemo(() => ({ get current() { return document.querySelector(".topbar .tb-menubtn"); } }), []);
    const items = useMemo(() => flattenMenus(menus, { onAllServices }), [menus, onAllServices]);
    usePlaced(box, anchor, { open: on, align: "start" });
    useEffect(() => {
        if (!on) return undefined;
        const folded = () => { if (!anchor.current?.offsetParent) setOpen(null); };
        window.addEventListener("resize", folded);
        return () => window.removeEventListener("resize", folded);
    }, [on, anchor, setOpen]);
    if (!on) return null;
    return <MenuList listRef={box} id="tb-menus-pop" className="kx-pop addmenu-pop menus-pop" label="Menu" items={items} onClose={() => setOpen(null)} />;
}
