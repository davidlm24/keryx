import { useEffect, useRef, useState } from "react";
import { freshMessages, messageSay, hasUnread, newestAt } from "@/lib/console/pedidos";

// What the console says when the Equipe writes (Rodada Q, PR2), mounted once
// in Console.jsx (never in /Janela). The runner's chat.send / request.send
// are quiet: the toast comes from here, from the culto's ServiceMessage rows,
// so a pedido synced from another computer is said too, and never twice —
// the ids said live in this window's sessionStorage, so a reload does not
// repeat them, and only a row sent in the last 2 minutes is said at all.
// A fresh row also puts Pedidos back among the panel's tabs when the
// operator's saved list leaves it out (`show`), and its toast's Ver opens it
// (`focus`). The tab's dot: a row newer than the last one seen with the tab
// open (localStorage, this computer).
const TOLD_KEY = "keryx.console.pedidos.told";
const SEEN_KEY = "keryx.console.pedidos.seen";

const readTold = () => {
    try {
        const list = JSON.parse(window.sessionStorage.getItem(TOLD_KEY) || "[]");
        return new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
    } catch { return new Set(); }
};
const readSeen = () => {
    try { return window.localStorage.getItem(SEEN_KEY) || ""; } catch { return ""; }
};

export function usePedidos({ c, messages, tabOpen, show, focus }) {
    const told = useRef(null);
    if (!told.current) told.current = readTold();
    const latest = useRef({ c, show, focus });
    latest.current = { c, show, focus };
    useEffect(() => {
        const fresh = freshMessages(messages, told.current);
        if (!fresh.length) return;
        for (const r of fresh) told.current.add(r.id);
        // Keep the list short: the ids of the last few hundred rows are enough.
        try { window.sessionStorage.setItem(TOLD_KEY, JSON.stringify([...told.current].slice(-300))); } catch { /* this window only */ }
        const { c: con, show: showTab, focus: focusTab } = latest.current;
        showTab();
        const last = fresh[fresh.length - 1];
        const words = fresh.length > 1 ? `${messageSay(last)} · e mais ${fresh.length - 1}` : messageSay(last);
        con.say(words, { label: "Ver", run: () => focusTab() });
    }, [messages]);

    const [seen, setSeen] = useState(readSeen);
    useEffect(() => {
        if (!tabOpen) return;
        const newest = newestAt(messages);
        if (!newest || newest <= seen) return;
        setSeen(newest);
        try { window.localStorage.setItem(SEEN_KEY, newest); } catch { /* the dot comes back after a reload */ }
    }, [tabOpen, messages, seen]);
    return { unread: !tabOpen && hasUnread(messages, seen) };
}
