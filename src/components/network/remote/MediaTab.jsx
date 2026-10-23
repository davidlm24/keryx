import React, { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { remoteCall } from "@/lib/console/remoteClient";
import { addToSetlistArgs, allowed, chipOf, emptyList, joinPage, libraryArgs, MEDIA_CHIPS, mediaRow, SEARCH_DEBOUNCE_MS, sendMediaArgs } from "@/lib/network/remoteView";
import { Cmd, Sheet } from "./parts";

// Mídia: the console's library a page at a time (`library`, pages of 30, the
// next one when the end of the list comes into view), by chip, with a search
// that waits for the typing to stop; an answer that comes after the search
// changed is dropped. Pick, then the footer's "Enviar ao ar · título"; a video
// asks where it plays (the projector or the video screens). The chips and
// the search stay put and only the list scrolls (Rodada Q); "+ Setlist"
// beside Enviar adds the row at the end of the culto's Setlist (`setlist.add`,
// a console with the `plan` cap; avisos never).
export default function MediaTab({ caps, c, setGate }) {
    const [chip, setChip] = useState("songs");
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const key = `${chip}|${query}`;
    const [list, setList] = useState(() => emptyList(key));
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState("");
    const [pick, setPick] = useState(null);
    const [where, setWhere] = useState(false);
    const keyRef = useRef(key);
    const asking = useRef(false);
    const sentinel = useRef(null);
    const scroller = useRef(null);
    keyRef.current = key;

    useEffect(() => {
        const t = setTimeout(() => setQuery(q.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [q]);

    // One page at a time; what comes back for another chip or search is dropped.
    const more = useCallback(async (from) => {
        if (asking.current) return;
        asking.current = true;
        setLoading(true);
        const asked = keyRef.current;
        const [askedChip, askedQ] = [asked.slice(0, asked.indexOf("|")), asked.slice(asked.indexOf("|") + 1)];
        const r = await remoteCall("library", libraryArgs(askedChip, askedQ, from.rows.length));
        asking.current = false;
        if (keyRef.current !== asked) return;
        setLoading(false);
        if (r.off || r.closed) return setGate(r.off ? "off" : "closed");
        if (!r.ok) return setFailed(r.message);
        setFailed("");
        setList((cur) => joinPage(cur, asked, r.result));
    }, [setGate]);

    useEffect(() => {
        const fresh = emptyList(key);
        setList(fresh);
        setPick(null);
        setFailed("");
        asking.current = false;
        more(fresh);
    }, [key, more]);

    // The next page when the end of the list is near.
    useEffect(() => {
        const el = sentinel.current;
        if (!el || list.done || failed) return undefined;
        const io = new IntersectionObserver((seen) => { if (seen.some((e) => e.isIntersecting)) more(list); }, { root: scroller.current, rootMargin: "240px" });
        io.observe(el);
        return () => io.disconnect();
    }, [list, failed, more]);

    const rows = list.rows.map(mediaRow);
    const picked = rows.find((r) => r.id === pick) || null;
    const meta = chipOf(chip);
    const canPick = allowed("sendMedia", { kind: meta.send, id: "x" }, c.flags);
    // + Setlist never touches the air: a row can be picked for it while locked.
    const canPlan = caps.has("plan") && Boolean(addToSetlistArgs(chip, "x"));
    const done = () => { setPick(null); setWhere(false); };
    const plan = picked && caps.has("plan") ? addToSetlistArgs(chip, picked.id) : null;
    // A new chip or search starts the list from the top.
    useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [key]);

    return (
        <div className="rm-main is-split">
            <div className="rm-fix">
                <div className="rm-chips" role="group" aria-label="Tipo">
                    {MEDIA_CHIPS.map((m) => <button key={m.key} type="button" className="rm-chip" aria-pressed={chip === m.key} onClick={() => setChip(m.key)}>{m.label}</button>)}
                </div>
                <label className="rm-field">
                    <Icon name="search" size={20} />
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar em ${meta.label}`} aria-label={`Buscar em ${meta.label}`} maxLength={40} autoCapitalize="none" autoCorrect="off" enterKeyHint="search" />
                </label>
            </div>
            <div className="rm-scroll" ref={scroller}>
                <ul className="rm-list" role="list" aria-busy={loading || undefined}>
                    {rows.map((r) => (
                        <li key={r.id}>
                            <button type="button" className={`rm-item ${r.id === pick ? "is-sel" : ""}`} aria-pressed={r.id === pick} disabled={(!canPick && !canPlan) || Boolean(r.st)} onClick={() => setPick(r.id === pick ? null : r.id)}>
                                {r.thumb ? <img className="rm-thumb" src={r.thumb} alt="" loading="lazy" /> : <Icon name={meta.icon} size={18} />}
                                <span className="rm-item-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                                {r.st && <span className="rm-tag is-warn">{r.stText}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
                {failed && (
                    <div className="rm-empty">
                        <p>{failed}</p>
                        <button type="button" className="rm-b is-sm" onClick={() => more(list)}><Icon name="refresh" size={18} />Tentar de novo</button>
                    </div>
                )}
                {!failed && !loading && list.done && !rows.length && (
                    <p className="rm-empty">{!list.ready ? "A biblioteca ainda está abrindo no computador." : query ? `Nada com "${query}" em ${meta.label}.` : `Nada em ${meta.label}.`}</p>
                )}
                {loading && <p className="rm-hint">Carregando…</p>}
                {!list.done && !failed && <div ref={sentinel} className="rm-sentinel" aria-hidden="true" />}
            </div>
            <div className="rm-foot">
                {picked
                    ? (
                        <div className="rm-sendrow">
                            {chip === "video"
                                ? <button type="button" className="rm-b is-go" disabled={!canPick} onClick={() => setWhere(true)}>Enviar ao ar · {picked.title}</button>
                                : <Cmd c={c} k="sendMedia" action="sendMedia" args={sendMediaArgs(chip, picked.id)} className="is-go" then={done}>Enviar ao ar · {picked.title}</Cmd>}
                            {plan && <Cmd c={c} k="setlistAdd" action="setlist.add" args={plan} className="is-plan" label={`Adicionar ${picked.title} à setlist`}><Icon name="plus" size={18} />Setlist</Cmd>}
                        </div>
                    )
                    : <p className="rm-hint">Toque num item para escolher.</p>}
            </div>
            {where && picked && (
                <Sheet title="Onde passa o vídeo?" onClose={() => setWhere(false)}>
                    <p className="rm-hint is-left">{picked.title}</p>
                    <div className="rm-pair">
                        <Cmd c={c} k="sendMedia" action="sendMedia" args={sendMediaArgs(chip, picked.id, false)} className="is-go" then={done}><Icon name="projector" size={20} />No projetor</Cmd>
                        <Cmd c={c} k="sendMedia" action="sendMedia" args={sendMediaArgs(chip, picked.id, true)} then={done}><Icon name="tv" size={20} />Nas telas de vídeo</Cmd>
                    </div>
                    <button type="button" className="rm-b is-sm" onClick={() => setWhere(false)}>Cancelar</button>
                </Sheet>
            )}
        </div>
    );
}
