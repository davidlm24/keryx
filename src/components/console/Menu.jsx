import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { IconBtn, MenuItem } from "./kx";
import { menuStep, focusAfterClose } from "@/lib/console/menuNav";
import { placeBox } from "@/lib/console/contextMenu";

// The one menu of the console (audit C-15, 2026-10-16): the menu bar, the
// logo's menu, Ver, the (+) menus, the right-click menus, the tabs lists and
// the Bíblia's lists all draw their items here, so they work alike from the
// keyboard. It takes the focus when it opens (its first item), ↑ / ↓ walk it
// (round the ends), Home / End jump, disabled items are skipped and say so,
// → opens a submenu and ← leaves it, Enter / Space choose, Esc and Tab close.
// One frame (.kx-pop, console.css) and the design system's gold focus ring.
//
// items: { label, icon?, kbd?, checked?, disabled?, title?, meta?, air?,
//          role? ("menuitemcheckbox"), keep? (stays open when chosen),
//          onSelect?, sub?: [items] }
//        | "sep" | { sep: true } | { head, meta? } | { node } (a row of its own:
//          a setting, a header — never focused by the arrows).
// A head may be `minor` (a sub-title) and an item `indent`ed under it: the
// Menu button's popover lists a submenu inline (menuBar.js flattenMenus).

// How the operator last acted: the keyboard or the pointer (for the focus
// after a menu closes, menuNav.js focusAfterClose).
let lastInput = "pointer";
if (typeof window !== "undefined") {
    window.addEventListener("keydown", () => { lastInput = "key"; }, true);
    window.addEventListener("pointerdown", () => { lastInput = "pointer"; }, true);
}
export const inputModality = () => lastInput;

// Where the focus goes when something that took it closes: the control that
// opened it when the keyboard opened and closed it, else nowhere (the body),
// so the console's live keys keep working (Console.jsx onMouseClick). Watch
// `active` (open or not) in the component that owns the open state.
export function useFocusReturn(active) {
    const rec = useRef(null);
    // A layout effect: it runs before the menu's own (passive) effect moves
    // the focus into it, so the control that opened it is still focused.
    useLayoutEffect(() => {
        if (active) {
            if (!rec.current) {
                const t = document.activeElement;
                rec.current = { trigger: t && t !== document.body ? t : null, by: inputModality() };
            }
            return;
        }
        const r = rec.current;
        rec.current = null;
        if (!r) return;
        const a = document.activeElement;
        const trigger = r.trigger?.isConnected ? r.trigger : null;
        const go = focusAfterClose({ openedBy: r.by, closedBy: inputModality(), focusFree: !a || a === document.body, trigger });
        if (go === "trigger") trigger.focus({ preventScroll: true });
        // Never left on the control that opened it after a mouse open (the
        // + kept it, and Enter reopened the menu instead of sending; C-56).
        else if (trigger && a === trigger) trigger.blur();
    }, [active]);
}

// The box a position:fixed element is laid out in: the nearest ancestor
// that makes one (a transform — THE window, a dialog, the palette —, a
// filter, contain: paint/layout), else the window.
function fixedHost(el) {
    for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.transform !== "none" || cs.filter !== "none" || cs.perspective !== "none" || /paint|layout|strict|content/.test(cs.contain)) return p;
    }
    return null;
}

// Keeps an open menu inside the window (Rodada G1, placeBox in
// contextMenu.js): `ref` is the menu (position: fixed), `anchorRef` the
// button it opens from. Writes left, top and max-height inline, again when
// the window changes size (the console's zoom too) or the menu does. Inside
// a transformed frame the menu stays inside that frame, which clips it.
export function usePlaced(ref, anchorRef, { open = true, align = "end" } = {}) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!open || !el) return undefined;
        const place = () => {
            const a = anchorRef.current;
            if (!a || !el.isConnected) return;
            el.style.left = "0px"; el.style.top = "0px"; el.style.right = "auto"; el.style.bottom = "auto"; el.style.maxHeight = "";
            const origin = el.getBoundingClientRect();
            const host = fixedHost(el)?.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            // Never over the top bar (an above-flip near the console's top).
            const bar = document.querySelector(".console .topbar")?.getBoundingClientRect();
            const bounds = {
                left: Math.max(0, host?.left ?? 0), right: Math.min(vw, host?.right ?? vw),
                top: Math.max(0, host?.top ?? 0, bar && !host ? bar.bottom : 0), bottom: Math.min(vh, host?.bottom ?? vh),
            };
            const p = placeBox({ anchor: a.getBoundingClientRect(), w: el.offsetWidth, h: el.scrollHeight, bounds, align });
            el.style.left = `${p.left - origin.left}px`;
            el.style.top = `${p.top - origin.top}px`;
            if (p.maxHeight != null) { el.style.maxHeight = `${p.maxHeight}px`; el.style.overflowY = "auto"; }
        };
        place();
        window.addEventListener("resize", place);
        const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());
        ro?.observe(el);
        return () => { window.removeEventListener("resize", place); ro?.disconnect(); };
    }, [ref, anchorRef, open, align]);
}

// A focused item in a menu that scrolls (a max-height from usePlaced, the
// Bíblia's lists) is brought into view; the focus itself never scrolls
// anything (preventScroll), so the console under the menu stays still.
function revealIn(box, el) {
    if (!box || !el || box.scrollHeight <= box.clientHeight) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
}

const isSep = (it) => it === "sep" || Boolean(it?.sep);
const itemsOf = (box) => [...(box?.querySelectorAll("[data-mi]") || [])].filter((el) => el.closest("[role='menu']") === box);

// The list itself (role="menu"). `onClose` closes it (Esc, Tab, a pick
// unless the item keeps it open; `closeOnPick` false leaves picks to the
// items); `onArrow(dir)` gets ← / → that no submenu takes (the menu bar
// walks its menus with them); `onLeave` is a submenu's way back;
// `listRef` gets the list's element.
export function MenuList({ items = [], label, className = "", style, autoFocus = true, closeOnPick = true, onClose, onArrow, onLeave, onPick, listRef, children, ...rest }) {
    const box = useRef(null);
    const [sub, setSub] = useState(null); // { i, byKey }
    const setRef = (el) => { box.current = el; if (listRef) listRef.current = el; };

    useEffect(() => {
        if (!autoFocus) return;
        const first = itemsOf(box.current).find((el) => !el.disabled);
        first?.focus({ preventScroll: true });
    }, [autoFocus]);

    const pick = (it) => {
        if (it.disabled) return;
        if (onPick) { onPick(it); return; }
        if (closeOnPick && !it.keep) onClose?.("pick");
        it.onSelect?.();
    };
    const focusAt = (i) => {
        const el = itemsOf(box.current)[i];
        el?.focus({ preventScroll: true });
        revealIn(box.current, el);
    };

    const onKeyDown = (e) => {
        if (e.defaultPrevented) return;
        const list = itemsOf(box.current);
        const at = list.indexOf(document.activeElement);
        const step = menuStep(list.map((el) => ({ disabled: el.disabled })), at, e.key);
        if (step !== null) { e.preventDefault(); e.stopPropagation(); focusAt(step); return; }
        const it = at >= 0 ? itemOfEl(list[at]) : null;
        if (e.key === "ArrowRight" && it?.sub) {
            e.preventDefault(); e.stopPropagation();
            setSub({ i: Number(list[at].dataset.mi), byKey: true });
        } else if (e.key === "ArrowLeft" && onLeave) {
            e.preventDefault(); e.stopPropagation(); onLeave();
        } else if (e.key === "ArrowLeft" && sub) {
            // A submenu open with nothing to focus in it: ← closes it.
            e.preventDefault(); e.stopPropagation(); setSub(null);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            // Arrows stay in the menu: never a slide on air behind it.
            e.preventDefault(); e.stopPropagation();
            onArrow?.(e.key === "ArrowRight" ? 1 : -1);
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault(); e.stopPropagation();
        } else if (e.key === "Escape" && (onLeave || onClose)) {
            e.preventDefault(); e.stopPropagation();
            if (onLeave) onLeave(); else onClose("esc");
        } else if (e.key === "Tab" && onClose && !onLeave) {
            e.preventDefault(); e.stopPropagation(); onClose("tab");
        } else if ((e.key === "Enter" || e.key === " ") && it?.sub) {
            e.preventDefault(); e.stopPropagation();
            setSub({ i: Number(list[at].dataset.mi), byKey: true });
        }
    };
    const itemOfEl = (el) => items[Number(el?.dataset.mi)];

    return (
        <div ref={setRef} role="menu" aria-label={label} className={className} style={style} onKeyDown={onKeyDown} {...rest}>
            {items.map((it, i) => {
                if (!it) return null;
                if (isSep(it)) return <div key={`s${i}`} className="kx-menu-sep" role="separator" />;
                if (it.node) return <React.Fragment key={`n${i}`}>{it.node}</React.Fragment>;
                if (it.head != null) return <div key={`h${i}`} className={`kx-menu-h ${it.minor ? "is-minor" : ""}`} role="presentation"><span className="kx-section">{it.head}</span>{it.meta != null && <><span style={{ flex: 1 }} /><span className="kx-meta">{it.meta}</span></>}</div>;
                const open = sub?.i === i;
                const tail = it.sub ? <Icon name="chevron-right" /> : it.kbd;
                // An item with a state (checked true or false) is a checkbox
                // item and says it (C-26): the culto of the day, Ver's modules.
                const role = it.role || (typeof it.checked === "boolean" ? "menuitemcheckbox" : "menuitem");
                const button = (
                    <MenuItem key={it.sub ? undefined : `${it.label}${i}`} data-mi={i} tabIndex={-1} icon={it.icon} checked={it.checked} kbd={tail} disabled={it.disabled} title={it.title}
                        role={role} aria-checked={role === "menuitemcheckbox" ? Boolean(it.checked) : undefined}
                        aria-disabled={it.ariaDisabled || undefined} aria-haspopup={it.sub ? "menu" : undefined} aria-expanded={it.sub ? open : undefined}
                        className={`${it.air ? "is-air" : ""} ${open ? "is-on" : ""} ${it.meta ? "has-meta" : ""} ${it.indent ? "is-indent" : ""}`}
                        onPointerEnter={it.sub ? () => setSub({ i, byKey: false }) : sub ? () => setSub(null) : undefined}
                        onClick={() => (it.sub ? setSub(open ? null : { i, byKey: false }) : pick(it))}>
                        {it.meta
                            ? <span className="kx-menu-l2"><span>{it.label}</span><span className="kx-meta">{it.meta}</span></span>
                            : <span className="kx-menu-l">{it.label}</span>}
                    </MenuItem>
                );
                if (!it.sub) return button;
                return (
                    <div key={`${it.label}${i}`} className="mb-row" onPointerLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSub(null); }}>
                        {button}
                        {open && (
                            <MenuList className="kx-pop mb-sub" label={it.label} items={it.sub} autoFocus={sub.byKey} closeOnPick={closeOnPick} onClose={onClose} onPick={onPick}
                                onLeave={() => { setSub(null); focusAt(itemsOf(box.current).findIndex((el) => Number(el.dataset.mi) === i)); }} />
                        )}
                    </div>
                );
            })}
            {children}
        </div>
    );
}

// A button with its menu under it (the (+) menus, the Bíblia's lists): the
// open state is its own; a click away or Esc closes it, and the console's
// keys never see that Esc (it would end the projection).
// `trigger(open, toggle)`: the button, when not the (+) icon.
export function MenuButton({ title, items, label, trigger, popClass = "", flip = true, onOpen, children }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    const pop = useRef(null);
    useFocusReturn(open);
    // The pop hangs from the button's right edge (`flip` false: from its
    // left edge, the Bíblia's lists), turns to the other edge where the
    // window ends, opens above when there is no room below, and never
    // leaves the window (usePlaced; a panel no longer clips it).
    usePlaced(pop, box, { open, align: flip ? "end" : "start" });
    useEffect(() => {
        if (!open) return undefined;
        const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
        window.addEventListener("mousedown", away);
        window.addEventListener("keydown", esc, true);
        return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
    }, [open]);
    const toggle = () => { if (!open) onOpen?.(); setOpen((o) => !o); };
    const list = typeof items === "function" ? items(() => setOpen(false)) : items;
    return (
        <span className="addmenu" ref={box}>
            {trigger ? trigger(open, toggle) : <IconBtn name="plus" title={title} on={open} onClick={toggle} aria-haspopup="menu" aria-expanded={open} />}
            {open && <MenuList listRef={pop} className={`kx-pop addmenu-pop ${popClass}`} label={label || title} items={list} onClose={() => setOpen(false)} />}
            {children}
        </span>
    );
}

// A popover that is not a menu (Saídas, Notificações): its first control
// takes the focus when it opens, so Tab goes on from inside it; the console
// gives the focus back when it closes (useFocusReturn).
const FOCUSABLE = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
export function useFocusFirst(active) {
    const ref = useRef(null);
    useEffect(() => {
        if (active) ref.current?.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
    }, [active]);
    return ref;
}
