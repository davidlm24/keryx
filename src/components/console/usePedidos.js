import { useEffect, useRef, useState } from "react";
import { freshMessages, messageSay, hasUnread, newestAt, pedidosOf, chatOf, tabOf } from "@/lib/console/pedidos";

// What the console says when the Equipe writes (Rodada Q, PR2), mounted once
// in Console.jsx (never in /Janela). The runner's chat.send / request.send
// are quiet: the toast comes from here, from the culto's ServiceMessage rows,
// so a pedido synced from another computer is said too, and never twice —
// the ids said live in this window's sessionStorage, so a reload does not
// repeat them, and only a row sent in the last 2 minutes is said at all.
// What the operator wrote never makes a toast or a dot. Pedidos and Chat are
// two tabs (S12 = B): a fresh row puts its tab back among the panel's tabs
// when the operator's saved list leaves it out (`show(ids)`), and its toast's
// Ver opens it (`focus(id)`) — only while the Painel is on screen
// (`reachable`): the dock never moves by itself, so otherwise the toast says
// where it is (owner's S9 = B, Rodada Q) and the top bar's Ver wears the
// dot. A row whose tab is open on screen (`open[id]`) says nothing: the
// operator is reading it there. Each tab's dot: a row newer than the last
// one seen with that tab open (localStorage, this computer).
const TOLD_KEY = "keryx.console.pedidos.told";
const SEEN_KEY = { pedidos: "keryx.console.pedidos.seen", chat: "keryx.console.chat.seen" };
const TABS = { pedidos: pedidosOf, chat: chatOf };

const readTold = () => {
    try {
        const list = JSON.parse(window.sessionStorage.getItem(TOLD_KEY) || "[]");
        return new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
    } catch { return new Set(); }
};
const readKey = (key) => {
    try { return window.localStorage.getItem(key) || ""; } catch { return ""; }
};
// Before S12 one mark covered both kinds: the Chat starts from it.
const readSeen = () => ({ pedidos: readKey(SEEN_KEY.pedidos), chat: readKey(SEEN_KEY.chat) || readKey(SEEN_KEY.pedidos) });

export function usePedidos({ c, messages, open = {}, reachable = true, show, focus }) {
    const told = useRef(null);
    if (!told.current) told.current = readTold();
    const latest = useRef({ c, show, focus, reachable, open });
    latest.current = { c, show, focus, reachable, open };
    useEffect(() => {
        const fresh = freshMessages(messages, told.current);
        if (!fresh.length) return;
        for (const r of fresh) told.current.add(r.id);
        // Keep the list short: the ids of the last few hundred rows are enough.
        try { window.sessionStorage.setItem(TOLD_KEY, JSON.stringify([...told.current].slice(-300))); } catch { /* this window only */ }
        const { c: con, show: showTabs, focus: focusTab, reachable: canSee, open: isOpen } = latest.current;
        showTabs([...new Set(fresh.map(tabOf))]);
        const unread = fresh.filter((r) => !(canSee && isOpen[tabOf(r)]));
        if (!unread.length) return;
        const last = unread[unread.length - 1];
        const words = unread.length > 1 ? `${messageSay(last)} · e mais ${unread.length - 1}` : messageSay(last);
        if (canSee) con.say(words, { label: "Ver", run: () => focusTab(tabOf(last)) }, { important: true });
        else con.say(`${words} · veja em Ver › Painel`, null, { important: true });
    }, [messages]);

    const [seen, setSeen] = useState(readSeen);
    useEffect(() => {
        for (const id of Object.keys(TABS)) {
            if (!open[id]) continue;
            const newest = newestAt(TABS[id](messages));
            if (!newest || newest <= seen[id]) continue;
            setSeen((cur) => ({ ...cur, [id]: newest }));
            try { window.localStorage.setItem(SEEN_KEY[id], newest); } catch { /* the dot comes back after a reload */ }
        }
    }, [open.pedidos, open.chat, messages, seen]); // eslint-disable-line react-hooks/exhaustive-deps
    return {
        unread: {
            pedidos: !open.pedidos && hasUnread(pedidosOf(messages), seen.pedidos),
            chat: !open.chat && hasUnread(chatOf(messages), seen.chat),
        },
    };
}
