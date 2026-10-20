import { useCallback, useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { reportedDuration } from "./meterStore";
import { itemEnded, endActionOf, nextPlayable, shouldAdvance, hasSound, gapOf, countdownSay, newOnAir, AUTOPLAY_SAY } from "@/lib/console/autoplay";

// Setlist automática (owner 2026-10-20, Rodada N2; src/lib/console/autoplay.js):
// while the culto's switch is on (Service.autoplay) and an item of this
// Setlist is on air, the console checks every 250 ms whether it ended
// (itemEnded) and does what the item says (end_action): "next" counts the
// pause down on the next row and in a toast with Cancelar, then sends it as
// the console's own send (the operator's Prévia stays); "loop" sends the
// same item again; "stop" waits. Only the console runs it (never /Janela),
// like the letra automática; locked, it refuses and says so; with the
// projector window closed and something to hear, it stops with an amber
// note. Cancelled by Esc (escapeTarget "countdown"), the row's or the
// toast's Cancelar, anything sent meanwhile, and the switch going off.
// -> { pending: { kind: "count", nextId, until } | { kind: "paused", nextId, why } | null, cancel }
export function useSetlistAutoplay({ c, service, items, songs, prefs, projectorOpen, buildStage, sendStage }) {
    const [pending, setPending] = useState(null);
    const on = Boolean(service?.autoplay);
    const latest = useRef(null);
    latest.current = { c, service, items, songs, prefs, projectorOpen, buildStage, sendStage, pending };
    const songOf = (item) => (String(item?.type || "").toUpperCase() === "SONG" ? (latest.current.songs || []).find((s) => s.id === item.contentId) || null : null);

    const cancel = useCallback(() => {
        if (!latest.current.pending) return;
        setPending(null);
        latest.current.c.say(AUTOPLAY_SAY.cancel, null, { replace: true });
    }, []);

    // Sends an item as the console's own send, without taking the Prévia.
    const go = useCallback(async (item) => {
        const d = latest.current;
        try {
            const stage = await d.buildStage(item, d.items.indexOf(item));
            let why = null;
            const went = await d.sendStage(stage, { keepPrev: true, why: (b) => { why = b; } });
            if (!went && why) d.c.say(why.status === 423 ? AUTOPLAY_SAY.locked : why.message);
        } catch (err) { d.c.say(err?.message || "Não foi possível abrir o item."); }
    }, []);

    // May it move on now, from `item` to `next`? Says why not.
    const allowed = (item, next) => {
        const d = latest.current;
        const live = keryx.live.current() || d.c.cur;
        const check = shouldAdvance({ locked: Boolean(live?.locked), projectorOpen: d.projectorOpen, hasSound: hasSound(item, songOf(item)) || hasSound(next, songOf(next)) });
        if (check.ok) return true;
        d.c.say(AUTOPLAY_SAY[check.why]);
        if (check.why === "projector") setPending({ kind: "paused", nextId: next.id, why: "projector", since: keryx.live.now() });
        return false;
    };

    // The item on air ended: what it says it does.
    const ended = useCallback((item) => {
        const d = latest.current;
        const action = endActionOf(item, d.service);
        if (action === "stop") return;
        if (action === "loop") { if (allowed(item, item)) go(item); return; }
        const next = nextPlayable(d.items, item.id);
        if (!next) { d.c.say(AUTOPLAY_SAY.last); return; }
        if (!allowed(item, next)) return;
        const gap = gapOf(d.service, d.prefs);
        if (!gap) { go(next); return; }
        const said = countdownSay(next.title || "o próximo item", gap);
        const now = keryx.live.now();
        setPending({ kind: "count", nextId: next.id, fromId: item.id, until: now + gap * 1000, since: now, said });
        d.c.say(said, { label: "Cancelar", run: () => cancel() }, { ms: gap * 1000 });
    }, [go, cancel]); // eslint-disable-line react-hooks/exhaustive-deps

    // The watcher: one check per item sent (session.itemAt), so a refusal
    // is said once and a loop starts a new watch.
    const airItemId = c.cur?.session?.itemId || null;
    const watching = on && Boolean(airItemId) && items.some((x) => x.id === airItemId) && !pending;
    const handled = useRef(null);
    useEffect(() => {
        if (!watching) return undefined;
        const tick = () => {
            const live = keryx.live.current() || latest.current.c.cur;
            const s = live?.session;
            const item = s ? latest.current.items.find((x) => x.id === s.itemId) : null;
            if (!item) return;
            const key = `${item.id}@${s.itemAt}`;
            if (handled.current === key) return;
            if (!itemEnded({ live, item, now: keryx.live.now(), reported: reportedDuration, song: songOf(item) })) return;
            handled.current = key;
            ended(item);
        };
        tick();
        const id = setInterval(tick, 250);
        return () => clearInterval(id);
    }, [watching, ended]);

    // The countdown: at its end, checked again (locked meanwhile, the
    // projector closed), then the next one goes.
    useEffect(() => {
        if (pending?.kind !== "count") return undefined;
        const id = setTimeout(() => {
            const d = latest.current;
            const next = d.items.find((x) => x.id === pending.nextId);
            const from = d.items.find((x) => x.id === pending.fromId) || next;
            setPending(null);
            if (next && allowed(from, next)) go(next);
        }, Math.max(0, pending.until - keryx.live.now()));
        return () => clearTimeout(id);
    }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

    // Something else went on air (a send by hand, the phone, another
    // window), the switch went off, or the item left the Setlist: the wait ends.
    useEffect(() => {
        if (!pending) return;
        if (on && !newOnAir(c.cur, pending.since) && items.some((x) => x.id === pending.nextId)) return;
        setPending(null);
        if (pending.said) c.unsay?.(pending.said);
    }, [on, c.cur, items, pending]); // eslint-disable-line react-hooks/exhaustive-deps

    return { pending, cancel };
}
