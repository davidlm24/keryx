import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { remoteCall } from "@/lib/console/remoteClient";
import { keryx } from "@/api/keryxClient";
import {
    capsOf, chatArgs, cleanName, emptyList, hasChords, hasUnseen, joinPage, libraryArgs, lyricParts, mediaRow, messageRows, NAME_KEY, newestAt,
    PEDIDO_LIMITS, pedidoArgs, PICK_CHIPS, chipOf, requestsEvery, SEARCH_DEBOUNCE_MS, SEEN_KEY, songSub, tabsFor, TAG_TEXT, teamSetlistRows, teamStrip,
} from "@/lib/network/remoteView";
import { Sheet, Toast } from "./parts";
import { SWAP_TO } from "@/lib/network/remoteView";

const BibleTab = lazy(() => import("./BibleTab"));

// The Equipe (Rodada Q PR4; the owner's mockup, S8 = A): the same /Remote
// page signed in with the Equipe's code (state.role "team"). Four tabs —
// Pedidos, Músicas, Bíblia, Setlist — and a thin strip on top with what is
// on air, "só leitura". It talks to the musicians' side of the console only
// (chat.send, request.send, requests, songText, the library's songs and the
// Mídia's videos and audios to pick a pedido's louvor (S15), bibleFind,
// state): no button here ever runs an action that puts on or takes off the
// air or changes the Setlist (lan.cjs would answer 403 anyway, and its
// message is what the toast shows). Everything that came from a phone is
// drawn as plain text.
export default function EquipeView({ live, state, stale, cmd }) {
    const [tab, setTab] = useState("pedidos");
    const [name, setName] = useStoredName();
    const [asking, setAsking] = useState(null);
    const [pedido, setPedido] = useState(null);
    const [sent, setSent] = useState(0);
    const tabs = tabsFor(state);
    const shown = tabs.some(([k]) => k === tab) ? tab : tabs[0]?.[0] || "setlist";
    const caps = useMemo(() => capsOf(state), [state]);
    const strip = teamStrip(live, { stale });
    const service = state?.service?.title || "";
    // Pedidos | Chat inside the Pedidos tab (S12), each kind asked on its own
    // (useRequests), each with its gold dot until seen, the tab's dot for both.
    const [view, setView] = useState("pedido");
    const talks = caps.has("requests");
    const reqs = useRequests({ on: talks, chatOpen: shown === "pedidos" && view === "chat", sent });
    const [seen, markSeen] = useSeen();
    const reading = shown === "pedidos" ? view : null;
    const newest = newestAt(reqs.pages[reading]?.rows || []);
    useEffect(() => { if (reading && newest) markSeen(reading, newest); }, [reading, newest, markSeen]);
    const unseen = {
        pedido: reading !== "pedido" && hasUnseen(reqs.pages.pedido?.rows || [], seen.pedido, name),
        chat: reading !== "chat" && hasUnseen(reqs.pages.chat?.rows || [], seen.chat, name),
    };

    // The name is asked once, before the first send, and kept on the phone.
    const withName = (then) => (name ? then(name) : setAsking(() => then));
    const send = useCallback(async (action, args, said) => {
        const r = await cmd.run(action, action, args, { quiet: true });
        if (r?.ok) { cmd.say(said); setSent((n) => n + 1); }
        return r;
    }, [cmd]);
    const askSong = (song) => withName(() => setPedido(song || {}));

    return (
        <div className="net rm is-team">
            <div className={`rm-strip is-${strip.tone}`}>
                <span className="rm-dot" aria-hidden="true" />
                <b aria-live="polite">{strip.text}</b>
                <span>{strip.pos}</span>
                {/* To the Controle (owner 2026-10-30, C = A): its own code, never this one's. */}
                <a className="rm-swap" href={SWAP_TO.control} title="Entrar como Controle: pede o código do controle">Controle…</a>
            </div>
            <div className="rm-body">
                <div className="rm-pane">
                    {shown === "pedidos" && (
                        <PedidosTab service={service} name={name} busy={cmd.busy} view={view} setView={setView} pages={reqs.pages} failed={reqs.failed} unseen={unseen}
                            onName={() => setAsking(() => () => {})}
                            onPedido={() => askSong(null)}
                            onChat={(fields) => new Promise((done) => withName((from) => {
                                const args = chatOrSay(cmd, { ...fields, from });
                                if (!args) return done(null);
                                return send("chat.send", args, "Mensagem enviada.").then(done);
                            }))} />
                    )}
                    {shown === "songs" && <SongsTab onAsk={askSong} />}
                    <Suspense fallback={<div className="rm-main" aria-busy="true" />}>
                        {shown === "bible" && <BibleTab state={state} caps={caps} c={{ busy: cmd.busy, run: cmd.run, flags: { stale, locked: false } }} readOnly />}
                    </Suspense>
                    {shown === "setlist" && <TeamSetlist state={state} service={service} onAsk={askSong} />}
                </div>
                <nav className="rm-tabs" role="tablist" aria-label="Seções da equipe">
                    {tabs.map(([k, label, icon]) => (
                        <button type="button" key={k} role="tab" aria-selected={shown === k} className="rm-tab" onClick={() => setTab(k)}>
                            <Icon name={icon} size={22} />{label}
                            {k === "pedidos" && (unseen.pedido || unseen.chat) && <span className="rm-new is-tab"><span className="rm-sr">· novas</span></span>}
                        </button>
                    ))}
                </nav>
            </div>
            <Toast toast={cmd.toast} onClose={cmd.closeToast} canUndo={false} />
            {asking && <NameSheet name={name} onClose={() => setAsking(null)} onSave={(n) => { setName(n); const then = asking; setAsking(null); then(n); }} />}
            {pedido && (
                <PedidoSheet initial={pedido} name={name} busy={cmd.busy.has("request.send")} onClose={() => setPedido(null)}
                    onSend={async (args) => { const r = await send("request.send", args, "Pedido enviado ao operador."); if (r?.ok) setPedido(null); return r; }} />
            )}
        </div>
    );
}

// chat.send's args, or a word in the toast when the composer is not right
// yet (no text, a link that is not YouTube's); null = nothing is sent.
function chatOrSay(cmd, fields) {
    const v = chatArgs(fields);
    if (v.error) { cmd.say(v.message, { bad: true }); return null; }
    return v.args;
}

function useStoredName() {
    const [name, setName] = useState(() => { try { return cleanName(localStorage.getItem(NAME_KEY)); } catch { return ""; } });
    const save = (value) => {
        const n = cleanName(value);
        setName(n);
        try { localStorage.setItem(NAME_KEY, n); } catch { /* a private window: kept until the page closes */ }
    };
    return [name, save];
}

function NameSheet({ name, onSave, onClose }) {
    const [value, setValue] = useState(name || "");
    const ok = cleanName(value);
    return (
        <Sheet title="Seu nome" onClose={onClose}>
            <p className="rm-hint is-left">O operador vê quem mandou cada mensagem e cada pedido. Fica guardado neste celular.</p>
            <label className="rm-f">
                <span>Nome</span>
                <input className="rm-in" value={value} onChange={(e) => setValue(e.target.value)} maxLength={PEDIDO_LIMITS.from} autoComplete="name" enterKeyHint="done" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" && ok) onSave(ok); }} />
            </label>
            <button type="button" className="rm-b is-go is-wide" disabled={!ok} onClick={() => onSave(ok)}>Salvar</button>
            <button type="button" className="rm-b is-sm" onClick={onClose}>Cancelar</button>
        </Sheet>
    );
}

// ---- Pedidos: the culto's song requests and chat ---------------------------

// The newest page of `requests` of each kind (S12: Pedidos and Chat apart),
// asked at once, right after this phone sends (`sent`) and the moment a
// message reaches the event stream (owner 2026-10-30: the operator's words
// took up to 5 s, the phone's arrived at once — lan.cjs already sends an
// Equipe phone every ServiceMessage change); every 15 s — the chat every
// 5 s while it is open — only as the fallback. Only while visible.
function useRequests({ on, chatOpen, sent }) {
    const [pages, setPages] = useState({ pedido: null, chat: null });
    const [failed, setFailed] = useState({ pedido: "", chat: "" });
    // Each kind's answers in the order asked: a poll that left before a
    // message and returns after the read the message triggered must not put
    // the older page back.
    const asked = useRef({ pedido: 0, chat: 0 });
    const shown = useRef({ pedido: 0, chat: 0 });
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const load = useCallback(async (kind) => {
        const n = ++asked.current[kind];
        const r = await remoteCall("requests", { kind });
        if (!alive.current || n < shown.current[kind]) return;
        if (r.ok && r.result) {
            shown.current[kind] = n;
            setPages((cur) => ({ ...cur, [kind]: r.result }));
            setFailed((cur) => ({ ...cur, [kind]: "" }));
        } else if (!r.ok && !r.signedOut) setFailed((cur) => ({ ...cur, [kind]: r.message || "" }));
    }, []);
    useEffect(() => { if (on) { load("pedido"); load("chat"); } }, [on, load, sent]);
    useEffect(() => {
        if (!on) return undefined;
        let wait = null;
        // A burst (a pedido marked done, then a chat line) is one read.
        const off = keryx.entities.ServiceMessage.subscribe(() => {
            clearTimeout(wait);
            wait = setTimeout(() => { load("pedido"); load("chat"); }, 150);
        });
        return () => { clearTimeout(wait); off?.(); };
    }, [on, load]);
    usePoll(on, () => load("pedido"), requestsEvery("pedido", chatOpen));
    usePoll(on, () => load("chat"), requestsEvery("chat", chatOpen));
    return { pages, failed };
}
function usePoll(on, run, every) {
    const latest = useRef(run);
    latest.current = run;
    useEffect(() => {
        if (!on) return undefined;
        const tick = () => { if (document.visibilityState === "visible") latest.current(); };
        const id = setInterval(tick, every);
        document.addEventListener("visibilitychange", tick);
        return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
    }, [on, every]);
}

// The last row seen of each kind, kept on the phone ({ pedido, chat }, ISO).
function useSeen() {
    const [seen, setSeen] = useState(() => {
        try {
            const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
            return { pedido: String(v?.pedido || ""), chat: String(v?.chat || "") };
        } catch { return { pedido: "", chat: "" }; }
    });
    const mark = useCallback((kind, at) => setSeen((cur) => {
        if (!at || at <= cur[kind]) return cur;
        const next = { ...cur, [kind]: at };
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* a private window: the dot comes back on reload */ }
        return next;
    }), []);
    return [seen, mark];
}

// Pedidos | Chat (the owner's mockup "PhoneEquipeChat", S12): the pedidos
// as cards with "Pedir um louvor" at the foot, or the chat both ways with
// the operator's answers ("Operador") and the composer; each list keeps to
// its bottom (the newest) unless it was scrolled up.
function PedidosTab({ service, name, busy, view, setView, pages, failed, unseen, onName, onPedido, onChat }) {
    const [text, setText] = useState("");
    const [link, setLink] = useState("");
    const [linkOpen, setLinkOpen] = useState(false);
    const scroller = useRef(null);
    const pinned = useRef(true);
    const page = pages[view];
    const error = failed[view];
    const rows = messageRows(page?.rows || [], name);
    const last = rows[rows.length - 1]?.id || "";
    useEffect(() => { pinned.current = true; }, [view]);
    useEffect(() => {
        const el = scroller.current;
        if (el && pinned.current) el.scrollTop = el.scrollHeight;
    }, [last, view]);
    const sendChat = async () => {
        const r = await onChat({ text, link: linkOpen ? link : "" });
        if (r?.ok) { setText(""); setLink(""); setLinkOpen(false); pinned.current = true; }
    };
    const seg = (k, label) => (
        <button type="button" aria-pressed={view === k} onClick={() => setView(k)}>
            {label}{unseen[k] && <span className="rm-new"><span className="rm-sr">· novas</span></span>}
        </button>
    );
    const chat = view === "chat";
    return (
        <div className="rm-main is-split">
            <div className="rm-env">
                <b>Equipe</b>
                <button type="button" className="rm-env-me" onClick={onName}>
                    {[service, name ? `você é ${name}` : "dizer seu nome"].filter(Boolean).join(" · ")}
                </button>
            </div>
            <div className="rm-seg" role="group" aria-label="Pedidos ou chat">{seg("pedido", "Pedidos")}{seg("chat", "Chat")}</div>
            <div className="rm-scroll rm-chat" ref={scroller} role="log" aria-label={chat ? "Chat com o operador" : "Pedidos de louvor"}
                onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
                {error && <p className="rm-empty">{error}</p>}
                {!error && page && !rows.length && <p className="rm-empty">{chat ? "Nenhuma mensagem neste culto ainda. O que você escrever aqui aparece no console do operador, e a resposta aparece aqui." : "Nenhum pedido neste culto ainda."}</p>}
                {!page && !error && <p className="rm-hint">Carregando…</p>}
                {page && page.total > rows.length && <p className="rm-hint">{chat ? "As mensagens mais antigas ficam no computador." : "Os pedidos mais antigos ficam no computador."}</p>}
                {rows.map((m) => <Message key={m.id} m={m} />)}
            </div>
            {!chat
                ? <div className="rm-foot"><button type="button" className="rm-b is-go is-wide" onClick={onPedido}><Icon name="music" size={18} />Pedir um louvor</button></div>
                : (
                    <div className="rm-foot rm-compose">
                        {linkOpen && (
                            <label className="rm-field">
                                <Icon name="youtube" size={20} />
                                <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link do YouTube (youtu.be/…)" aria-label="Link do YouTube" maxLength={PEDIDO_LIMITS.link} autoCapitalize="none" autoCorrect="off" inputMode="url" />
                            </label>
                        )}
                        <div className="rm-cbar">
                            <button type="button" className="rm-round" aria-pressed={linkOpen} aria-label="Link do YouTube" onClick={() => setLinkOpen((v) => !v)}><Icon name="link" size={20} /></button>
                            <input className="rm-cin" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem…" aria-label="Mensagem para o operador" maxLength={PEDIDO_LIMITS.text} enterKeyHint="send"
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} />
                            <button type="button" className={`rm-round is-go ${busy.has("chat.send") ? "is-busy" : ""}`} aria-label="Enviar" disabled={!text.trim() && !(linkOpen && link.trim())} onClick={sendChat}><Icon name="send" size={20} /></button>
                        </div>
                    </div>
                )}
        </div>
    );
}

// One message: a chat bubble (mine on the right; the operator's on the left
// in gold) or a song request's card ("Anotado pelo operador" with its badge).
function Message({ m }) {
    const side = [m.mine && "is-mine", m.operator && "is-op"].filter(Boolean).join(" ");
    if (m.kind === "pedido") {
        return (
            <div className={`rm-msg rm-ped ${side}`}>
                <span className="rm-msg-h">{m.by}{m.at ? ` · ${m.at}` : ""}{m.operator && <span className="rm-badge">operador</span>}</span>
                <span className="rm-msg-t">
                    <span className="rm-ped-w"><Icon name={m.icon} size={16} />{m.singer ? <><b>{m.singer}</b> canta <b>{m.song}</b></> : <b>{m.song}</b>}</span>
                    {m.text && <span className="rm-ped-n">{m.text}</span>}
                    {m.link && <YouTubeLink m={m} />}
                    {m.status && <span className={`rm-ped-s ${m.done ? "is-done" : ""}`}>{m.status}</span>}
                </span>
            </div>
        );
    }
    return (
        <div className={`rm-msg ${side}`}>
            <span className="rm-msg-h">{m.head}</span>
            <span className="rm-msg-t">
                {m.link && <YouTubeLink m={m} />}
                {!(m.link && m.text === "Vídeo do YouTube") && <span>{m.text}</span>}
            </span>
        </div>
    );
}
function YouTubeLink({ m }) {
    const [cover, setCover] = useState(true);
    return (
        <a className="rm-yt" href={m.link} target="_blank" rel="noreferrer noopener">
            {m.cover && cover && <img src={m.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setCover(false)} />}
            <span><b>Vídeo do YouTube</b><small>{m.link.replace(/^https:\/\/www\./, "")}</small></span>
        </a>
    );
}

// The pedido: who sings, the song (typed or from the library: Letras ·
// Vídeos · Áudios, S15 = A), a YouTube link and a note; signed with the
// phone's name.
function PedidoSheet({ initial, name, busy, onSend, onClose }) {
    const [singer, setSinger] = useState("");
    const [song, setSong] = useState(initial.song || "");
    const [songId, setSongId] = useState(initial.songId || "");
    const [mediaId, setMediaId] = useState(initial.mediaId || "");
    const [chip, setChip] = useState(initial.chip || "songs");
    const [pickedChip, setPickedChip] = useState(initial.chip || "songs");
    const [link, setLink] = useState("");
    const [note, setNote] = useState("");
    const [picking, setPicking] = useState(false);
    const [error, setError] = useState(null);
    const go = async () => {
        const v = pedidoArgs({ from: name, singer, song, songId, mediaId, note, link });
        if (v.error) return setError(v);
        setError(null);
        await onSend(v.args);
    };
    if (picking) {
        return (
            <Sheet title="Escolher da biblioteca" onClose={() => setPicking(false)}>
                <div className="rm-seg is-sheet" role="group" aria-label="Da biblioteca">
                    {PICK_CHIPS.map((c) => <button type="button" key={c.key} aria-pressed={chip === c.key} onClick={() => setChip(c.key)}><Icon name={c.icon} size={16} />{c.label}</button>)}
                </div>
                <SongList key={chip} chip={chip} compact onPick={(r) => {
                    setSong(r.title.slice(0, PEDIDO_LIMITS.song));
                    setSongId(chip === "songs" ? r.id : "");
                    setMediaId(chip === "songs" ? "" : r.id);
                    setPickedChip(chip);
                    setPicking(false);
                }} />
                <button type="button" className="rm-b is-sm" onClick={() => setPicking(false)}>Voltar</button>
            </Sheet>
        );
    }
    return (
        <Sheet title="Pedido de louvor" onClose={onClose}>
            <label className="rm-f">
                <span>Quem canta</span>
                <input className="rm-in" value={singer} onChange={(e) => setSinger(e.target.value)} maxLength={PEDIDO_LIMITS.singer} autoComplete="off" />
            </label>
            <div className="rm-f">
                <label htmlFor="rm-ped-song">O louvor</label>
                {songId || mediaId
                    ? (
                        <div className="rm-picked">
                            <Icon name={chipOf(pickedChip).icon} size={16} /><b>{song}</b><small>{{ songs: "da biblioteca", video: "vídeo da biblioteca", audio: "áudio da biblioteca" }[pickedChip]}</small>
                            <button type="button" className="rm-picked-x" aria-label="Escrever outro" onClick={() => { setSongId(""); setMediaId(""); setSong(""); }}><Icon name="x" size={16} /></button>
                        </div>
                    )
                    : <input id="rm-ped-song" className={`rm-in ${error?.error === "song" ? "is-bad" : ""}`} value={song} onChange={(e) => setSong(e.target.value)} maxLength={PEDIDO_LIMITS.song} autoComplete="off" />}
                <button type="button" className="rm-lib" onClick={() => setPicking(true)}><Icon name="search" size={15} />Escolher da biblioteca · ou escreva o nome</button>
            </div>
            <label className="rm-f">
                <span>Link do YouTube (opcional)</span>
                <input type="url" className={`rm-in ${error?.error === "link" ? "is-bad" : ""}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="youtu.be/… · para o operador ver ou tocar" maxLength={PEDIDO_LIMITS.link} autoCapitalize="none" autoCorrect="off" inputMode="url" />
            </label>
            <label className="rm-f">
                <span>Observação (opcional)</span>
                <input className="rm-in" value={note} onChange={(e) => setNote(e.target.value)} maxLength={PEDIDO_LIMITS.note} autoComplete="off" />
            </label>
            {error && <p className="rm-err" role="alert">{error.message}</p>}
            <p className="rm-hint">Vai assinado como {name}. O operador vê no console e pode pôr na prévia ou na setlist.</p>
            <button type="button" className={`rm-b is-go is-wide ${busy ? "is-busy" : ""}`} aria-busy={busy || undefined} onClick={go}>Enviar pedido</button>
        </Sheet>
    );
}

// ---- Músicas: the library's songs, a song's lyrics ---------------------------

// The library's songs a page at a time (`library` tab songs; or the Mídia's
// videos or audios, chip video | audio, S15), searched as typed; an answer
// for an older search is dropped.
function useSongs(query, chip = "songs") {
    const [list, setList] = useState(() => emptyList(query));
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState("");
    const keyRef = useRef(query);
    const asking = useRef(false);
    keyRef.current = query;
    const more = useCallback(async (from) => {
        if (asking.current) return;
        asking.current = true;
        setLoading(true);
        const asked = keyRef.current;
        const r = await remoteCall("library", libraryArgs(chip, asked, from.rows.length));
        asking.current = false;
        if (keyRef.current !== asked) return;
        setLoading(false);
        if (!r.ok) return setFailed(r.message || "");
        setFailed("");
        setList((cur) => joinPage(cur, asked, r.result));
    }, [chip]);
    useEffect(() => {
        const fresh = emptyList(query);
        setList(fresh);
        asking.current = false;
        more(fresh);
    }, [query, more]);
    return { list, loading, failed, more };
}

const FIND = { songs: ["Buscar música", "Nenhuma música", "música"], video: ["Buscar vídeo", "Nenhum vídeo", "vídeo"], audio: ["Buscar áudio", "Nenhum áudio", "áudio"] };
function SongList({ onPick, compact = false, chip = "songs", head = null }) {
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setQuery(q.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [q]);
    const { list, loading, failed, more } = useSongs(query, chip);
    const [placeholder, none] = FIND[chip] || FIND.songs;
    const icon = chipOf(chip).icon;
    const sentinel = useRef(null);
    const scroller = useRef(null);
    useEffect(() => {
        const el = sentinel.current;
        if (!el || list.done || failed) return undefined;
        const io = new IntersectionObserver((seen) => { if (seen.some((e) => e.isIntersecting)) more(list); }, { root: compact ? null : scroller.current, rootMargin: "240px" });
        io.observe(el);
        return () => io.disconnect();
    }, [list, failed, more, compact]);
    const rows = list.rows.map(mediaRow);
    const field = (
        <label className="rm-field">
            <Icon name="search" size={20} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={40} autoCapitalize="none" autoCorrect="off" enterKeyHint="search" />
        </label>
    );
    const body = (
        <>
            <ul className="rm-list" role="list" aria-busy={loading || undefined}>
                {rows.map((r) => (
                    <li key={r.id}>
                        <button type="button" className="rm-item" onClick={() => onPick(r)}>
                            {r.thumb ? <img className="rm-thumb" src={r.thumb} alt="" loading="lazy" /> : <Icon name={icon} size={18} />}
                            <span className="rm-item-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                            {!compact && <Icon name="chevron-right" size={18} />}
                        </button>
                    </li>
                ))}
            </ul>
            {failed && <p className="rm-empty">{failed}</p>}
            {!failed && !loading && list.done && !rows.length && <p className="rm-empty">{!list.ready ? "A biblioteca ainda está abrindo no computador." : query ? `${none} com "${query}".` : `${none} na biblioteca.`}</p>}
            {loading && <p className="rm-hint">Carregando…</p>}
            {!list.done && !failed && <div ref={sentinel} className="rm-sentinel" aria-hidden="true" />}
        </>
    );
    if (compact) return <>{field}{body}</>;
    return (
        <div className="rm-main is-split">
            <div className="rm-fix">{head}{field}</div>
            <div className="rm-scroll" ref={scroller}>{body}</div>
        </div>
    );
}

// Músicas: the songs' lyrics, and the Mídia's videos and audios (owner
// 2026-10-28, M6: the same Letras · Vídeos · Áudios as the pedido's picker).
// A song opens its lyrics, a video or an audio what it is; both end in
// "Pedir este louvor" — the Equipe never plays or sends anything.
function SongsTab({ onAsk }) {
    const [chip, setChip] = useState("songs");
    const [open, setOpen] = useState(null);
    if (open?.media) return <MediaView row={open} chip={chip} onBack={() => setOpen(null)} onAsk={onAsk} />;
    if (open) return <SongView song={open} back="Músicas" onBack={() => setOpen(null)} onAsk={onAsk} />;
    const chips = (
        <div className="rm-chips" role="group" aria-label="Da biblioteca">
            {PICK_CHIPS.map((c) => <button type="button" key={c.key} className="rm-chip" aria-pressed={chip === c.key} onClick={() => setChip(c.key)}><Icon name={c.icon} size={16} />{c.label}</button>)}
        </div>
    );
    return <SongList key={chip} chip={chip} head={chips} onPick={(r) => setOpen(chip === "songs" ? { id: r.id, title: r.title } : { ...r, media: true })} />;
}

// A video or an audio of the Mídia (M6): its still, what it is and how long,
// and "Pedir este louvor" with it chosen (the pedido carries its mediaId).
function MediaView({ row, chip, onBack, onAsk }) {
    return (
        <div className="rm-main is-split">
            <div className="rm-fix rm-songtop">
                <button type="button" className="rm-back" onClick={onBack}><Icon name="chevron-left" size={18} />{chip === "video" ? "Vídeos" : "Áudios"}</button>
            </div>
            <div className="rm-scroll">
                <div className="rm-poster">{row.thumb ? <img src={row.thumb} alt="" /> : <Icon name={chipOf(chip).icon} size={32} />}</div>
                <div className="rm-songttl"><b>{row.title}</b>{row.sub && <span>{row.sub}</span>}</div>
                <p className="rm-note">A equipe não põe no ar. O pedido vai para o operador, com {chip === "video" ? "o vídeo" : "o áudio"} já escolhido.</p>
            </div>
            <div className="rm-foot">
                <button type="button" className="rm-b is-go is-wide" onClick={() => onAsk({ song: row.title.slice(0, PEDIDO_LIMITS.song), mediaId: row.id, chip })}><Icon name="chat" size={18} />Pedir este louvor</button>
            </div>
        </div>
    );
}

// A song's lyrics (songText): its parts in the order sung, Cifra (the
// chords over each line) when it has any, a bigger text, "Pedir este
// louvor" at the foot.
function SongView({ song, back, onBack, onAsk }) {
    const [text, setText] = useState(null);
    const [failed, setFailed] = useState("");
    const [chords, setChords] = useState(false);
    const [big, setBig] = useState(false);
    useEffect(() => {
        let gone = false;
        remoteCall("songText", { id: song.id }).then((r) => {
            if (gone) return;
            if (r.ok && r.result) setText(r.result); else setFailed(r.message || "Não achei essa música.");
        });
        return () => { gone = true; };
    }, [song.id]);
    const parts = lyricParts(text, { chords });
    const title = text?.title || song.title;
    return (
        <div className="rm-main is-split">
            <div className="rm-fix rm-songtop">
                <button type="button" className="rm-back" onClick={onBack}><Icon name="chevron-left" size={18} />{back}</button>
                <span className="rm-songtools">
                    {hasChords(text) && <button type="button" className="rm-chip is-sm" aria-pressed={chords} onClick={() => setChords((v) => !v)}>Cifra</button>}
                    <button type="button" className="rm-chip is-sm" aria-pressed={big} onClick={() => setBig((v) => !v)} aria-label="Letra maior">A+</button>
                </span>
            </div>
            <div className={`rm-scroll rm-lyrics ${big ? "is-big" : ""}`}>
                <div className="rm-songttl"><b>{title}</b>{text && songSub(text) && <span>{songSub(text)}</span>}</div>
                {!text && !failed && <p className="rm-hint">Carregando a letra…</p>}
                {failed && <p className="rm-empty">{failed}</p>}
                {text && !parts.length && <p className="rm-empty">Esta música não tem letra.</p>}
                {parts.map((p, i) => (
                    <section key={i} className="rm-part" aria-label={p.name || undefined}>
                        {p.name && <h3>{p.name}</h3>}
                        {p.lines.map((l, k) => <p key={k}>{l.chords && <span className="rm-ch">{l.chords}</span>}{l.text}</p>)}
                    </section>
                ))}
                {text?.truncated && <p className="rm-hint">A letra continua no computador.</p>}
            </div>
            <div className="rm-foot">
                <button type="button" className="rm-b is-go is-wide" onClick={() => onAsk({ song: title.slice(0, PEDIDO_LIMITS.song), songId: song.id })}><Icon name="chat" size={18} />Pedir este louvor</button>
            </div>
        </div>
    );
}

// ---- Setlist: the order of the culto, to read -------------------------------

function TeamSetlist({ state, service, onAsk }) {
    const [open, setOpen] = useState(null);
    const rows = teamSetlistRows(state);
    const list = useRef(null);
    const airId = state?.airItemId || null;
    useEffect(() => {
        if (!airId || open) return;
        list.current?.querySelector(`[data-id="${CSS.escape(airId)}"]`)?.scrollIntoView({ block: "center" });
    }, [airId, open]);
    if (open) return <SongView song={open} back="Setlist" onBack={() => setOpen(null)} onAsk={onAsk} />;
    if (!state) return <div className="rm-main"><p className="rm-empty">Lendo a setlist…</p></div>;
    if (!rows.length) return <div className="rm-main"><p className="rm-empty">{service ? `${service}: nenhum item na setlist.` : "Nenhum culto escolhido no console."}</p></div>;
    return (
        <div className="rm-main is-split">
            <div className="rm-scroll" ref={list}>
                <h2 className="rm-sec is-top">{[service, "a ordem do culto"].filter(Boolean).join(" · ")}</h2>
                <ul className="rm-list" role="list">
                    {rows.map((r) => {
                        if (r.section) return <li key={r.id} className="rm-sec">{r.title}</li>;
                        const inner = (
                            <>
                                <Icon name={r.icon} size={18} />
                                <span className="rm-item-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                                {r.singer && <span className="rm-who" title={`Pedido de ${r.singer}`}><Icon name="user" size={13} /><span>{r.singer}</span></span>}
                                {r.tag && <span className={`rm-tag is-${r.tag}`}>{TAG_TEXT[r.tag]}</span>}
                                {r.songId && <Icon name="chevron-right" size={18} />}
                            </>
                        );
                        return (
                            <li key={r.id}>
                                {r.songId
                                    ? <button type="button" data-id={r.id} className={`rm-item ${r.tag === "air" ? "is-air" : ""}`} onClick={() => setOpen({ id: r.songId, title: r.title })}>{inner}</button>
                                    : <div data-id={r.id} className={`rm-item is-read ${r.tag === "air" ? "is-air" : ""}`}>{inner}</div>}
                            </li>
                        );
                    })}
                </ul>
                {state.truncated && <p className="rm-hint">A setlist continua no computador.</p>}
            </div>
            <p className="rm-foot rm-hint">Toque numa música para ver a letra. Só o operador muda a ordem.</p>
        </div>
    );
}
