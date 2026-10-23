import React, { useState } from "react";
import Icon from "@/components/console/Icon";
import { canRun, nowBarInfo } from "@/lib/network/remoteView";
import { Cmd, Sheet } from "./parts";
import { FollowCard, PlayerCard, ScreenTrio, SendNext, SlideCards, TimerCard } from "./liveParts";

// The No ar bar (Rodada Q, owner's mark S5 = A): under every tab but Ao
// vivo, only with something on air. ⏮ · the slide on air with its place
// and the next under it · ⏭; a tap on the middle opens Ao vivo's controls
// in a sheet (Encerrar tudo stays on Ao vivo, held).
export default function NowBar({ live, state, caps, c }) {
    const [open, setOpen] = useState(false);
    const n = nowBarInfo(live);
    if (!n) return null;
    const arrows = n.arrows && canRun(caps, "next");
    const close = () => setOpen(false);
    return (
        <>
            <div className={`rm-now is-${n.tone}`}>
                {arrows && <Cmd c={c} k="now-prev" action="prev" className="rm-now-arr" label="Slide anterior" quiet><Icon name="chevron-left" size={24} /></Cmd>}
                <button type="button" className="rm-now-mid" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`No ar: ${n.now}${n.pos ? `, ${n.pos}` : ""}. Abrir os controles`}>
                    <span className="rm-now-a"><span className="rm-dot" aria-hidden="true" /><span className="rm-now-t">{n.now}</span>{n.pos && <em>{n.pos}</em>}</span>
                    {n.next && <span className="rm-now-b">{n.next}</span>}
                </button>
                {arrows && <Cmd c={c} k="now-next" action="next" className="rm-now-arr" label={n.reveal ? "Revelar" : "Próximo slide"} quiet><Icon name="chevron-right" size={24} /></Cmd>}
            </div>
            {open && (
                <Sheet title="No ar" onClose={close}>
                    <SlideCards content={live?.content || null} caps={caps} c={c} />
                    <SendNext state={state} caps={caps} c={c} />
                    <ScreenTrio live={live} c={c} />
                    <PlayerCard live={live} state={state} caps={caps} c={c} />
                    <FollowCard content={live?.content || null} caps={caps} c={c} />
                    <TimerCard live={live} caps={caps} c={c} />
                    <button type="button" className="rm-b is-sm" onClick={close}>Fechar</button>
                </Sheet>
            )}
        </>
    );
}
