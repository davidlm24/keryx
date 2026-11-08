import React, { useState } from "react";
import Icon from "./Icon";
import { Btn, Empty } from "./kx";
import { chatOf, chatHead, isOperator, operatorChat, PEDIDO_MAX } from "@/lib/console/pedidos";
import { usePinnedList, useMessageTools, TrashBtn, YouTubeCard } from "./PedidosTab";

// The Chat tab of the panel beside the Prévia (Rodada Q; S12 = B, the
// owner's mockup "Pedidos x chat, o operador também escreve…"): the culto's
// messages only (the pedidos are their own tab), as a conversation both
// ways — the operator's on the right in gold, the Equipe's on the left,
// "who · hh:mm" over each — and the composer fixed at the bottom (Enter
// sends). What the operator writes is a ServiceMessage of side "operator"
// written through the store (onWrite), never a network action: the phones
// read it with their next `requests`, labelled "Operador". Every text is
// rendered as plain text.
export default function ChatTab({ c, data, messages, onPrepare, onWrite }) {
    const rows = chatOf(messages || []);
    const listRef = usePinnedList(rows.length);
    const tools = useMessageTools(c, data);
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const send = async () => {
        const fields = operatorChat(text);
        if (!fields || busy) return;
        setBusy(true);
        try { await onWrite(fields); setText(""); } catch (err) { c.say(err?.message || "Não foi possível enviar."); } finally { setBusy(false); }
    };
    return (
        <div className="ped-view">
            {!rows.length
                ? <Empty icon="chat" title="Nenhuma mensagem">O que a equipe escrever pelo celular, com o código da Equipe, aparece aqui. O que você responder vai para os celulares.</Empty>
                : (
                    <div className="ped-list ped-chatlist" ref={listRef} role="log" aria-label="Chat com a equipe">
                        {rows.map((r) => {
                            const op = isOperator(r);
                            return (
                                <div key={r.id} className={`ped-msg ${op ? "is-op" : ""}`}>
                                    <span className="ped-row">
                                        <span className="ped-h">{chatHead(r)}</span>
                                        <span className="ped-x"><TrashBtn r={r} onRemove={tools.remove} /></span>
                                    </span>
                                    {r.text && !(r.link && r.text === "Vídeo do YouTube") && <span className="ped-t">{r.text}</span>}
                                    <YouTubeCard r={r} onPrepare={onPrepare} onSave={tools.saveLink} />
                                </div>
                            );
                        })}
                    </div>
                )}
            <form className="ped-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <input className="kx-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={PEDIDO_MAX.chat} placeholder="Escreva uma mensagem…" aria-label="Mensagem para a equipe" spellCheck
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <Btn kind="brand" type="submit" disabled={!text.trim() || busy} title="Enviar · Enter" aria-label="Enviar"><Icon name="send" /></Btn>
            </form>
        </div>
    );
}
