import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { RowLabel } from "../kx";
import Icon from "../Icon";
import { GROUPS_KEY, loadGroups, saveGroups, isOpen as groupIsOpen, setOpen as groupSetOpen } from "@/lib/console/cfgGroups";

// Small pieces shared by the Configurações sections (console design system).

// window.keryxDesktop.* is a fresh object on every access (contextBridge):
// read it once per component.
export function useBridge(name) {
    const ref = useRef(undefined);
    if (ref.current === undefined) ref.current = window.keryxDesktop?.[name] || null;
    return ref.current;
}

// Polls a desktop call ({ data } | { error }) every `ms` (0: once);
// returns [data, refresh, setData, error]. A failed read says why (error, a
// pt-BR message) and, read once, is tried again a few times; an answer that
// arrives after a newer one is dropped.
const RETRY_MS = 3000;
const RETRIES = 3;
export function usePoll(fn, ms) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const fnRef = useRef(fn);
    fnRef.current = fn;
    const seq = useRef(0);
    const refresh = useCallback(async () => {
        const mine = ++seq.current;
        try {
            const res = await fnRef.current();
            if (mine !== seq.current) return false;
            if (res?.error) { setError(res.error.message || "Não foi possível ler."); return false; }
            if (res) { setData(res.data); setError(""); }
            return true;
        } catch (err) {
            if (mine === seq.current) setError(err?.message || "Não foi possível ler.");
            return false;
        }
    }, []);
    useEffect(() => {
        let alive = true;
        let timer = null;
        let tries = 0;
        const once = async () => {
            const ok = await refresh();
            if (!ok && alive && !ms && tries < RETRIES) { tries += 1; timer = setTimeout(once, RETRY_MS); }
        };
        once();
        const id = ms ? setInterval(refresh, ms) : null;
        return () => { alive = false; clearTimeout(timer); if (id) clearInterval(id); };
    }, [refresh, ms]);
    // A value set by hand (an operation's answer) is newer than a read in flight.
    const set = useCallback((v) => { seq.current += 1; setData(v); }, []);
    return [data, refresh, set, error];
}

// An on/off switch (design: .sw2), a real button.
export function Switch({ on, onChange, label, disabled }) {
    return <button type="button" className={`sw2 kx-t ${on ? "is-on" : ""}`} role="switch" aria-checked={Boolean(on)} aria-label={label} title={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

// The search's jump (SettingsView): `pending` is the label it is looking for
// (a closed group holding it opens, CfgGroup), `flash` the row found, lit
// for a moment. Rows find themselves by their label: data-cfg-k.
export const CfgFlash = createContext(null);
export function useFlash(k) {
    const flash = useContext(CfgFlash)?.flash;
    return k && flash === k ? "is-flash" : "";
}

// One "label · control" line of a section form (design: .frm). The label
// names the controls beside it for screen readers (a group), and each one
// with no name of its own (C-29: a Field or Seg through RowLabel, a plain
// input or select directly). It is a real label: a click on it toggles the
// row's switch or puts the cursor in its field, as a label does.
export function FormRow({ k, children }) {
    const flash = useFlash(k);
    const id = useId();
    const box = useRef(null);
    useEffect(() => {
        if (!k || !box.current) return;
        box.current.querySelectorAll("input:not([type=hidden]), select, textarea").forEach((el) => {
            if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby") && !el.labels?.length) el.setAttribute("aria-labelledby", id);
        });
    });
    const operate = () => {
        const el = box.current?.querySelector("input:not([type=hidden]), select, textarea, [role=switch], [type=checkbox]");
        if (!el || el.disabled) return;
        if (el.getAttribute("role") === "switch" || el.type === "checkbox") el.click();
        else el.focus();
    };
    return (
        <>
            <label className={`k ${flash}`} id={k ? id : undefined} data-cfg-k={k || undefined} onClick={k ? operate : undefined}>{k}</label>
            <div ref={box} className={`frm-v ${flash}`} role={k ? "group" : undefined} aria-labelledby={k ? id : undefined}>
                <RowLabel.Provider value={k ? id : null}>{children}</RowLabel.Provider>
            </div>
        </>
    );
}

// While reading the computer (or after a read failed): the section's
// placeholder, with the reason when there is one.
export function Reading({ what, error }) {
    return <div className="kx-empty"><span className="kx-empty-t">{error ? `Não foi possível ler ${what}` : `Lendo ${what}…`}</span>{error && <span>{error}</span>}</div>;
}

// Any other element the search can jump to (a list's heading, a button).
export function CfgKey({ k, as: Tag = "div", className = "", children, ...rest }) {
    const flash = useFlash(k);
    return <Tag className={`${className} ${flash}`} data-cfg-k={k} {...rest}>{children}</Tag>;
}

// Grupos que abrem e fecham (Rodada H0, owner 2026-10-19): which groups the
// operator opened or closed on this computer (localStorage
// `keryx.cfg.groups`, src/lib/console/cfgGroups.js), one store for every
// window — a detached /Janela hears the console's change through `storage`.
const groupListeners = new Set();
let groupsSnapshot = null;
const readGroups = () => { if (!groupsSnapshot) groupsSnapshot = loadGroups(); return groupsSnapshot; };
const onGroupsStorage = (e) => { if (e.key === null || e.key === GROUPS_KEY) { groupsSnapshot = null; groupListeners.forEach((l) => l()); } };
const subscribeGroups = (l) => {
    groupListeners.add(l);
    if (groupListeners.size === 1) window.addEventListener("storage", onGroupsStorage);
    return () => { groupListeners.delete(l); if (!groupListeners.size) window.removeEventListener("storage", onGroupsStorage); };
};
const NO_GROUPS = {};
export function setGroupOpen(id, open, defaultOpen = true) {
    groupsSnapshot = groupSetOpen(readGroups(), id, open, defaultOpen);
    saveGroups(groupsSnapshot);
    groupListeners.forEach((l) => l());
}
// [open, setOpen] for group `id`; `defaultOpen` until the operator chooses.
export function useCfgGroup(id, defaultOpen = true) {
    const groups = useSyncExternalStore(subscribeGroups, readGroups, () => NO_GROUPS);
    const open = groupIsOpen(groups, id, defaultOpen);
    const set = useCallback((v) => setGroupOpen(id, v, defaultOpen), [id, defaultOpen]);
    return [open, set];
}

// A group of rows that opens and closes (Configurações, the editors; the
// owner's "Nem tudo precisa colapsar": a page's first area is a plain
// heading, `fold={false}`, same look, no chevron, never folds). The header
// is a real button (Enter/Space) with the `.kx-section` title, a one-line
// `summary` of what is chosen while closed and `actions` on the right; the
// body stays mounted, inert and hidden when closed (grid-template-rows 0fr,
// 180 ms, none with reduced motion), so a search still finds its rows: a
// jump to one (`pending`) opens the group at once (`.is-instant`, no
// transition). `k` is the search's label (data-cfg-k), `title` what it
// shows (the label by default). State: useCfgGroup.
export function CfgGroup({ id, k, title = k, summary = "", actions = null, defaultOpen = true, fold = true, className = "", children }) {
    const [open, setOpen] = useCfgGroup(id, defaultOpen);
    const shown = fold ? open : true;
    const pending = useContext(CfgFlash)?.pending;
    const bodyId = useId();
    const sumId = useId();
    const body = useRef(null);
    const [instant, setInstant] = useState(false);
    // A search jump into a closed group: open before it is drawn, no motion.
    useLayoutEffect(() => {
        if (!fold || shown || !pending || !body.current) return;
        const hit = [...body.current.querySelectorAll("[data-cfg-k]")].some((n) => n.getAttribute("data-cfg-k") === pending);
        if (hit) { setInstant(true); setOpen(true); }
    }, [pending, shown, fold, setOpen]);
    useEffect(() => {
        if (!instant) return undefined;
        const t = setTimeout(() => setInstant(false), 60);
        return () => clearTimeout(t);
    }, [instant]);
    const showSummary = fold && !open && Boolean(summary);
    return (
        <section className={`cfg-group ${shown ? "is-open" : ""} ${instant ? "is-instant" : ""} ${fold ? "" : "is-static"} ${className}`} data-cfg-group={id}>
            <h3 className="cfg-group-h">
                {fold ? (
                    <CfgKey k={k} as="button" type="button" className="cfg-group-t kx-t" aria-expanded={open} aria-controls={bodyId} aria-describedby={showSummary ? sumId : undefined} onClick={() => setOpen(!open)}>
                        <Icon name="chevron-down" size={12} className="cfg-group-chev" /><span className="kx-section">{title}</span>
                    </CfgKey>
                ) : (
                    <CfgKey k={k} className="cfg-group-t"><span className="cfg-group-chev" aria-hidden="true" /><span className="kx-section">{title}</span></CfgKey>
                )}
                {showSummary ? <span id={sumId} className="kx-meta cfg-group-s">{summary}</span> : null}
                {actions ? <span className="cfg-group-acts">{actions}</span> : null}
            </h3>
            <div id={bodyId} ref={body} className="cfg-group-b" inert={shown ? undefined : ""}>
                <div className="cfg-group-in">{children}</div>
            </div>
        </section>
    );
}

export const formatBytes = (n) => {
    if (!n && n !== 0) return "";
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
};
export const formatWhen = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const desktopOnly = "Esta parte funciona no KERYX do computador.";
